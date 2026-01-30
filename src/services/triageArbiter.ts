import { AssessmentProfile } from '../types/triage';
import { isMaternalContext, normalizeAge } from '../utils/clinicalUtils';
import { normalizeNumericValue } from '../utils/stringUtils';
import { normalizeSlot } from '../utils/aiUtils';

export type TriageSignal =
  | 'TERMINATE'
  | 'CONTINUE'
  | 'RESOLVE_AMBIGUITY'
  | 'PRIORITIZE_RED_FLAGS'
  | 'REQUIRE_CLARIFICATION'
  | 'DRILL_DOWN';

export interface ArbiterResult {
  signal: TriageSignal;
  reason?: string;
  nextSteps?: string[];
  needs_reset?: boolean;
  saturation_count?: number;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export class TriageArbiter {
  private static readonly MIN_TURNS_SIMPLE = 4;
  private static readonly MIN_TURNS_COMPLEX = 7;
  private static readonly MAX_QUESTIONS_HARD_CAP = 12;
  private static stableTurnCount = 0;

  private static readonly FEVER_REQUIRED_SLOTS: (keyof AssessmentProfile)[] = [
    'duration',
    'fever_duration',
    'fever_max_temp',
    'fever_antipyretic_response',
    'fever_hydration_ability',
    'fever_functional_status',
    'fever_red_flags_checklist',
  ];

  /**
   * Evaluates the current state of the assessment and returns a control signal.
   * Centralizes the "Safety-First" triage philosophy.
   */
  public static evaluateAssessmentState(
    history: ChatHistoryItem[],
    profile: AssessmentProfile,
    currentTurn: number,
    totalPlannedQuestions: number,
    remainingQuestions: { tier?: number; is_red_flag?: boolean }[] = [],
    previousProfile?: AssessmentProfile,
    clarificationAttempts: number = 0,
  ): ArbiterResult {
    // Calculate new saturation state
    const isSaturated = this.calculateSaturation(
      profile,
      previousProfile,
      profile.triage_readiness_score ?? 0,
    );
    const newSaturationCount = this.stableTurnCount;

    // --- 0. HARD CAP OVERRIDE ---
    if (currentTurn >= this.MAX_QUESTIONS_HARD_CAP) {
      return {
        signal: 'TERMINATE',
        reason: `HARD CAP REACHED: Terminating at ${currentTurn} turns to prevent assessment fatigue. Finalizing with conservative guidance.`,
        saturation_count: newSaturationCount,
      };
    }

    // --- 0b. VULNERABLE GROUP DETECTION ---
    const isVulnerable = this.isVulnerableGroup(history, profile);
    if (isVulnerable && !profile.is_vulnerable) {
      profile.is_vulnerable = true;
    }

    // --- 1. AMBIGUOUS DENIAL SAFEGUARD (Force Clarification) ---
    // If the user issued a denial but the confidence is low (ambiguous phrasing), force verification.
    // Loop Protection: Max 2 clarification attempts.
    if (profile.denial_confidence === 'low') {
      if (clarificationAttempts < 2) {
        return {
          signal: 'REQUIRE_CLARIFICATION',
          reason: 'SAFETY GUARD: Low confidence denial detected. Verification required.',
          nextSteps: ['Execute mandatory re-verification protocol'],
          saturation_count: newSaturationCount,
        };
      } else {
        console.warn(
          '[TriageArbiter] Clarification attempts exhausted. Treating ambiguity as potential risk.',
        );
        // Fallback: Proceed, but the low confidence score will likely force a conservative recommendation later.
      }
    }

    // --- 2. MANDATORY SAFETY GATE: RED FLAGS ---
    if (profile.red_flags_resolved === false) {
      const hasUnattemptedRedFlags = remainingQuestions.some((q) => q.is_red_flag);
      if (hasUnattemptedRedFlags) {
        return {
          signal: 'PRIORITIZE_RED_FLAGS',
          reason: 'MANDATORY SAFETY GATE: Unresolved red flags detected.',
          nextSteps: ['Complete all red-flag verification questions immediately'],
          saturation_count: newSaturationCount,
        };
      }
      return {
        signal: 'CONTINUE',
        reason: 'MANDATORY SAFETY GATE: Red flags remain unresolved',
        nextSteps: ['Confirm denial or presence of critical red flags'],
        saturation_count: newSaturationCount,
      };
    }

    // --- 3. CLINICAL SANITY & FRICTION OVERRIDE (Early Intervention) ---
    const sanityResult = this.evaluateClinicalSanity(profile, remainingQuestions, previousProfile);

    // IMMEDIATE INTERVENTION: These signals override the turn floor because they require specific active resolution.
    if (
      sanityResult.signal === 'RESOLVE_AMBIGUITY' ||
      sanityResult.signal === 'REQUIRE_CLARIFICATION' ||
      sanityResult.signal === 'DRILL_DOWN'
    ) {
      return { ...sanityResult, saturation_count: newSaturationCount };
    }

    // --- 2b. CLINICAL SATURATION (Explicit Early Termination) ---
    // If we have reached full readiness (1.0) and the profile has been stable (no new info)
    // for 2 consecutive turns, we can safely terminate even if below the turn floor.
    // The caller treats TERMINATE as a hard stop and proceeds to final recommendation.
    if (isSaturated) {
      return {
        signal: 'TERMINATE',
        reason: 'CLINICAL SATURATION: Readiness 1.0 and stability maintained for 2+ turns.',
        saturation_count: newSaturationCount,
      };
    }

    // --- 3. DETERMINISTIC TURN FLOORS (Non-Overridable for Termination) ---
    const isComplexCategory =
      profile.symptom_category === 'complex' ||
      profile.symptom_category === 'critical' ||
      profile.is_complex_case ||
      profile.is_vulnerable;
    const minTurnsRequired = isComplexCategory ? this.MIN_TURNS_COMPLEX : this.MIN_TURNS_SIMPLE;

    if (currentTurn < minTurnsRequired) {
      return {
        signal: 'CONTINUE',
        reason: `GUARDRAIL: Turn floor not reached for ${isComplexCategory ? (profile.is_vulnerable ? 'vulnerable' : 'complex') : 'simple'} category. (Current: ${currentTurn}, Required: ${minTurnsRequired})`,
        nextSteps: ['Continue gathering clinical context'],
        saturation_count: newSaturationCount,
      };
    }

    // --- 4. RESUME SANITY CHECK (Soft Continue) ---
    // If we are above the floor, we must now respect "soft" continue signals (e.g., missing progression)
    // that were held back to allow the floor check to take precedence if needed.
    if (sanityResult.signal !== 'TERMINATE') {
      return { ...sanityResult, saturation_count: newSaturationCount };
    }

    // --- 5. TIER 3 EXHAUSTION FOR COMPLEX/FRICTION CASES ---
    if (isComplexCategory || profile.clinical_friction_detected) {
      const hasUnattemptedTier3 = remainingQuestions.some((q) => q.tier === 3);
      if (hasUnattemptedTier3) {
        return {
          signal: 'CONTINUE',
          reason: `DEPTH FAIL: Tier 3 exhaustion required for ${isComplexCategory ? 'complex case' : 'clinical friction'}.`,
          nextSteps: ['Complete all remaining Tier 3 ambiguity resolution questions'],
          saturation_count: newSaturationCount,
        };
      }
    }

    // --- 6. DATA COMPLETENESS GATE ---
    const completenessResult = this.evaluateDataCompleteness(profile);

    if (
      completenessResult.signal === 'TERMINATE' &&
      profile.triage_readiness_score === 1.0 &&
      profile.internal_inconsistency_detected
    ) {
      return {
        signal: 'REQUIRE_CLARIFICATION',
        reason:
          'RESTRICTION: High readiness with contradictory history detected (False Positive Completeness)',
        needs_reset: true,
        nextSteps: ['Perform system-led reset of progress', 'Re-verify symptom timeline'],
        saturation_count: newSaturationCount,
      };
    }

    if (completenessResult.signal !== 'TERMINATE') {
      return { ...completenessResult, saturation_count: newSaturationCount };
    }

    // --- 7. TERMINATION EXECUTION ---
    const isExhausted = currentTurn >= totalPlannedQuestions;

    if (isExhausted || currentTurn >= 10) {
      // Safety ceiling increased to allow for Turn 7 floor
      return {
        signal: 'TERMINATE',
        reason: 'CLINICAL CLOSURE: Case is complete, coherent, and safety-verified.',
        saturation_count: newSaturationCount,
      };
    }

    return {
      signal: 'CONTINUE',
      reason: 'Continuing planned path to maximize clinical data density',
      saturation_count: newSaturationCount,
    };
  }

  private static calculateSaturation(
    current: AssessmentProfile,
    previous: AssessmentProfile | undefined,
    readinessScore: number,
  ): boolean {
    // Saturation logic:
    // - Requires 2 consecutive stable turns (not 1) to confirm the profile has settled
    //   and avoid terminating during mid-correction.
    // - Requires readinessScore >= 1.0 to ensure completeness; stability alone is not enough.
    // - Resets when the clinical data changes or when starting a new session.
    if (!previous) {
      this.stableTurnCount = 0;
      return false;
    }

    // Semantic comparison reduces false negatives when numeric slots are expressed differently
    // (e.g., "seven" vs "7/10"), keeping stability detection accurate across turns.
    const slotsIdentical = this.areClinicalSlotsIdentical(current, previous);

    // Require 2 consecutive stable turns to confirm the state is actually stable,
    // avoiding premature exit if the user is mid-correction.
    const stableCount = slotsIdentical ? this.stableTurnCount + 1 : 0;
    this.stableTurnCount = stableCount;

    // Saturation requires both completeness (readiness 1.0) and stability (>= 2 turns)
    // so we do not exit early with missing data or while new info is still arriving.
    const isSaturated = readinessScore >= 1.0 && stableCount >= 2;

    if (isSaturated) {
      console.log('Clinical saturation reached:', {
        readinessScore,
        stableTurns: stableCount,
        profile: current,
      });
    }

    return isSaturated;
  }

  private static areClinicalSlotsIdentical(a: AssessmentProfile, b: AssessmentProfile): boolean {
    // Critical clinical slots
    if (!this.semanticNumericCompare('age', a.age, b.age)) return false;
    if (!this.strictTextCompare('duration', a.duration, b.duration)) return false;
    if (!this.semanticNumericCompare('severity', a.severity, b.severity)) return false;
    if (!this.strictTextCompare('progression', a.progression, b.progression)) return false;

    // Safety & Category slots
    if (
      !this.semanticDenialCompare('red_flag_denials', a.red_flag_denials, b.red_flag_denials, {
        allowNone: true,
      })
    )
      return false;
    if (a.red_flags_resolved !== b.red_flags_resolved) return false;
    if (a.symptom_category !== b.symptom_category) return false;

    // Complexity flags
    if (a.is_complex_case !== b.is_complex_case) return false;
    if (a.is_vulnerable !== b.is_vulnerable) return false;

    return true;
  }

  private static semanticNumericCompare(
    field: string,
    valueA?: string | null,
    valueB?: string | null,
  ): boolean {
    const left = normalizeSlot(valueA);
    const right = normalizeSlot(valueB);

    if (!left && !right) return true;
    if (!left || !right) return false;

    const normalizedLeft = normalizeNumericValue(left);
    const normalizedRight = normalizeNumericValue(right);

    if (normalizedLeft !== null && normalizedRight !== null) {
      const match = normalizedLeft === normalizedRight;
      console.debug('[TriageArbiter] Semantic compare', {
        field,
        normalizedLeft,
        normalizedRight,
        match,
        mode: 'numeric',
      });
      return match;
    }

    const textMatch = left.trim().toLowerCase() === right.trim().toLowerCase();
    console.debug('[TriageArbiter] Semantic compare', {
      field,
      left,
      right,
      match: textMatch,
      mode: 'text_fallback',
    });
    return textMatch;
  }

  private static strictTextCompare(
    field: string,
    valueA?: string | null,
    valueB?: string | null,
    options: { allowNone?: boolean } = {},
  ): boolean {
    const left = normalizeSlot(valueA, options);
    const right = normalizeSlot(valueB, options);
    const match = left === right;
    if (!match) {
      console.debug('[TriageArbiter] Strict compare', { field, left, right, match });
    }
    return match;
  }

  private static semanticDenialCompare(
    field: string,
    valueA?: string | null,
    valueB?: string | null,
    options: { allowNone?: boolean } = {},
  ): boolean {
    const left = normalizeSlot(valueA, options);
    const right = normalizeSlot(valueB, options);

    if (left === right) return true;
    if (!left || !right) return false;

    // Helper to tokenize and normalize denial strings
    const tokenize = (text: string) => {
      return new Set(
        text
          .toLowerCase()
          .replace(/[.,;]/g, ' ')
          .split(/\s+|(?:,\s*)|(?:and\s+)|(?:or\s+)/)
          .map((s) => s.trim())
          .filter((s) => s.length > 2 && s !== 'denies' && s !== 'reports' && s !== 'symptoms'),
      );
    };

    const setA = tokenize(left);
    const setB = tokenize(right);

    // If both sets are identical, they match
    if (setA.size === setB.size && [...setA].every((x) => setB.has(x))) {
      return true;
    }

    console.debug('[TriageArbiter] Semantic Denial mismatch', {
      field,
      left,
      right,
      tokensA: [...setA],
      tokensB: [...setB],
    });
    return false;
  }

  /**
   * Stage A: Verify presence of required slots and base readiness.
   */
  private static evaluateDataCompleteness(profile: AssessmentProfile): ArbiterResult {
    const missingFields: string[] = [];

    if (!normalizeSlot(profile.age)) missingFields.push('Age');
    if (!normalizeSlot(profile.duration)) missingFields.push('Duration');
    if (!normalizeSlot(profile.severity)) missingFields.push('Severity');
    if (!normalizeSlot(profile.red_flag_denials, { allowNone: true }))
      missingFields.push('Red Flag Assessment');

    if (missingFields.length > 0) {
      return {
        signal: 'CONTINUE',
        reason: `COMPLETENESS FAIL: Missing critical slots [${missingFields.join(', ')}]`,
      };
    }

    if (!profile.red_flags_resolved) {
      return {
        signal: 'CONTINUE',
        reason: 'SAFETY FLOOR VIOLATION: Red flags not explicitly resolved. Termination blocked.',
      };
    }

    // --- PHASE 4: FEVER OPTIMIZATION GATE ---
    const isFever = this.isFeverCase(profile);
    if (isFever) {
      const { missing, complete } = this.areFeverSlotsComplete(profile);
      const contradictionScore = profile.internal_consistency_score ?? 1;
      const lowContradiction = contradictionScore > 0.85;
      
      // Fever-specific red flag check: Ensure checklist exists and hasn't flagged an emergency
      // (This assumes the checklist content itself is negative if red_flags_resolved is true)
      if (complete && lowContradiction) {
        return { 
          signal: 'TERMINATE',
          reason: 'FEVER OPTIMIZATION: Required fever slots complete with low clinical contradiction.'
        };
      }
      
      if (!complete) {
        return {
          signal: 'CONTINUE',
          reason: `FEVER DEPTH FAIL: Missing required fever slots [${missing.join(', ')}]`,
        };
      }
    }

    if ((profile.triage_readiness_score ?? 0) < 0.9) {
      return {
        signal: 'CONTINUE',
        reason: `READINESS FAIL: Triage readiness score ${profile.triage_readiness_score} below 0.90 threshold`,
      };
    }

    return { signal: 'TERMINATE' };
  }

  private static isFeverCase(profile: AssessmentProfile): boolean {
    const summary = (profile.summary || '').toLowerCase();
    const keywords = ['fever', 'lagnat', 'mainit ang katawan', 'chills', 'flu'];
    return keywords.some(k => summary.includes(k)) || !!profile.fever_duration || !!profile.fever_max_temp;
  }

  private static areFeverSlotsComplete(profile: AssessmentProfile): { missing: string[], complete: boolean } {
    const missing: string[] = [];
    for (const slot of this.FEVER_REQUIRED_SLOTS) {
      if (!normalizeSlot(profile[slot] as string, { allowNone: true })) {
        missing.push(slot);
      }
    }
    return { missing, complete: missing.length === 0 };
  }

  /**
   * Stage B: Evaluate internal medical consistency and clarity.
   */
  private static evaluateClinicalSanity(
    profile: AssessmentProfile,
    remainingQuestions: { tier?: number }[],
    previousProfile?: AssessmentProfile,
  ): ArbiterResult {
    // 0. CRITICAL ESCALATION (Drill Down)
    // If the category escalated to CRITICAL mid-stream, we must interrupt to drill down immediately.
    if (
      previousProfile &&
      previousProfile.symptom_category !== 'critical' &&
      profile.symptom_category === 'critical'
    ) {
      return {
        signal: 'DRILL_DOWN',
        reason: 'CRITICALITY ESCALATION: Symptom category escalated to CRITICAL.',
        nextSteps: ['Immediate critical drill-down'],
      };
    }

    // 1. NON-NEGOTIABLE: Ambiguity Safeguard
    // Allow termination if ambiguity is detected but the user has explicitly accepted uncertainty.
    if (profile.ambiguity_detected && !profile.uncertainty_accepted) {
      return {
        signal: 'RESOLVE_AMBIGUITY',
        reason: 'COHERENCE FAIL: Unresolved clinical ambiguity detected. Termination blocked.',
        nextSteps: ['Clarify anatomical locations or temporal relations'],
      };
    }

    // 2. CLINICAL FRICTION: Contradictory reports
    if (profile.clinical_friction_detected) {
      return {
        signal: 'DRILL_DOWN',
        reason: `COHERENCE FAIL: Clinical friction detected. Details: ${profile.clinical_friction_details}`,
        nextSteps: ['Re-verify contradictory symptoms', 'Address mixed-signal reports'],
      };
    }

    // 3. COHERENCE: Internal Consistency / Tier 3 Requirement
    const isInconsistent =
      profile.internal_inconsistency_detected || (profile.internal_consistency_score ?? 1) < 0.85;

    if (isInconsistent) {
      const hasUnattemptedTier3 = remainingQuestions.some((q) => q.tier === 3);
      if (hasUnattemptedTier3) {
        return {
          signal: 'CONTINUE',
          reason:
            'COHERENCE FAIL: Inconsistency detected. Blocking termination until Tier 3 systematic rule-outs are exhausted.',
          nextSteps: ['Attempt all Tier 3 ambiguity-resolution questions'],
        };
      }

      if ((profile.internal_consistency_score ?? 1) < 0.7) {
        return {
          signal: 'REQUIRE_CLARIFICATION',
          reason: 'COHERENCE FAIL: Severe clinical contradiction.',
          needs_reset: true,
          nextSteps: ['Re-baseline symptom report'],
        };
      }
    }

    // 4. CLINICAL CONTEXT: Progression Check
    if (!normalizeSlot(profile.progression)) {
      return {
        signal: 'CONTINUE',
        reason: 'COHERENCE FAIL: Symptom progression (worsening/improving) is missing.',
      };
    }

    return { signal: 'TERMINATE' };
  }

  private static isVulnerableGroup(
    history: ChatHistoryItem[],
    profile: AssessmentProfile,
  ): boolean {
    const numericAge = normalizeAge(profile.age);
    const isPediatric = numericAge !== null && numericAge < 5;
    const isGeriatric = numericAge !== null && numericAge >= 65;

    const fullText = history.map((h) => h.text).join(' ');
    const isMaternal = isMaternalContext(fullText);

    return isPediatric || isMaternal || isGeriatric || profile.is_vulnerable === true;
  }
}
