import type { TriageLogic } from './triage';
export * from './navigation';
export * from './triage';

export type FacilityService =
  | 'Adolescent Health'
  | 'Animal Bite Clinic'
  | 'Blood Bank'
  | 'Clinical Chemistry'
  | 'Clinical Microscopy'
  | 'Consultation'
  | 'Dental'
  | 'Dermatology'
  | 'Dialysis'
  | 'ECG'
  | 'ENT'
  | 'Emergency'
  | 'Eye Center'
  | 'Family Planning'
  | 'General Medicine'
  | 'HIV Treatment'
  | 'Hematology'
  | 'Immunization'
  | 'Internal Medicine'
  | 'Laboratory'
  | 'Maternal Care'
  | 'Mental Health'
  | 'Nutrition Services'
  | 'OB-GYN'
  | 'Pediatrics'
  | 'Primary Care'
  | 'Radiology'
  | 'Stroke Unit'
  | 'Surgery'
  | 'Trauma Care'
  | 'X-ray';

export interface FacilityBusyness {
  score: number; // occupancy / capacity
  status: 'quiet' | 'moderate' | 'busy';
}

export interface FacilityContact {
  id: string;
  phoneNumber: string;
  platform: 'phone' | 'viber' | 'messenger' | 'email';
  teleconsultUrl?: string;
  contactName?: string | null;
  role?: string | null;
  facilityId: string;
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  services: FacilityService[];
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  contacts?: FacilityContact[];
  yakapAccredited: boolean;
  hours?: string;
  operatingHours?: {
    is24x7: boolean;
    open?: string; // Legacy/Simple
    close?: string; // Legacy/Simple
    description?: string;
    schedule?: Record<number, { open: string; close: string } | null>;
  };
  photoUrl?: string;
  distance?: number; // Optional calculated field
  specialized_services?: string[];
  is_24_7?: boolean;
  lastUpdated?: number; // Timestamp of last verification
  busyness?: FacilityBusyness;
}

export interface EmergencyContact {
  id: string;
  name: string;
  category: string;
  phone: string;
  available24x7: boolean;
  description?: string;
}

export interface AssessmentResponse {
  recommended_level: 'self_care' | 'health_center' | 'hospital' | 'emergency';
  follow_up_questions: string[];
  user_advice: string;
  clinical_soap: string;
  key_concerns: string[];
  critical_warnings: string[];
  relevant_services: FacilityService[];
  red_flags: string[];
  triage_readiness_score?: number;
  ambiguity_detected?: boolean;
  is_conservative_fallback?: boolean;
  clinical_friction_details?: Record<string, unknown>;
  medical_justification?: string;
  /**
   * Captures the full audit trail of how the care level was chosen, including the model's raw
   * recommendation, any safety upgrades/downgrades, and the final level persisted to state. This
   * enables clinical transparency, debugging, and post-hoc review of safety overrides.
   *
   * Population: Populate whenever we compute or alter a recommendation (LLM response parsing,
   * safety overrides, recent-resolved floors, authority downgrades, offline fallbacks). If no
   * adjustments occur, set adjustments to an empty array and keep original/final equal.
   *
   * Responsible components: geminiClient safety pipeline, emergencyDetector overrides, and
   * offline fallback logic in RecommendationScreen (or any future manual override points).
   *
   * Examples:
   * const noShift = {
   *   triage_logic: {
   *     original_level: 'health_center',
   *     final_level: 'health_center',
   *     adjustments: [],
   *   },
   * };
   *
   * const safetyUpgrade = {
   *   triage_logic: {
   *     original_level: 'self_care',
   *     final_level: 'health_center',
   *     adjustments: [
   *       {
   *         from: 'self_care',
   *         to: 'health_center',
   *         rule: 'READINESS_UPGRADE',
   *         reason: 'triage_readiness_score 0.60 < 0.80 threshold',
   *         timestamp: new Date().toISOString(),
   *       },
   *     ],
   *   },
   * };
   *
   * Clinical transparency: callers can display the adjustment chain to explain why the user was
   * upgraded/downgraded and retain an auditable record of safety decisions.
   */
  triage_logic?: TriageLogic;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  scheduled_time: string;
  is_active: boolean;
  days_of_week: string[];
}

export interface HealthProfile {
  fullName?: string | null;
  dob?: string | null;
  sex?: string | null;
  bloodType?: string | null;
  philHealthId?: string | null;
  chronicConditions?: string[];
  allergies?: string[];
  surgicalHistory?: string | null;
  familyHistory?: string | null;
}
