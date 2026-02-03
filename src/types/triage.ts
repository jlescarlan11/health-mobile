export type TriageLevel = 'self-care' | 'health-center' | 'hospital' | 'emergency';

// Clinical acuity categories used for higher-level reasoning/auditing.
export type TriageAcuityLevel = 'simple' | 'complex' | 'critical' | 'emergency';

// Canonical care levels (underscore format) used in API contracts and triage_logic.
export type TriageCareLevel = 'self_care' | 'health_center' | 'hospital' | 'emergency';

export type TriageAdjustmentRule =
  | 'SYSTEM_BASED_LOCK_CARDIAC'
  | 'SYSTEM_BASED_LOCK_RESPIRATORY'
  | 'SYSTEM_BASED_LOCK_NEUROLOGICAL'
  | 'SYSTEM_BASED_LOCK_TRAUMA'
  | 'SYSTEM_BASED_LOCK_ABDOMEN'
  | 'CONSENSUS_CHECK'
  | 'AGE_ESCALATION'
  | 'READINESS_UPGRADE'
  | 'RED_FLAG_UPGRADE'
  | 'RECENT_RESOLVED_FLOOR'
  | 'AUTHORITY_DOWNGRADE'
  | 'MENTAL_HEALTH_OVERRIDE'
  | 'OFFLINE_FALLBACK'
  | 'MANUAL_OVERRIDE';

export interface TriageAdjustment {
  from: TriageCareLevel;
  to: TriageCareLevel;
  rule: TriageAdjustmentRule;
  reason: string;
  timestamp: string; // ISO 8601
}

export interface TriageLogic {
  original_level: TriageCareLevel;
  final_level: TriageCareLevel;
  adjustments: TriageAdjustment[]; // Ordered audit trail; empty array when no shifts occurred
}

export interface TriageOption {
  label: string;
  next: string; // ID of the next node
}

export interface TriageRecommendation {
  level: TriageLevel;
  reasoning: string;
  actions: string[];
}

export interface TriageNode {
  id: string;
  type: 'question' | 'outcome';
  text?: string; // Only for 'question' type
  options?: TriageOption[]; // Only for 'question' type
  recommendation?: TriageRecommendation; // Only for 'outcome' type
}

export interface TriageFlow {
  version: string;
  name: string;
  description: string;
  startNode: string;
  nodes: Record<string, TriageNode>;
}

export type SystemCategory =
  | 'Cardiac'
  | 'Respiratory'
  | 'Neurological'
  | 'Acute Abdomen'
  | 'Trauma';

export interface SystemLockConfig {
  system: SystemCategory;
  keywords: string[];
  escalationCategory: 'complex' | 'critical';
}

/**
 * SYSTEM-BASED LOCK CONFIGURATION
 *
 * This map defines the deterministic overrides for the triage system.
 * If any keyword within a system is detected in the user's symptom description,
 * the triage category is automatically escalated to the target category.
 *
 * Safety Rationale: LLMs can occasionally under-triage systemic or internal
 * symptoms as "simple" if they are described with low qualitative severity.
 * These locks ensure that high-stakes anatomical systems always trigger
 * high-resolution assessment protocols (longer turn floors, Tier 3 rule-outs).
 */
export const SYSTEM_LOCK_KEYWORD_MAP: Record<SystemCategory, SystemLockConfig> = {
  Cardiac: {
    system: 'Cardiac',
    escalationCategory: 'critical',
    keywords: [
      'chest pain',
      'chest pressure',
      'chest tightness',
      'squeezing chest',
      'heart attack',
      'myocardial infarction',
      'palpitations',
      'racing heart',
      'skipped beats',
      'pain in left arm',
      'pain in jaw',
      'radiating pain',
    ],
  },
  Respiratory: {
    system: 'Respiratory',
    escalationCategory: 'critical',
    keywords: [
      'shortness of breath',
      'difficulty breathing',
      'hard to breathe',
      'cant breathe',
      'struggling to breathe',
      'gasping',
      'breathless',
      'wheezing',
      'choking',
      'cyanosis',
      'blue lips',
      'asthma attack',
    ],
  },
  Neurological: {
    system: 'Neurological',
    escalationCategory: 'critical',
    keywords: [
      'numbness',
      'tingling',
      'weakness',
      'facial drooping',
      'slurred speech',
      'confusion',
      'disorientation',
      'seizure',
      'convulsion',
      'passed out',
      'fainted',
      'loss of consciousness',
      'vision loss',
      'worst headache',
      'thunderclap headache',
      'stiff neck',
      'paralysis',
      'unconscious',
      'unconsious',
    ],
  },
  'Acute Abdomen': {
    system: 'Acute Abdomen',
    escalationCategory: 'complex',
    keywords: [
      'severe stomach pain',
      'abdominal pain',
      'rigid abdomen',
      'hard stomach',
      'abdominal guarding',
      'appendicitis',
      'peritonitis',
      'intense belly pain',
    ],
  },
  Trauma: {
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
};

export interface AssessmentProfile {
  age: string | number | null;
  duration: string | null;
  severity: string | null;
  progression: string | null;
  red_flag_denials: string | null;
  summary: string;
  triage_readiness_score?: number;
  ambiguity_detected?: boolean;
  internal_inconsistency_detected?: boolean;
  internal_consistency_score?: number;
  red_flags_resolved?: boolean;
  uncertainty_accepted?: boolean; // True if user explicitly says "I don't know" for a core slot
  clinical_friction_detected?: boolean;
  clinical_friction_details?: string | null;
  is_complex_case?: boolean;
  is_vulnerable?: boolean;
  symptom_category?: 'simple' | 'complex' | 'critical';
  denial_confidence?: 'high' | 'medium' | 'low';
  turn_count?: number;
  affected_systems?: SystemCategory[];
  is_recent_resolved?: boolean;
  resolved_keyword?: string;

  // Symptom coverage tracking
  denied_symptoms?: string[]; // Symptoms explicitly denied by the user
  covered_symptoms?: string[];
  specific_details?: Record<string, any> | null;
  termination_reason?: string | null;
}

export interface QuestionSlotGoal {
  slotId: keyof AssessmentProfile;
  label: string;
}

export interface TriageSnapshot {
  score: number;
  escalatedCategory: 'simple' | 'complex' | 'critical';
  readiness: number;
  unresolvedSlots: QuestionSlotGoal[];
  missingCoreSlots: QuestionSlotGoal[];
}

export interface QuestionMetadata {
  slotGoals?: QuestionSlotGoal[];
}

export interface GroupedOption {
  category: string;
  items: string[];
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  type?: 'text' | 'multi-select' | 'single-select' | 'number';
  options?: string[] | GroupedOption[];
  tier?: number;
  is_red_flag?: boolean;
  metadata?: QuestionMetadata;
}

export interface AssessmentData {
  symptoms: string;
  answers: { question: string; answer: string }[];
  offlineRecommendation?: TriageRecommendation;
  extractedProfile?: AssessmentProfile;
  affectedSystems?: string[];
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export type TriageSignal =
  | 'TERMINATE'
  | 'CONTINUE'
  | 'RESOLVE_AMBIGUITY'
  | 'PRIORITIZE_RED_FLAGS'
  | 'REQUIRE_CLARIFICATION'
  | 'DRILL_DOWN';

export interface TriageAssessmentRequest {
  history: ChatHistoryItem[];
  profile?: AssessmentProfile;
  currentTurn: number;
  totalPlannedQuestions: number;
  remainingQuestions: AssessmentQuestion[];
  previousProfile?: AssessmentProfile;
  clarificationAttempts?: number;
  patientContext?: string;
  initialSymptom: string;
  fullName?: string;
}

export interface TriageAssessmentResponse {
  version: string;
  controlSignal: TriageSignal;
  aiResponse: {
    text: string;
    question?: AssessmentQuestion;
    assessment?: any; // The final AssessmentResponse if TERMINATE
  };
  updatedProfile: AssessmentProfile;
  metadata?: {
    reason?: string;
    nextSteps?: string[];
    needs_reset?: boolean;
    saturation_count?: number;
    emergency_detected?: boolean;
  };
}
