import { AssessmentQuestion, SystemLockConfig } from '../types/triage';

/**
 * Default Red Flag Question for Safety Fallback.
 * This is injected if the AI fails to generate a mandatory red_flags question.
 * It covers the "Big 3" immediate life threats: Respiratory, Cardiac, and Hemorrhagic/Trauma.
 */
export const DEFAULT_RED_FLAG_QUESTION: AssessmentQuestion = {
  id: 'red_flags',
  text: 'To ensure your safety, are you experiencing any difficulty breathing, severe chest pain, distinct confusion, or uncontrolled bleeding?',
  type: 'multi-select',
  tier: 1,
  is_red_flag: true,
  options: [
    {
      category: 'Critical Signs',
      items: [
        'Difficulty breathing',
        'Severe chest pain',
        'Confusion / Disorientation',
        'Uncontrolled bleeding',
      ],
    },
  ],
};

/**
 * Safety-Critical Systems Configuration for Deterministic Overrides.
 * Used by the SystemLockDetector to force clinical categories when specific
 * high-stakes symptoms are detected in the conversation.
 */
export const SYSTEM_LOCK_CONFIGS: SystemLockConfig[] = [
  {
    system: 'Cardiac',
    escalationCategory: 'critical',
    keywords: [
      'chest pain',
      'chest pressure',
      'squeezing chest',
      'tight chest',
      'heavy chest',
      'chest discomfort',
      'angina',
      'heart pain',
      'pain in my chest',
      'chest tightness',
      'crushing chest pain',
      'heart attack signs',
      'palpitations',
      'heart fluttering',
      'heart racing',
      'pounding heart',
      'skipped beats',
      'fast heartbeat',
      'slow heartbeat',
      'heart rate issues',
      'pain in jaw',
      'pain in left arm',
      'pain in shoulder',
      'radiating to arm',
      'spreads to jaw',
      'myocardial infarction',
      'arrhythmia',
    ],
  },
  {
    system: 'Respiratory',
    escalationCategory: 'critical',
    keywords: [
      'shortness of breath',
      'difficulty breathing',
      'hard to breathe',
      'can-t breathe',
      'cant breathe',
      'struggling to breathe',
      'gasping',
      'short of breath',
      'breathless',
      'out of breath',
      'dyspnea',
      'wheezing',
      'noisy breathing',
      'choking',
      'stridor',
      'fast breathing',
      'rapid breathing',
      'shallow breathing',
      'blue lips',
      'cyanosis',
      'asthma attack',
      'short of breth',
      'trouble breathing',
    ],
  },
  {
    system: 'Neurological',
    escalationCategory: 'critical',
    keywords: [
      'numbness',
      'tingling',
      'pins and needles',
      'weakness',
      'cant move arm',
      'cant move leg',
      'facial drooping',
      'slurred speech',
      'cant talk',
      'difficulty speaking',
      'confusion',
      'disorientation',
      'altered mental status',
      'seizure',
      'convulsion',
      'fits',
      'loss of consciousness',
      'passed out',
      'fainted',
      'syncope',
      'vision loss',
      'blurred vision',
      'double vision',
      'sudden headache',
      'worst headache',
      'thunderclap headache',
      'stiff neck',
      'meningitis signs',
      'dizziness',
      'vertigo',
      'balance issues',
      'stroke signs',
      'paralysis',
      'unable to move',
    ],
  },
  {
    system: 'Acute Abdomen',
    escalationCategory: 'complex',
    keywords: [
      'severe stomach pain',
      'stomach cramps',
      'abdominal pain',
      'belly pain',
      'rigid abdomen',
      'hard stomach',
      'bloated stomach',
      'abdominal guarding',
      'sharp stomach pain',
      'intense abdominal pain',
      'pain when touching stomach',
      'tender abdomen',
      'pain in lower right abdomen',
      'appendicitis signs',
      'peritonitis',
    ],
  },
  {
    system: 'Trauma',
    escalationCategory: 'critical',
    keywords: [
      'gunshot',
      'shot',
      'stab',
      'stabbed',
      'stabbing',
      'penetrating wound',
      'puncture',
      'severe burn',
      'burned',
      'burnt',
      'scald',
      'fracture',
      'broken bone',
      'open fracture',
      'vehicle accident',
      'car accident',
      'motorcycle accident',
      'hit by car',
      'hit by motorcycle',
      'uncontrolled bleeding',
    ],
  },
];

/**
 * Safety threshold for offline self-care recommendations.
 * A score <= 3 indicates minimal risk with no clinical red flags detected,
 * or symptoms that have been de-escalated by viral indicators (cough/cold).
 */
export const OFFLINE_SELF_CARE_THRESHOLD = 3;

/**
 * A comprehensive list of safety-critical clinical keywords used for deterministic
 * symptom detection and emergency filtering.
 *
 * Usage pattern: Case-insensitive substring matching against user input.
 * These terms trigger immediate emergency escalation or high-priority triage logic.
 */
export const SAFETY_CRITICAL_KEYWORDS: readonly string[] = [
  // Cardiac
  'chest pain',
  'heart attack',
  'chest pressure',

  // Respiratory
  'shortness of breath',
  'breathing difficulty',
  'difficulty breathing',
  'choking',

  // Neurological
  'stroke',
  'sudden weakness',
  'confusion',
  'seizure',
  'vision loss',
  'severe headache',

  // Trauma & Consciousness
  'severe bleeding',
  'unconscious',
  'unresponsive',
  'passing out',
  'fainting',

  // Allergic Reactions
  'allergic reaction',
  'swelling throat',
  'anaphylaxis',
] as const;
