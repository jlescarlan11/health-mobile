import { normalizeNumericValue } from './stringUtils';
import type { AssessmentProfile, QuestionSlotGoal } from '../types/triage';
import type { HealthProfile, Medication } from '../types';

export interface SoapSections {
  s?: string;
  o?: string;
  a?: string;
  p?: string;
}

/**
 * Parses a clinical SOAP note string into its constituent sections.
 * Supports both "S: O: A: P:" format and JSON format.
 */
export const parseSoap = (text: string): SoapSections => {
  // Basic regex to capture content between markers
  const sMatch = text.match(/S:\s*([\s\S]*?)(?=\s*O:|$)/);
  const oMatch = text.match(/O:\s*([\s\S]*?)(?=\s*A:|$)/);
  const aMatch = text.match(/A:\s*([\s\S]*?)(?=\s*P:|$)/);
  const pMatch = text.match(/P:\s*([\s\S]*?)$/);

  // If regex parsing fails, try parsing as JSON
  if (!sMatch && !oMatch && !aMatch && !pMatch) {
    try {
      const json = JSON.parse(text);
      if (json.subjective || json.objective) {
        return {
          s: json.subjective,
          o: json.objective,
          a: json.assessment,
          p: json.plan,
        };
      }
    } catch {
      // Not JSON, fall back to undefined sections
    }
  }

  return {
    s: sMatch ? sMatch[1].trim() : undefined,
    o: oMatch ? oMatch[1].trim() : undefined,
    a: aMatch ? aMatch[1].trim() : undefined,
    p: pMatch ? pMatch[1].trim() : undefined,
  };
};

/**
 * Formats clinical data into a plain-text string for sharing.
 */
export const formatClinicalShareText = (
  clinicalSoap: string,
  timestamp: number,
  profile?: {
    fullName?: string;
    dob?: string;
    allergies?: string[];
    medications?: Medication[];
    philHealthId?: string | null;
  } | null,
): string => {
  const formattedDate = new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const sections = parseSoap(clinicalSoap);
  const hasSections = !!(sections.s || sections.o || sections.a || sections.p);

  let shareText = `CLINICAL HANDOVER REPORT\nDate: ${formattedDate}\n`;

  if (profile) {
    const age = calculateAgeFromDob(profile.dob);
    shareText += `Patient: ${profile.fullName || 'Registered Patient'}${
      age !== null ? ` (${age} yrs)` : ''
    }\n`;

    if (profile.allergies && profile.allergies.length > 0) {
      shareText += `Allergies: ${profile.allergies.join(', ')}\n`;
    }

    if (profile.medications && profile.medications.length > 0) {
      const activeMeds = profile.medications
        .filter((m: Medication) => m.is_active)
        .map((m: Medication) => `${m.name} (${m.dosage})`)
        .join(', ');
      if (activeMeds) {
        shareText += `Medications: ${activeMeds}\n`;
      }
    }

    if (profile.philHealthId) {
      shareText += `PhilHealth ID: ${profile.philHealthId}\n`;
    }
  }

  shareText += '\n';

  if (hasSections) {
    if (sections.s) shareText += `SUBJECTIVE (History):\n${sections.s}\n\n`;
    if (sections.o) shareText += `OBJECTIVE (Signs):\n${sections.o}\n\n`;

    const assessment = sections.a || '';
    if (assessment) shareText += `ASSESSMENT (Triage):\n${assessment}\n\n`;

    if (sections.p) shareText += `PLAN (Next Steps):\n${sections.p}\n`;
  } else {
    shareText += clinicalSoap;
  }

  return shareText.trim();
};

/**
 * Detects if the user context is maternal (pregnancy-related)
 */
export const isMaternalContext = (text: string): boolean => {
  const maternalKeywords = [
    /\bbuntis\b/i,
    /\bpregnant\b/i,
    /\bprenatal\b/i,
    /\bmaternity\b/i,
    /\bnaglilihi\b/i,
    /\bkabwanan\b/i,
  ];
  return maternalKeywords.some((regex) => regex.test(text));
};

const TRAUMA_KEYWORDS = {
  falls: [
    'fall',
    'fell',
    'slip',
    'slipped',
    'trip',
    'tripped',
    'stumble',
    'stumbled',
    'nahulog',
    'natumba',
    'nadulas',
    'natisod',
    'bumagsak',
  ],
  vehicleAccidents: [
    'accident',
    'vehicle accident',
    'car accident',
    'motorcycle accident',
    'road accident',
    'traffic accident',
    'hit by car',
    'hit by motorcycle',
    'aksidente sa sasakyan',
    'aksidente sa kalsada',
    'naaksidente',
    'bangga ng sasakyan',
    'nabundol',
    'nahagip',
    'bangga',
    'nabangga',
    'salpog',
  ],
  penetratingInjuries: [
    'stab',
    'stabbed',
    'stabbing',
    'gunshot',
    'shot',
    'penetrating wound',
    'puncture',
    'saksak',
    'sinaksak',
    'tama ng bala',
    'binarel',
    'butas',
    'penetrating na sugat',
  ],
  burns: [
    'burn',
    'burned',
    'burnt',
    'scald',
    'scalded',
    'thermal burn',
    'chemical burn',
    'paso',
    'napaso',
    'nasunog',
  ],
  fractures: [
    'fracture',
    'fractured',
    'broken bone',
    'broken arm',
    'broke arm',
    'bone break',
    'crack',
    'bali',
    'nabali',
    'bitak na buto',
    'nabiyak',
    'nabiyak na buto',
  ],
  sprains: [
    'sprain',
    'sprained',
    'twisted ankle',
    'ligament injury',
    'pilay',
    'napilay',
    'nabaliko',
  ],
  collisions: [
    'collision',
    'crash',
    'impact',
    'struck',
    'blunt trauma',
    'bangga',
    'nabangga',
    'salpok',
    'salpog',
    'tama',
    'tinamaan',
    'natamaan',
  ],
  generalTrauma: [
    'trauma',
    'injury',
    'wound',
    'laceration',
    'cut',
    'bleeding',
    'pinsala',
    'sugat',
    'hiwa',
    'pagdurugo',
    'nasugatan',
    'nasakit',
  ],
} as const;

const TRAUMA_KEYWORD_LIST = Object.values(TRAUMA_KEYWORDS).flat();

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\\]/g, '\\$&');

const buildKeywordPattern = (keyword: string): string => {
  const parts = keyword.trim().split(/\s+/).map(escapeRegex);
  return parts.join('(?:-|\\s+)');
};

const TRAUMA_REGEX = new RegExp(
  `\\b(?:${TRAUMA_KEYWORD_LIST.map(buildKeywordPattern).join('|')})\\b`,
  'i',
);

/**
 * Detects if the user context is trauma-related (injury-related)
 */
export const isTraumaContext = (text: string): boolean => {
  if (!text) return false;
  return TRAUMA_REGEX.test(text);
};

/**
 * Normalizes age input to a number
 */
export const normalizeAge = (age: string | null): number | null => {
  const normalized = normalizeNumericValue(age);
  if (normalized === null || Number.isNaN(normalized)) return null;
  return Math.floor(normalized);
};

export interface ClinicalSlots {
  age?: string;
  duration?: string;
  severity?: string;
  temperature?: string;
}

/**
 * Deterministically extracts clinical slots (age, duration, severity, temperature) from text.
 * Used for dynamic question pruning in the symptom assessment flow.
 */
export const extractClinicalSlots = (text: string): ClinicalSlots => {
  const lowerText = text.toLowerCase();
  const slots: ClinicalSlots = {};

  // 1. Extract Age
  // Matches: "35 years old", "35 yo", "age 35", "35y", "35 y/o", "I am 35", "I'm 35"
  const ageRegex = /(\d+)\s*(?:years?\s*old|y\/?o|y\.?o\.?|yrs?\b|y\b)/i;
  const ageMatch = lowerText.match(ageRegex);

  const altAgeRegex = /\b(?:age|i am|i'm)\s*(\d+)\b/i;
  const altAgeMatch = lowerText.match(altAgeRegex);

  if (ageMatch) {
    slots.age = ageMatch[1];
  } else if (altAgeMatch) {
    slots.age = altAgeMatch[1];
  }

  // 2. Extract Duration
  // Matches: "3 days", "2 hours", "since yesterday", "for a week", "started 2 hours ago"
  // Added capture groups to return only the duration part.
  const durationPatterns = [
    /started\s+(yesterday|\d+\s*\w+\s*ago)/i,
    /since\s+(yesterday|last\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+)/i,
    /for\s+((?:a|an|\d+)\s*(?:hours?|mins?|minutes?|days?|weeks?|months?|years?))/i,
    // Negative lookahead to avoid matching "30 years" in "30 years old"
    /\b((?:\d+|a|an)\s*(?:hours?|mins?|minutes?|days?|weeks?|months?|years?)(?:\s*(?:ago|now))?)(?!\s*old)\b/i,
  ];

  for (const pattern of durationPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      slots.duration = (match[1] || match[0]).trim();
      break;
    }
  }

  // 3. Extract Severity
  // Priority: Numeric scales > Qualitative descriptors

  // Numeric: "7/10", "8 out of 10"
  const numericSeverityRegex = /\b([0-9]|10)\s*(\/|out of)\s*10\b/i;
  const numericSeverityMatch = lowerText.match(numericSeverityRegex);

  if (numericSeverityMatch) {
    slots.severity = numericSeverityMatch[0].trim();
  } else {
    // Qualitative: "mild", "moderate", "severe", "excruciating"
    const qualSeverityRegex = /\b(mild|moderate|severe|excruciating|unbearable)\b/i;
    const qualSeverityMatch = lowerText.match(qualSeverityRegex);
    if (qualSeverityMatch) {
      slots.severity = qualSeverityMatch[0].trim();
    }
  }

  // 4. Extract Temperature
  // Matches: "38.5C", "101F", "temperature is 39", "temp of 38", "38 degrees"
  const tempRegex = /\b(?:temperature|temp|mainit)\s*(?:is|of|na)?\s*(\d{2,3}(?:\.\d)?)\s*(?:c|f|degrees|degree)?\b/i;
  const tempMatch = lowerText.match(tempRegex);
  
  if (tempMatch) {
    slots.temperature = tempMatch[1];
  } else {
    // Look for standalone temperature-like numbers (36.0 - 42.0 range)
    const standaloneTempRegex = /\b(3[6-9](?:\.\d)|4[0-2](?:\.\d))\b/;
    const standaloneMatch = lowerText.match(standaloneTempRegex);
    if (standaloneMatch) {
      slots.temperature = standaloneMatch[1];
    }
  }

  return slots;
};

const mergeClinicalSlots = (current: ClinicalSlots, next: ClinicalSlots): ClinicalSlots => ({
  age: next.age ?? current.age,
  duration: next.duration ?? current.duration,
  severity: next.severity ?? current.severity,
  temperature: next.temperature ?? current.temperature,
});

export interface ClinicalSlotParser {
  parseTurn(text: string): { parsed: ClinicalSlots; aggregated: ClinicalSlots };
  getSlots(): ClinicalSlots;
  reset(): void;
}

const EMPTY_ASSESSMENT_PROFILE: AssessmentProfile = {
  age: null,
  duration: null,
  severity: null,
  progression: null,
  red_flag_denials: null,
  summary: '',
};

const SLOT_METADATA_CANDIDATES: QuestionSlotGoal[] = [
  { slotId: 'age', label: 'Age' },
  { slotId: 'duration', label: 'Duration' },
  { slotId: 'severity', label: 'Severity' },
  { slotId: 'progression', label: 'Progression' },
  { slotId: 'red_flag_denials', label: 'Red flag denials' },
];

const cloneSlots = (slots: ClinicalSlots): ClinicalSlots => ({ ...slots });

export const createClinicalSlotParser = (): ClinicalSlotParser => {
  let aggregatedSlots: ClinicalSlots = {};

  return {
    parseTurn(text: string) {
      if (!text || !text.trim()) {
        return { parsed: {}, aggregated: cloneSlots(aggregatedSlots) };
      }

      const parsed = extractClinicalSlots(text);
      aggregatedSlots = mergeClinicalSlots(aggregatedSlots, parsed);

      return { parsed, aggregated: cloneSlots(aggregatedSlots) };
    },
    getSlots: () => cloneSlots(aggregatedSlots),
    reset: () => {
      aggregatedSlots = {};
    },
  };
};

export const reconcileClinicalProfileWithSlots = (
  profile: AssessmentProfile,
  incrementalSlots: ClinicalSlots,
): AssessmentProfile => {
  const currentDetails = (profile.specific_details as Record<string, any>) || {};
  const newDetails = { ...currentDetails };
  
  if (incrementalSlots.temperature) {
    newDetails.fever_max_temp = incrementalSlots.temperature;
  }

  return {
    ...profile,
    age: profile.age ?? incrementalSlots.age ?? null,
    duration: profile.duration ?? incrementalSlots.duration ?? null,
    severity: profile.severity ?? incrementalSlots.severity ?? null,
    specific_details: newDetails,
  };
};

export const computeUnresolvedSlotGoals = (
  profile: AssessmentProfile | undefined,
  incrementalSlots: ClinicalSlots,
  answers: Record<string, string>,
): QuestionSlotGoal[] => {
  const baseProfile = profile ?? EMPTY_ASSESSMENT_PROFILE;
  const incrementalRecord = incrementalSlots as Record<string, string | undefined>;

  return SLOT_METADATA_CANDIDATES.filter(({ slotId }) => {
    const hasProfileValue = Boolean(baseProfile[slotId]);
    const hasAnswerValue = Boolean(answers[slotId]);
    const hasIncrementalValue = Boolean(incrementalRecord[slotId]);
    return !hasProfileValue && !hasAnswerValue && !hasIncrementalValue;
  });
};

export interface ClinicalChange {
  field: keyof AssessmentProfile;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Detects semantic changes between two clinical profiles, ignoring superficial formatting.
 * Used to trigger reactive acknowledgements when a user corrects previously established info.
 */
export const detectProfileChanges = (
  prev: AssessmentProfile | undefined,
  next: AssessmentProfile,
): ClinicalChange[] => {
  if (!prev) return [];

  const fieldsToCheck: (keyof AssessmentProfile)[] = ['age', 'duration', 'severity'];
  const changes: ClinicalChange[] = [];

  for (const field of fieldsToCheck) {
    const oldVal = prev[field];
    const newVal = next[field];

    // Only detect corrections to previously established values
    if (!oldVal || !newVal) continue;

    const normOld = String(oldVal).trim().toLowerCase().replace(/\s+/g, ' ');
    const normNew = String(newVal).trim().toLowerCase().replace(/\s+/g, ' ');

    if (normOld !== normNew) {
      changes.push({ field, oldValue: oldVal as string, newValue: newVal as string });
    }
  }

  return changes;
};

/**
 * Calculates age from a date of birth string (YYYY-MM-DD) based strictly on the year component.
 */
export const calculateAgeFromDob = (dob: string | null | undefined): number | null => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  return today.getFullYear() - birthDate.getFullYear();
};

/**
 * Formats the user's health profile into a deterministic, human-readable, and LLM-friendly string.
 * Used as a preamble for AI prompts to provide clinical context while omitting empty fields.
 * 
 * @param profile - The user's basic health profile (conditions, allergies, etc.)
 * @param medications - Structured medication data from the medication slice (for checking interactions)
 */
export const formatProfileForAI = (
  profile: HealthProfile | undefined | null,
  medications: Medication[] = []
): string => {
  const hasProfile = !!profile;
  const hasMeds = medications && medications.length > 0;

  if (!hasProfile && !hasMeds) return '';

  const lines: string[] = [];

  // 1. Age & Sex (Clinically most important)
  const profileParts: string[] = [];
  if (profile?.dob) {
    const age = calculateAgeFromDob(profile.dob);
    if (age !== null) {
      profileParts.push(`Age: ${age}`);
    }
  }
  if (profile?.sex) {
    profileParts.push(`Sex: ${profile.sex}`);
  }

  if (profileParts.length > 0) {
    lines.push(`- ${profileParts.join(', ')}${profile?.dob ? ` (DOB: ${profile.dob})` : ''}`);
  }

  // 2. Blood Type
  if (profile?.bloodType) {
    lines.push(`- Blood Type: ${profile.bloodType}`);
  }

  // 3. Chronic Conditions
  if (profile?.chronicConditions && profile.chronicConditions.length > 0) {
    const sorted = [...profile.chronicConditions].sort();
    lines.push(`- Chronic Conditions: ${sorted.join(', ')}`);
  }

  // 4. Allergies
  if (profile?.allergies && profile.allergies.length > 0) {
    const sorted = [...profile.allergies].sort();
    lines.push(`- Allergies: ${sorted.join(', ')}`);
  }

  // 5. Medications (Merged from Profile strings and MedicationSlice objects)
  const medDescriptions: string[] = [];
  const processedMedNames = new Set<string>();

  // 5a. Structured Medications (Primary Source)
  if (hasMeds) {
    // Sort for determinism
    const activeMeds = medications
      .filter(m => m.is_active)
      .sort((a, b) => a.name.localeCompare(b.name));

    activeMeds.forEach(med => {
      let desc = med.name.trim();
      if (med.dosage) desc += ` ${med.dosage}`;
      
      const scheduleDetails: string[] = [];
      if (med.scheduled_time) scheduleDetails.push(`at ${med.scheduled_time}`);
      
      if (med.days_of_week && med.days_of_week.length > 0) {
        // Check for "Daily" (assuming 7 days means daily)
        if (med.days_of_week.length === 7) {
          scheduleDetails.push('Daily');
        } else {
          // Join days (e.g., "Mon, Wed, Fri")
          scheduleDetails.push(med.days_of_week.join(', '));
        }
      }

      if (scheduleDetails.length > 0) {
        desc += ` (${scheduleDetails.join(' ')})`;
      }

      medDescriptions.push(desc);
      processedMedNames.add(med.name.toLowerCase().trim());
    });
  }

  if (medDescriptions.length > 0) {
    // Sort the combined list for determinism
    lines.push(`- Medications: ${medDescriptions.sort().join('; ')}`);
  }

  // 6. Surgical History
  if (profile?.surgicalHistory?.trim()) {
    lines.push(`- Surgical History: ${profile.surgicalHistory.trim()}`);
  }

  // 7. Family History
  if (profile?.familyHistory?.trim()) {
    lines.push(`- Family History: ${profile.familyHistory.trim()}`);
  }

  if (lines.length === 0) return '';

    return `USER HEALTH PROFILE:\n${lines.join('\n')}`;

  };

  

interface SnapshotPayload {
  v: number;
  t: number;
  s?: string;
  o?: string;
  a?: string;
  p?: string;
  pr?: {
    n?: string;
    s?: string;
    a?: number | null;
    b?: string;
    al?: string[];
    ph?: string | null;
    m?: { n: string; d: string }[];
  };
}

/**
 * Serializes clinical data into a compact, key-mapped JSON format (Version 4).
 * Designed to minimize QR code density while remaining human-readable if scanned by a standard app.
 * Includes size-limiting logic to ensure scan reliability by dropping secondary fields.
 */
export const serializeClinicalSnapshot = (
  clinicalSoap: string,
  timestamp: number,
  profile?: {
    fullName?: string;
    sex?: string;
    dob?: string;
    bloodType?: string;
    allergies?: string[];
    philHealthId?: string | null;
    medications?: Medication[];
  } | null,
): string => {
  const sections = parseSoap(clinicalSoap);

  const payload: SnapshotPayload = {
    v: 4,
    t: timestamp,
    s: sections.s,
    o: sections.o,
    a: sections.a,
    p: sections.p,
    pr: profile
      ? {
          n: profile.fullName || undefined,
          s: profile.sex || undefined,
          a: calculateAgeFromDob(profile.dob),
          b: profile.bloodType || undefined,
          al: profile.allergies,
          ph: profile.philHealthId,
          m: profile.medications?.map((m: Medication) => ({ n: m.name, d: m.dosage })),
        }
      : undefined,
  };

  const serialize = (p: SnapshotPayload) =>
    JSON.stringify(p, (_, value) => {
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        return undefined;
      }
      return value;
    });

  let json = serialize(payload);
  const MAX_SAFE_SIZE = 750;

  if (json.length > MAX_SAFE_SIZE) {
    // Stage 1: Drop secondary clinical info (Medications)
    if (payload.pr?.m) {
      delete payload.pr.m;
      json = serialize(payload);
    }

    // Stage 2: Drop non-critical demographics
    if (json.length > MAX_SAFE_SIZE) {
      if (payload.pr?.ph) delete payload.pr.ph;
      if (payload.pr?.b) delete payload.pr.b;
      json = serialize(payload);
    }

    // Stage 3: Drop sex and age
    if (json.length > MAX_SAFE_SIZE) {
      if (payload.pr?.s) delete payload.pr.s;
      if (payload.pr?.a) delete payload.pr.a;
      json = serialize(payload);
    }

    // Stage 4: Drop Name (Preserving Clinical Findings s,o,a,p and Allergies al)
    if (json.length > MAX_SAFE_SIZE) {
      if (payload.pr?.n) delete payload.pr.n;
      json = serialize(payload);
    }
  }

  return json;
};

  