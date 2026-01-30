import { AssessmentProfile } from '../types/triage';

/**
 * CLINICAL RATIONALE:
 * Safety-critical fields require high certainty to avoid under-triage.
 * Epistemic hedging (e.g., "maybe", "I think") in these fields indicates
 * that the user is unsure about a life-threatening symptom or core context.
 *
 * DESIGN CHOICE:
 * We use deterministic regex-based detection as a safety filter on top of
 * LLM-based extraction. This prevents the LLM from "hallucinating" a
 * definitive denial when the user actually expressed doubt.
 */

/**
 * CONFIGURATION: Safety-Critical Fields
 * These fields are checked for hedging. If uncertainty is detected,
 * the profile is marked as ambiguous, and clarification is forced.
 */
export const CRITICAL_HEDGING_FIELDS: (keyof AssessmentProfile)[] = [
  'severity', // "Maybe 8/10" -> Prevents calculation of acute distress score.
  'progression', // "I think it's getting worse" -> Unreliable trend for stability.
  'red_flag_denials', // "I don't think so" -> Extremely dangerous if a red flag is present.
  'age', // "Maybe 50" -> Affects pediatric/geriatric safety protocols.
  'duration', // "Possibly 2 days" -> Differentiates between acute and chronic risks.
];

/**
 * REGEX PATTERNS: Epistemic Hedging Detection
 * Categorized by the type of uncertainty expressed.
 */
const HEDGING_PATTERNS = {
  /**
   * Direct Lack of Knowledge:
   * Explicitly states the user does not know the fact.
   */
  LACK_OF_KNOWLEDGE: [
    /\b(i\s+don'?t\s+know)\b/i,
    /\b(i\s+have\s+no\s+idea)\b/i,
    /\b(not\s+sure)\b/i,
    /\b(unsure)\b/i,
    /\b(unclear)\b/i,
    /\b(can'?t\s+say)\b/i,
    /\b(hard\s+to\s+say)\b/i,
    /\b(i\s+don'?t\s+think)\b/i, // Crucial for denials like "I don't think so"
  ],

  /**
   * Probabilistic Language:
   * Implies the information is a guess or possibility rather than a fact.
   */
  PROBABILITY: [
    /\b(maybe)\b/i,
    /\b(possibly)\b/i,
    /\b(probably)\b/i,
    /\b(might\s+be)\b/i,
    /\b(could\s+be)\b/i,
    /\b(chance)\b/i,
    /\b(perhaps)\b/i,
    /\b(daw)\b/i,
    /\b(yata)\b/i,
    /\b(siguro)\b/i,
  ],

  /**
   * Subjective Weak Assertions:
   * Phrases that soften a statement, reducing its medical reliability.
   */
  SUBJECTIVITY: [
    /\b(i\s+think)\b/i,
    /\b(i\s+guess)\b/i,
    /\b(i\s+suppose)\b/i,
    /\b(i\s+believe)\b/i,
    /\b(seems)\b/i,
    /\b(appears)\b/i,
    /\b(looks\s+like)\b/i,
    /\b(feels\s+like)\b/i,
  ],

  /**
   * Vagueness Qualifiers:
   * Qualifiers that make anatomical locations or symptom characteristics vague.
   */
  VAGUENESS: [/\b(sort\s+of)\b/i, /\b(kind\s+of)\b/i, /\b(ish)\b/i],
};

// Flattened list for efficient execution
const ACTIVE_PATTERNS = [
  ...HEDGING_PATTERNS.LACK_OF_KNOWLEDGE,
  ...HEDGING_PATTERNS.PROBABILITY,
  ...HEDGING_PATTERNS.SUBJECTIVITY,
  ...HEDGING_PATTERNS.VAGUENESS,
];

/**
 * detectHedging: Checks a single string for any hedging patterns.
 * @param text The clinical text to validate.
 * @returns The matched phrase if found, otherwise null.
 */
export const detectHedging = (text: string | null | undefined): string | null => {
  if (!text || typeof text !== 'string') return null;

  for (const pattern of ACTIVE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
};

export interface HedgingAnalysisResult {
  hasHedging: boolean;
  hedgedFields: Record<string, string>; // fieldName -> detectedPhrase
  isSafe: boolean;
}

/**
 * analyzeProfileForHedging: Validates the entire profile against safety-critical fields.
 */
export const analyzeProfileForHedging = (profile: AssessmentProfile): HedgingAnalysisResult => {
  const hedgedFields: Record<string, string> = {};

  CRITICAL_HEDGING_FIELDS.forEach((field) => {
    const value = profile[field];
    if (typeof value === 'string') {
      const detected = detectHedging(value);
      if (detected) {
        hedgedFields[field as string] = detected;
      }
    }
  });

  const hasHedging = Object.keys(hedgedFields).length > 0;

  return {
    hasHedging,
    hedgedFields,
    isSafe: !hasHedging,
  };
};

/**
 * applyHedgingCorrections: Updates the profile state based on hedging detection.
 *
 * CRITICAL SAFETY LOGIC:
 * 1. If hedging is detected in 'red_flag_denials', the denial is REJECTED.
 *    - 'red_flags_resolved' is set to false.
 *    - 'denial_confidence' is set to 'low'.
 * 2. 'ambiguity_detected' is set to true for any critical hedging.
 * 3. Detailed diagnostics are added to 'clinical_friction_details' for the arbiter.
 */
export const applyHedgingCorrections = (profile: AssessmentProfile): AssessmentProfile => {
  const analysis = analyzeProfileForHedging(profile);

  if (!analysis.hasHedging) {
    return profile;
  }

  const correctedProfile = { ...profile };

  // 1. Mark global ambiguity to trigger the Ambiguity Lock in TriageArbiter
  correctedProfile.ambiguity_detected = true;

  // 2. Specialized handling for Red Flags (Safety Gate #1)
  if (analysis.hedgedFields['red_flag_denials']) {
    correctedProfile.denial_confidence = 'low';
    correctedProfile.red_flags_resolved = false; // Cannot trust a hedged denial
  }

  // 3. Document the rationale for downstream logic (Arbiter/Recommendation)
  const hedgingNote = `[System] Hedging detected in: ${Object.entries(analysis.hedgedFields)
    .map(([k, v]) => `${k} ("${v}")`)
    .join(', ')}`;

  correctedProfile.clinical_friction_details = correctedProfile.clinical_friction_details
    ? `${correctedProfile.clinical_friction_details} | ${hedgingNote}`
    : hedgingNote;

  // Set friction flag to ensure the Arbiter returns RESOLVE_FRICTION or REQUIRE_CLARIFICATION
  correctedProfile.clinical_friction_detected = true;

  return correctedProfile;
};
