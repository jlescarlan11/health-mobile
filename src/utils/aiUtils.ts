import { AssessmentQuestion, SYSTEM_LOCK_KEYWORD_MAP } from '../types/triage';
import { normalizeNumericValue } from './stringUtils';
import { DEFAULT_RED_FLAG_QUESTION } from '../constants/clinical';

/**
 * Normalizes a slot value by converting "semantically null" strings into actual null values.
 *
 * @param value - The slot value to check (string, null, or undefined).
 * @param options - Configuration options.
 * @param options.allowNone - If true, 'none' is considered a valid value and NOT normalized to null.
 * @returns The original string if valid, or null if it matches a null-equivalent indicator.
 */
export function normalizeSlot(
  value: any,
  options: { allowNone?: boolean } = {},
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value);
  const trimmed = stringValue.trim();
  if (trimmed === '') {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const nullIndicators = ['null', 'n/a', 'unknown', 'not mentioned', 'unsure'];

  if (!options.allowNone) {
    nullIndicators.push('none');
  }

  if (nullIndicators.includes(lower)) {
    return null;
  }

  return value;
}

/**
 * Normalizes user responses to boolean values.
 * Maps "No...", "No, I don't have any of those", "no", "hindi", "wala" to false.
 *
 * @param text - The user input to normalize.
 * @returns true for positive confirmation, false for denial, or null if ambiguous.
 */
export function normalizeBooleanResponse(text: string | null | undefined): boolean | null {
  if (!text) return null;

  const lower = text.trim().toLowerCase();

  // Explicit denial patterns (English and Tagalog/Bicol)
  const negativePatterns = [
    /^no\b/,
    /^hindi\b/,
    /^wala\b/,
    /^none\b/,
    /don't have/,
    /do not have/,
    /not experiencing/,
    /negative/,
    /^hindi ko po/,
    /^no,/,
  ];

  if (negativePatterns.some((pattern) => pattern.test(lower))) {
    return false;
  }

  // Explicit positive patterns
  const positivePatterns = [
    /^yes\b/,
    /^oo\b/,
    /^meron\b/,
    /^opon\b/,
    /i have/,
    /experiencing/,
    /positive/,
  ];

  if (positivePatterns.some((pattern) => pattern.test(lower))) {
    return true;
  }

  return null;
}

/**
 * DETERMINISTIC SYSTEM LOCK CHECK
 *
 * Scans the provided text for keywords associated with high-risk anatomical systems.
 * Returns the highest applicable category escalation based on the severity hierarchy:
 * simple (0) < complex (1) < critical (2).
 *
 * @param input - The raw symptom description or conversation history.
 * @returns 'critical', 'complex', or null if no keywords are matched.
 */
export function checkCriticalSystemKeywords(input: string): 'critical' | 'complex' | null {
  if (!input) return null;

  const lowerInput = input.toLowerCase();
  let highestCategory: 'critical' | 'complex' | null = null;

  const categoryPriority = { complex: 1, critical: 2 };

  for (const systemKey in SYSTEM_LOCK_KEYWORD_MAP) {
    const config = SYSTEM_LOCK_KEYWORD_MAP[systemKey as keyof typeof SYSTEM_LOCK_KEYWORD_MAP];

    const hasMatch = config.keywords.some((keyword) => {
      // Natural language flexibility:
      // If keyword is multi-word like "chest pain", we allow them to appear in any order
      // with reasonable proximity (order-independent matching).
      const words = keyword.toLowerCase().split(' ');
      if (words.length > 1) {
        // Use positive lookahead to ensure all words exist in the string
        // while maintaining word boundaries.
        const pattern = words.map((w) => `(?=.*\\b${w}\\b)`).join('');
        const regex = new RegExp(`^${pattern}.*$`, 'i');
        return regex.test(lowerInput);
      }

      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i');
      return regex.test(lowerInput);
    });

    if (hasMatch) {
      const targetCat = config.escalationCategory;
      if (!highestCategory || categoryPriority[targetCat] > categoryPriority[highestCategory]) {
        highestCategory = targetCat;
      }
    }
  }

  return highestCategory;
}

/**
 * Calculates the triage readiness score based on extracted clinical data.
 * This is a deterministic algorithm that should be used after slot extraction.
 *
 * Includes the System-Based Lock (SBL) override logic to prevent AI under-triage
 * of critical system symptoms.
 */
export function calculateTriageScore(slots: {
  age?: string | null;
  duration?: string | null;
  severity?: string | null;
  progression?: string | null;
  red_flags_resolved?: boolean;
  uncertainty_accepted?: boolean;
  clinical_friction_detected?: boolean;
  ambiguity_detected?: boolean;
  internal_inconsistency_detected?: boolean;
  symptom_category?: 'simple' | 'complex' | 'critical';
  turn_count?: number;
  denial_confidence?: 'high' | 'medium' | 'low';
  symptom_text?: string; // Raw text for keyword detection
}): { score: number; escalated_category: 'simple' | 'complex' | 'critical' } {
  let score = 1.0;
  let currentCategory = slots.symptom_category || 'simple';

  // Core slots penalty
  let coreSlots: ('age' | 'duration' | 'severity' | 'progression')[] = [
    'age',
    'duration',
    'severity',
    'progression',
  ];

  // Adaptive Strategy: Waive penalties for simple, low-risk cases
  if (currentCategory === 'simple') {
    const severityVal = normalizeSlot(slots.severity) || '';

    // Qualitative: Professional or patient-reported descriptors for low urgency.
    const descriptorRegex = /\b(mild|minor|slight|minimal)\b/i;
    // Quantitative: Numeric score in the lower threshold (1-4 out of 10).
    const numericRegex = /\b([1-4])\s*(\/|out of)\s*10\b/i;

    const hasDescriptor = descriptorRegex.test(severityVal);
    const numericValue = normalizeNumericValue(severityVal);
    const hasNumeric =
      numericRegex.test(severityVal) ||
      (numericValue !== null && numericValue >= 1 && numericValue <= 4);

    const isLowRisk = hasDescriptor && hasNumeric;

    if (isLowRisk) {
      coreSlots = ['duration', 'severity'];
    }
  }

  const nullCount = coreSlots.filter((s) => !normalizeSlot(slots[s])).length;
  if (nullCount > 0) {
    if (slots.uncertainty_accepted) {
      score -= 0.05;
      score -= nullCount * 0.05;
    } else {
      score = 0.8;
      score -= nullCount * 0.1;
    }
  }

  // Safety floor (non-negotiable)
  if (!slots.red_flags_resolved) {
    score = Math.min(score, 0.4);
  }

  // Friction hard cap (non-overridable)
  if (slots.clinical_friction_detected) {
    score = Math.min(score, 0.6);
  }

  // Ambiguity cap
  if (slots.ambiguity_detected) {
    score = Math.min(score, 0.7);
  }

  // Complex category penalty
  if (currentCategory === 'complex' && (slots.turn_count || 0) < 7) {
    score = Math.min(score, 0.85);
  }

  // Internal inconsistency penalty
  if (slots.internal_inconsistency_detected) {
    score -= 0.4;
  }

  // Red flag ambiguity penalty
  if (slots.denial_confidence === 'low') {
    score -= 0.2;
  }

  /**
   * SYSTEM-BASED LOCK (SBL) OVERRIDE
   *
   * This is the final safety gate. It performs case-insensitive detection of
   * critical anatomical system keywords (Cardiac, Respiratory, Neuro, Acute Abdomen).
   *
   * If a critical system is detected, the category is ESCALATED regardless of LLM
   * assignment or scoring status. This ensures that symptoms like "minor chest pain"
   * are treated with the rigor of a 'critical' case rather than a 'simple' one.
   */
  const escalatedCategory = checkCriticalSystemKeywords(slots.symptom_text || '');
  if (escalatedCategory) {
    const hierarchy = { simple: 0, complex: 1, critical: 2 };
    if (hierarchy[escalatedCategory] > hierarchy[currentCategory]) {
      console.log(
        `[SBL Override] Escalating ${currentCategory} -> ${escalatedCategory} based on system keywords.`,
      );
      currentCategory = escalatedCategory;

      // If escalated to critical/complex, re-apply the score penalty if turns are low
      if (currentCategory === 'complex' && (slots.turn_count || 0) < 7) {
        score = Math.min(score, 0.85);
      }
    }
  }

  return {
    score: Math.max(0, Math.min(1.0, score)),
    escalated_category: currentCategory,
  };
}

/**
 * Ensures red flags question appears in the first 3 positions (0, 1, or 2).
 */
export function prioritizeQuestions(questions: AssessmentQuestion[]): AssessmentQuestion[] {
  const redFlagIndex = questions.findIndex((q) => q.id === 'red_flags');
  const sortedQuestions = [...questions];

  if (redFlagIndex === -1) {
    const insertIndex = sortedQuestions.length > 0 ? 1 : 0;
    sortedQuestions.splice(insertIndex, 0, DEFAULT_RED_FLAG_QUESTION);
    return sortedQuestions;
  }

  if (redFlagIndex > 2) {
    const [redFlagQ] = sortedQuestions.splice(redFlagIndex, 1);
    sortedQuestions.splice(1, 0, redFlagQ);
  }

  return sortedQuestions;
}

/**
 * Parses and validates LLM response.
 */
export function parseAndValidateLLMResponse<T = unknown>(rawResponse: string): T {
  try {
    const cleaned = rawResponse.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        throw new Error('Failed to parse extracted JSON from LLM response');
      }
    }
    throw new Error(`Failed to parse LLM response`);
  }
}
