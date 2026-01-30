import { AssessmentProfile, AssessmentResponse } from '../types';
import {
  KeywordDetector,
  SegmentAnalysis,
} from './base/KeywordDetector';

// --- KEYWORD CATEGORIES ---

const CARDIAC_KEYWORDS: Record<string, number> = {
  'chest pain': 10,
  'crushing pain': 10,
  'heart attack': 10,
  'chest tightness': 10,
  'blue lips': 10,
  palpitations: 6, // Added as requested
  'irregular heartbeat': 6,

  // Bicolano / Local
  'kulog sa daghan': 10, // chest pain
  'kulog sa dagan': 10, // chest pain (variant)
  'makulog na daghan': 10, // painful chest
  'malipot na ribok': 10, // cold sweat (often cardiac)
  pumitik: 6, // palpitations/throbbing
};

const RESPIRATORY_KEYWORDS: Record<string, number> = {
  'difficulty breathing': 10,
  'shortness of breath': 10,
  'not breathing': 10,
  gasping: 10,
  choking: 10,
  'coughing blood': 10,

  // Bicolano / Local
  hingalo: 10, // gasping for breath / near death
  naghihingalo: 10, // actively dying / gasping
  'dai makahinga': 10, // cannot breathe
  'masakit an hinangos': 10, // difficulty breathing
  'masakit maghinga': 10, // hard to breathe
  pudos: 10, // shortness of breath
  dugi: 10, // choking/foreign object in throat
  bakitog: 10, // difficulty breathing / wheezing
  hapos: 6, // asthma/difficulty breathing
};

const NEURO_KEYWORDS: Record<string, number> = {
  unconscious: 10,
  fainted: 10,
  seizure: 10,
  stroke: 10,
  'slurred speech': 10,
  slurred: 10,
  'sudden weakness': 10,
  'facial drooping': 10,
  drooping: 10,
  'arm weakness': 10,
  'cannot speak': 10,
  confusion: 8,
  'vision loss': 9,
  'sudden blindness': 10,
  'stiff neck': 8,
  headache: 5,
  'blurred vision': 6,
  dizziness: 5,
  dizzy: 5,

  // Bicolano / Local
  nagkukumbulsion: 10, // actively seizing
  kumbulsion: 10, // seizure
  bontog: 10, // seizure/convulsion
  bontogon: 10, // epileptic/seizing
  nadismayo: 10, // fainted
  'nawaran malay': 10, // lost consciousness
  'nawara an malay': 10, // lost consciousness
  'dai makataram': 10, // cannot speak
  ngaut: 10, // slurred speech
  nalulula: 5, // dizzy/vertigo
  ribong: 6, // dizzy/confused
  nalilibog: 5, // confused/disoriented
};

const TRAUMA_KEYWORDS: Record<string, number> = {
  'severe bleeding': 10,
  'severe head injury': 10,
  'severe burns': 10,
  'broken bone': 8,
  'deep wound': 8,
  'electric shock': 10,
  drowning: 10,

  // Bicolano / Local
  nagdudugo: 10, // bleeding
  'dakulang dugo': 10, // heavy bleeding (lit. big blood)
  nalapnos: 8, // burned/scalded
  napaso: 8, // burned
  bari: 8, // broken/fracture
  naglulubog: 10, // drowning
};

const OTHER_EMERGENCY_KEYWORDS: Record<string, number> = {
  // Critical General
  poisoning: 10,
  overdose: 10,
  anaphylaxis: 10,
  'severe allergic reaction': 10,
  'severe abdominal pain': 10,
  'suicide attempt': 10,
  dying: 10,
  'feel like dying': 10,
  'feeling like dying': 10,
  'active labor': 10,
  'water broke': 10,

  // Serious General/GI
  'vomiting blood': 9,
  'black stool': 8,
  'blood in stool': 8,
  'high fever': 5,
  'severe dehydration': 7,
  jaundice: 7,
  'persistent vomiting': 7,
  fever: 4,
  'abdominal pain': 6,
  nausea: 4,

  // Bicolano / Local
  'garo gadan': 10, // feels like dying
  'suka na dugo': 9, // vomiting blood
  'nagsusuka dugo': 9, // vomiting blood
  'nag-udo dugo': 8, // bloody stool
  mangaki: 10, // giving birth
  nagtutubig: 10, // water broke
  nangungulog: 6, // general pain
  'grabeng lagnat': 5, // high fever
  'mainiton na marhay': 5, // very hot/feverish
  nagkakalyo: 6, // stiffening? (context dependent, keeping score)
  'pusi-pusi': 6, // pale/anemic looking
  gadot: 5, // muscle pain/cramps
  'kulog sa tulak': 5, // stomach ache
  'makulog na tulak': 6, // painful stomach
  'nagpapanit an tulak': 7, // peeling stomach (severe pain)
  impacho: 4, // indigestion
  nagluluya: 6, // weak
  maluya: 6, // weak
  lupaypay: 7, // prostrate/very weak
  langkag: 5, // malaise
  kalentura: 5, // fever
};

// --- CONSTANTS ---
const EMERGENCY_SCORE_THRESHOLD = 7; // Scores strictly greater than this trigger emergency level
const MAX_NON_EMERGENCY_SCORE = 7;
const ABSOLUTE_EMERGENCY_THRESHOLD = 10;

// Consolidated map for the base detector
const ALL_EMERGENCY_KEYWORDS: Record<string, number> = {
  ...CARDIAC_KEYWORDS,
  ...RESPIRATORY_KEYWORDS,
  ...NEURO_KEYWORDS,
  ...TRAUMA_KEYWORDS,
  ...OTHER_EMERGENCY_KEYWORDS,
};

// **NEW: Contextual Modifiers**
const VIRAL_INDICATORS = ['cough', 'runny nose', 'nasal congestion', 'sore throat', 'sneezing'];
const DANGER_INDICATORS: Record<string, number> = {
  'stiff neck': 4,
  confusion: 4,
  seizure: 5,
  'difficulty breathing': 5,
  'chest pain': 5,
  unconscious: 5,
  persistent: 1,
  worsening: 1,
};

/**
 * Critical symptom combinations that indicate high risk when occurring together.
 * These are used to upgrade severity when multiple symptoms are present simultaneously.
 */
export const COMBINATION_RISKS = [
  {
    symptoms: ['headache', 'blurred vision'],
    severity: 10,
    reason: 'Neurological or hypertensive crisis',
  },
  {
    symptoms: ['headache', 'stiff neck'],
    severity: 10,
    reason: 'Potential meningitis',
  },
  {
    symptoms: ['chest pain', 'shortness of breath'],
    severity: 10,
    reason: 'Potential cardiac emergency',
  },
  {
    symptoms: ['fever', 'confusion'],
    severity: 10,
    reason: 'Potential sepsis or severe infection',
  },
  {
    symptoms: ['severe abdominal pain', 'dizziness'],
    severity: 10,
    reason: 'Potential internal bleeding or shock',
  },
  {
    symptoms: ['fever', 'stiff neck'],
    severity: 10,
    reason: 'High risk of meningitis',
  },
];

// **NEW: Contextual Exclusions**
const CONTEXTUAL_EXCLUSIONS = [
  'worried about',
  'history of',
  'father had',
  'mother had',
  'brother had',
  'sister had',
  'family history',
  'past history',
  'asking for',
  'just asking',
  'preventing',
  'preventative',
  'risk of',
  'concerned about',
  'thought about',
  'fear of',
  'worried regarding',
  'background of',
];

export interface EmergencyDetectionOptions {
  isUserInput?: boolean;
  historyContext?: string;
  profile?: AssessmentProfile;
  questionId?: string;
  enableExclusions?: boolean;
}

export interface EmergencyDetectionResult {
  isEmergency: boolean;
  score: number;
  matchedKeywords: string[];
  affectedSystems: string[];
  overrideResponse?: AssessmentResponse;
  debugLog: EmergencyDebugLog;
  hasExclusions?: boolean;
  excludedKeywords?: string[];
  medical_justification?: string;
}

export interface EmergencyDebugLog {
  inputText: string;
  sanitizedInput: string;
  filteredSegments: string[];
  rejectedSegments: { text: string; reason: string }[];
  segments: SegmentAnalysis[];
  finalScore: number;
  triggeredEmergency: boolean;
  affectedSystems: string[];
  reasoning: string;
  contextualExclusions?: string[];
  denial_confidence?: string;
}

class EmergencyDetector extends KeywordDetector {
  protected getKeywords(): Record<string, number> {
    return ALL_EMERGENCY_KEYWORDS;
  }

  /**
   * Helper to check if duration suggests chronic/non-acute or acute/urgent
   */
  private parseDurationUrgency(duration: string | null): 'acute' | 'chronic' | 'unknown' {
    if (!duration) return 'unknown';
    const d = duration.toLowerCase();

    // Urgent indicators
    if (
      d.includes('today') ||
      d.includes('hour') ||
      d.includes('just') ||
      d.includes('now') ||
      d.includes('minute')
    )
      return 'acute';

    // Chronic indicators (less likely emergency on their own)
    if (d.includes('week') || d.includes('month') || d.includes('year') || d.includes('long time'))
      return 'chronic';

    // 1-3 days is "acute" but usually not "emergency" unless symptoms are severe
    if (d.includes('day') || d.includes('yesterday')) return 'acute';

    return 'unknown';
  }

  private identifySystems(matchedKeywords: string[]): string[] {
    const systems = new Set<string>();

    matchedKeywords.forEach((keyword) => {
      if (keyword in CARDIAC_KEYWORDS) systems.add('Cardiac');
      if (keyword in RESPIRATORY_KEYWORDS) systems.add('Respiratory');
      if (keyword in NEURO_KEYWORDS) systems.add('Neurological');
      if (keyword in TRAUMA_KEYWORDS) systems.add('Trauma');
      if (keyword in OTHER_EMERGENCY_KEYWORDS) systems.add('Other');
    });

    return Array.from(systems);
  }

  private hasExclusionContext(contextWindow: string): boolean {
    const lowerWindow = contextWindow.toLowerCase();
    return CONTEXTUAL_EXCLUSIONS.some((pattern) => lowerWindow.includes(pattern));
  }

  public evaluate(text: string, options: EmergencyDetectionOptions = {}): EmergencyDetectionResult {
    console.log(`\n=== EMERGENCY DETECTION START ===`);
    console.log(`Input: "${text.substring(0, 100)}..."`);
    console.log(`Input Type: ${options.isUserInput === false ? 'SYSTEM/METADATA' : 'USER INPUT'}`);

    const { profile, questionId } = options;

    // Use base class detection
    const detection = this.detect(text, options.isUserInput);
    const { sanitized, rejected, segments: segmentAnalyses } = detection;
    let { score, matchedKeywords } = detection;

    // --- APPLY CONTEXTUAL EXCLUSIONS ---
    const excludedKeywords: string[] = [];
    if (options.enableExclusions !== false && options.isUserInput !== false) {
      for (const segment of segmentAnalyses) {
        const originalCount = segment.activeMatches.length;
        segment.activeMatches = segment.activeMatches.filter((match) => {
          if (this.hasExclusionContext(match.contextWindow)) {
            excludedKeywords.push(match.keyword);
            segment.suppressedMatches.push(match);
            return false;
          }
          return true;
        });

        if (segment.activeMatches.length !== originalCount) {
          segment.maxScore =
            segment.activeMatches.length > 0
              ? Math.max(...segment.activeMatches.map((m) => m.severity))
              : 0;
        }
      }

      // Recalculate global score and matched keywords based on filtered segments
      matchedKeywords = Array.from(
        new Set(segmentAnalyses.flatMap((s) => s.activeMatches.map((m) => m.keyword))),
      );
      score = segmentAnalyses.length > 0 ? Math.max(...segmentAnalyses.map((s) => s.maxScore)) : 0;

      if (excludedKeywords.length > 0) {
        console.log(
          `  [Exclusions] Removed keywords due to context: ${excludedKeywords.join(', ')}`,
        );
      }
    }

    const affectedSystems = this.identifySystems(matchedKeywords);

    console.log(`\nSanitization:`);
    if (rejected.length > 0) {
      console.log(`  Rejected ${rejected.length} segments:`);
    }
    console.log(`  Sanitized input: "${sanitized}"`);

    // If explicitly marked as non-user input, skip analysis
    if (options.isUserInput === false) {
      const debugLog: EmergencyDebugLog = {
        inputText: text,
        sanitizedInput: sanitized,
        filteredSegments: [],
        rejectedSegments: rejected,
        segments: [],
        finalScore: 0,
        triggeredEmergency: false,
        affectedSystems: [],
        reasoning: 'Input marked as system-generated - skipped emergency analysis',
      };

      return {
        isEmergency: false,
        score: 0,
        matchedKeywords: [],
        affectedSystems: [],
        debugLog,
      };
    }

        // --- CONTEXT-AWARE SCORE ADJUSTMENT ---

        let finalScore = score;

        const reasoningParts: string[] = [];

    

        // Check if we have an absolute emergency (10/10)

        const hasAbsoluteEmergency = matchedKeywords.some(

          (k) => ALL_EMERGENCY_KEYWORDS[k] === ABSOLUTE_EMERGENCY_THRESHOLD,

        );

    

        if (!hasAbsoluteEmergency && finalScore > 0) {

          let scoreModifier = 0;

    

          // 1. Danger Indicators (Multipliers/Adders)

          const activeDanger = Object.keys(DANGER_INDICATORS).filter((dk) => {

            // Find segment containing this danger indicator

            const segment = segmentAnalyses.find((s) => s.text.toLowerCase().includes(dk));

            if (!segment) return false;

    

            // If it's a keyword match in this segment, check if it was suppressed (negated)

            const suppressed = segment.suppressedMatches.some((m) =>

              m.keyword.toLowerCase().includes(dk),

            );

            if (suppressed) return false;

    

            return true;

          });

    

          activeDanger.forEach((dk) => {

            scoreModifier += DANGER_INDICATORS[dk];

            reasoningParts.push(`Danger indicator (+${DANGER_INDICATORS[dk]}): ${dk}.`);

          });

    

          // 2. Viral Indicators (De-escalation)

          // Only de-escalate if the primary symptoms are "Serious" but not "Absolute"

          const hasViralSymptoms = VIRAL_INDICATORS.some((vk) => sanitized.toLowerCase().includes(vk));

          const isRedFlagQuestion = questionId === 'red_flags' || questionId === 'q_emergency_signs';

    

                if (hasViralSymptoms && finalScore <= MAX_NON_EMERGENCY_SCORE && !isRedFlagQuestion) {

    

                  scoreModifier -= 2;

    

                  reasoningParts.push('Viral indicators detected (-2): cough/runny nose/cold symptoms.');

    

                }

    

                // 3. Duration/Profile Adjustments

    

                const urgency = this.parseDurationUrgency(profile?.duration || null);

    

                if (urgency === 'chronic' && finalScore <= EMERGENCY_SCORE_THRESHOLD) {

    

                  scoreModifier += 1; // Chronic is serious but often less acute

    

                  reasoningParts.push('Chronic duration (+1).');

    

                }

    

          const initialScore = finalScore;

          finalScore = Math.max(0, Math.min(ABSOLUTE_EMERGENCY_THRESHOLD, finalScore + scoreModifier));

    

          if (finalScore !== initialScore) {

            console.log(

              `  [Scoring] Modified score from ${initialScore} to ${finalScore} based on context.`,

            );

          }

        } else if (hasAbsoluteEmergency) {

          finalScore = ABSOLUTE_EMERGENCY_THRESHOLD;

          reasoningParts.push('Absolute emergency detected.');

        }

    

        // 4. System Overlap Logic

        if (affectedSystems.includes('Cardiac') && affectedSystems.includes('Respiratory')) {

          finalScore = Math.min(ABSOLUTE_EMERGENCY_THRESHOLD, finalScore + 3);

          reasoningParts.push('Multi-system risk (Cardiac + Respiratory).');

        }

    

        if (affectedSystems.includes('Neurological') && affectedSystems.includes('Trauma')) {

          finalScore = ABSOLUTE_EMERGENCY_THRESHOLD;

          reasoningParts.push('Critical multi-system risk (Neuro + Trauma).');

        }

    

        // 5. Combination Risks (Fallback/Secondary check)

        let combinationReason = '';

    

        for (const risk of COMBINATION_RISKS) {

          const hasAllSymptoms = risk.symptoms.every((s) => matchedKeywords.includes(s));

          if (hasAllSymptoms) {

            finalScore = Math.max(finalScore, risk.severity);

            combinationReason = risk.reason;

            reasoningParts.push(

              `Risk combination detected: ${risk.symptoms.join(' + ')} (${risk.reason}).`,

            );

            break; // Prioritize the first high-risk combination found

          }

        }

    

        // 6. Safety Check: If AI marked case as complex/critical, we slightly weight the score up,

        // but if red flags are RESOLVED/DENIED, we never force an emergency just based on serious keywords.

                if (

                  profile?.symptom_category === 'critical' &&

                  finalScore <= EMERGENCY_SCORE_THRESHOLD &&

                  !hasAbsoluteEmergency

                ) {

                  // AI thinks it's critical, but detector didn't find absolute keywords.

                  // We might upgrade to 8 if there are serious keywords.

                  if (finalScore >= 6) {

                    finalScore = EMERGENCY_SCORE_THRESHOLD + 1;

                    reasoningParts.push('Upgraded based on AI category assessment.');

                  }

                }

    

        let isEmergency = finalScore > EMERGENCY_SCORE_THRESHOLD;

    

        // --- AUTHORITY ENFORCEMENT: Profile Constraints ---

        // If red flags are explicitly resolved and DENIED, block Emergency escalation

        // unless there is an absolute (10/10) emergency keyword detected in user input.

        if (profile?.red_flags_resolved === true) {

          const denials = (profile.red_flag_denials || '').toLowerCase();

    

          // 1. Check for explicit denial prefixes (safeguards)

          const explicitDenialPrefixes = [

            'no',

            'none',

            'wala',

            'hindi',

            'dae',

            'dai',

            'wara',

            'nothing',

            'bako',

          ];

          const isExplicitDenial = explicitDenialPrefixes.some(

            (prefix) =>

              denials === prefix ||

              denials.startsWith(`${prefix} `) ||

              denials.startsWith(`${prefix},`) ||

              denials.startsWith(`${prefix}.`),

          );

    

          // 2. Strengthened validation using isNegated for any matched keywords

          const areKeywordsNegated =

            matchedKeywords.length > 0 &&

            matchedKeywords.every((k) => this.isNegated(denials, k).negated);

    

          const hasValidatedDenial = isExplicitDenial || areKeywordsNegated;

    

          if (hasValidatedDenial && isEmergency && !hasAbsoluteEmergency) {

            console.log(

              '  [Authority] Emergency blocked: Red flags were explicitly denied in structured profile.',

            );

            isEmergency = false;

            finalScore = MAX_NON_EMERGENCY_SCORE; // Cap at maximum non-emergency score

            reasoningParts.push(

              `Authority block: Red flags denied in profile (Explicit: ${isExplicitDenial}, Negated: ${areKeywordsNegated}, Confidence: ${profile.denial_confidence || 'unknown'}). Capping at non-emergency.`,

            );

          }

        }

    // Build reasoning
    let reasoning = '';
    if (isEmergency) {
      reasoning = `Emergency detected (score ${finalScore}/10). Symptoms: ${matchedKeywords.join(', ')}.`;
      if (affectedSystems.length > 0) reasoning += ` Systems: ${affectedSystems.join(', ')}.`;
      if (combinationReason) reasoning += ` RISK: ${combinationReason}.`;
    } else {
      reasoning =
        matchedKeywords.length > 0
          ? `Non-emergency (score ${finalScore}/10). Symptoms: ${matchedKeywords.join(', ')}.`
          : `No emergency symptoms detected.`;
    }

    if (reasoningParts.length > 0) {
      reasoning += ` [Context: ${reasoningParts.join(' ')}]`;
    }

    // Build medical justification (User-facing, simplified)
    const symptomsList = matchedKeywords.join(', ');
    const contextList = reasoningParts
      .map((part) =>
        part
          .replace(
            /Danger indicator \(\+\d+\): |Viral indicators detected \(-\d+\): |Risk combination detected: |Chronic duration \(\+\d+\)\.?/g,
            '',
          )
          .trim(),
      )
      .filter((part) => part.length > 0)
      .join('; ');

    const medical_justification =
      matchedKeywords.length > 0
        ? `${symptomsList}${contextList ? `. ${contextList}` : ''}`
        : 'No specific emergency signs detected.';

    console.log(`\n--- FINAL RESULT ---`);
    console.log(`Score: ${finalScore}/10 | Emergency: ${isEmergency ? 'YES' : 'NO'}`);
    console.log(`Systems: ${affectedSystems.join(', ')}`);
    console.log(`Reasoning: ${reasoning}`);
    console.log(`Medical Justification: ${medical_justification}`);
    console.log(`=== EMERGENCY DETECTION END ===\n`);

    const debugLog: EmergencyDebugLog = {
      inputText: text,
      sanitizedInput: sanitized,
      filteredSegments: this.tokenizeSentences(sanitized.toLowerCase()),
      rejectedSegments: rejected,
      segments: segmentAnalyses,
      finalScore,
      triggeredEmergency: isEmergency,
      affectedSystems,
      reasoning,
      contextualExclusions: excludedKeywords,
      denial_confidence: profile?.denial_confidence,
    };

    let overrideResponse: AssessmentResponse | undefined;

    if (isEmergency) {
      const advice = combinationReason
        ? `CRITICAL: High risk combination detected (${combinationReason}). Go to the nearest emergency room immediately.`
        : 'CRITICAL: Potential life-threatening condition detected. Go to the nearest emergency room or call emergency services immediately.';

      overrideResponse = {
        recommended_level: 'emergency',
        user_advice: advice,
        clinical_soap: `S: Patient reports ${matchedKeywords.join(', ')}. O: Emergency keywords detected (${affectedSystems.join(', ')})${combinationReason ? ` - Risk: ${combinationReason}` : ''}. A: Potential life-threatening condition. P: Immediate ED referral.`,
        key_concerns: matchedKeywords.map((k) => `Urgent symptom: ${k}`),
        critical_warnings: ['Immediate medical attention required', 'Do not delay care'],
        relevant_services: ['Emergency'],
        red_flags: matchedKeywords,
        follow_up_questions: [],
        triage_logic: {
          original_level: 'emergency',
          final_level: 'emergency',
          adjustments: [
            {
              from: 'emergency',
              to: 'emergency',
              rule: affectedSystems.includes('Cardiac')
                ? 'SYSTEM_BASED_LOCK_CARDIAC'
                : 'RED_FLAG_UPGRADE',
              reason:
                combinationReason ||
                `Emergency keyword match: ${matchedKeywords.join(', ') || 'unknown reason'}`,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
    }

    return {
      isEmergency,
      score: finalScore,
      matchedKeywords,
      affectedSystems,
      overrideResponse,
      debugLog,
      hasExclusions: excludedKeywords.length > 0,
      excludedKeywords,
      medical_justification,
    };
  }
}

// Singleton instance
const detector = new EmergencyDetector();

// Export wrapper function to maintain API compatibility
export const detectEmergency = (
  text: string,
  options: EmergencyDetectionOptions = {},
): EmergencyDetectionResult => {
  return detector.evaluate(text, options);
};

// Re-export helper for backward compatibility/testing if needed
export const tokenizeSentences = (text: string): string[] => {
  return detector.tokenizeSentences(text);
};

export const isNegated = (
  segment: string,
  keyword: string,
): { negated: boolean; hasAffirmation: boolean; contextWindow: string } => {
  return detector.isNegated(segment, keyword);
};
