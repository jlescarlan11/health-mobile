import { z } from 'zod';

export const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
});

export const AssessmentProfileSchema = z.object({
  age: z.union([z.string(), z.number()]).nullable(),
  duration: z.string().nullable(),
  severity: z.string().nullable(),
  progression: z.string().nullable(),
  red_flag_denials: z.string().nullable(),
  summary: z.string(),
  triage_readiness_score: z.number().optional(),
  ambiguity_detected: z.boolean().optional(),
  internal_inconsistency_detected: z.boolean().optional(),
  internal_consistency_score: z.number().optional(),
  red_flags_resolved: z.boolean().optional(),
  uncertainty_accepted: z.boolean().optional(),
  clinical_friction_detected: z.boolean().optional(),
  clinical_friction_details: z.string().nullable().optional(),
  is_complex_case: z.boolean().optional(),
  is_vulnerable: z.boolean().optional(),
  symptom_category: z.enum(['simple', 'complex', 'critical']).optional(),
  denial_confidence: z.enum(['high', 'medium', 'low']).optional(),
  turn_count: z.number().optional(),
  is_recent_resolved: z.boolean().optional(),
  resolved_keyword: z.string().optional(),
  denied_symptoms: z.array(z.string()).optional(),
  covered_symptoms: z.array(z.string()).optional(),
  specific_details: z.record(z.string(), z.any()).nullable().optional(),
  termination_reason: z.string().nullable().optional(),
});

export const AssessmentQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['text', 'multi-select', 'single-select', 'number']).optional(),
  options: z.array(z.any()).optional(),
  tier: z.number().optional(),
  is_red_flag: z.boolean().optional(),
  metadata: z.any().optional(),
});

export const TriageAssessmentRequestSchema = z.object({
  history: z.array(ChatHistoryItemSchema),
  profile: AssessmentProfileSchema.optional(),
  currentTurn: z.number(),
  totalPlannedQuestions: z.number(),
  remainingQuestions: z.array(AssessmentQuestionSchema),
  previousProfile: AssessmentProfileSchema.optional(),
  clarificationAttempts: z.number().optional(),
  patientContext: z.string().optional(),
  initialSymptom: z.string(),
  fullName: z.string().optional(),
});

export const AssessmentResponseSchema = z.object({
  recommended_level: z.enum(['self_care', 'health_center', 'hospital', 'emergency', 'self-care', 'health-center']),
  user_advice: z.string(),
  follow_up_questions: z.array(z.string()),
  clinical_soap: z.string(),
  key_concerns: z.array(z.string()),
  critical_warnings: z.array(z.string()),
  relevant_services: z.array(z.string()),
  red_flags: z.array(z.string()),
  medical_justification: z.string().optional(),
  triage_logic: z.any().optional(),
  facilities: z.array(z.any()).optional(),
  narratives: z.object({
    recommendationNarrative: z.string(),
    handoverNarrative: z.string(),
  }).optional(),
});

export const TriageAssessmentResponseSchema = z.object({
  version: z.string(),
  controlSignal: z.enum([
    'TERMINATE',
    'CONTINUE',
    'RESOLVE_AMBIGUITY',
    'PRIORITIZE_RED_FLAGS',
    'REQUIRE_CLARIFICATION',
    'DRILL_DOWN',
  ]),
  aiResponse: z.object({
    text: z.string(),
    question: AssessmentQuestionSchema.optional(),
    assessment: AssessmentResponseSchema.optional(),
  }),
  updatedProfile: AssessmentProfileSchema,
  metadata: z.object({
    reason: z.string().optional(),
    nextSteps: z.array(z.string()).optional(),
    needs_reset: z.boolean().optional(),
    saturation_count: z.number().optional(),
    emergency_detected: z.boolean().optional(),
  }).optional(),
});

export type TriageAssessmentRequest = z.infer<typeof TriageAssessmentRequestSchema>;
export type TriageAssessmentResponse = z.infer<typeof TriageAssessmentResponseSchema>;
