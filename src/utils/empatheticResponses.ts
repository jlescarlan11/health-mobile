import { AssessmentProfile } from '../types/triage';

export interface EmpatheticResponseInput {
  header?: string;
  body?: string;
  reason?: string;
  reasonSource?: string;
  nextAction?: string;
  inlineAck?: string;
  metadata?: Record<string, unknown>;
  profile?: AssessmentProfile;
  primarySymptom?: string;
  tone?: 'empathetic' | 'neutral';
}

export interface EmpatheticResponseOutput {
  text: string;
  metadata: Record<string, unknown>;
}

type SeverityBucket = 'low' | 'medium' | 'high';
type ToneCategory = 'simple' | 'complex' | 'critical' | 'default';

const ensureSentenceEnding = (value?: string) => {
  if (!value) return '';
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const severityNumberFromString = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/(\d+(\.\d+)?)/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  if (Number.isNaN(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 10);
};

export const parseSeverityScore = (value?: string | null): number | undefined => {
  return severityNumberFromString(value);
};

const getSeverityBucket = (score?: number): SeverityBucket => {
  if (typeof score === 'number') {
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }
  return 'medium';
};

const determinerPrefixes = [
  'the',
  'this',
  'that',
  'these',
  'those',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
];

export const formatSymptomReference = (symptom?: string): string => {
  if (!symptom) return 'your symptoms';
  const trimmed = symptom.trim().replace(/[.!?]+$/, '');
  if (trimmed.length === 0) return 'your symptoms';
  const normalized = trimmed.replace(/^[\u201c"']+|[\u201d"']+$/g, '').trim();
  if (normalized.length === 0) return 'your symptoms';
  const lowerCandidate = normalized.toLowerCase();
  if (determinerPrefixes.some((prefix) => lowerCandidate.startsWith(`${prefix} `))) {
    return normalized;
  }
  return `the ${normalized}`;
};

const scrubLeadingPhrases = (value: string): string => {
  return value
    .replace(/^(?:i(?:'m| am| have|'ve| was| feel| keep)?|i've been|i've|i)\s+/i, '')
    .replace(/^(?:my|the|this|that)\s+/i, '')
    .trim();
};

const extractSymptomCandidate = (text?: string): string | undefined => {
  if (!text) return undefined;
  const normalized = text.trim();
  if (!normalized) return undefined;
  const withoutLineBreak = normalized.split(/[\r\n]/)[0];
  const sanitized = scrubLeadingPhrases(withoutLineBreak);
  if (!sanitized) return undefined;
  const [clause] = sanitized.split(/[.?!]/);
  const [segment] = clause.split(/\band\b|\bor\b|\bbut\b|,|;|:/i);
  const candidate = segment.trim();
  if (!candidate) return undefined;
  return candidate.length > 80 ? candidate.slice(0, 80).trim() : candidate;
};

export const derivePrimarySymptom = (
  initialSymptom?: string,
  summary?: string,
): string | undefined => {
  return extractSymptomCandidate(initialSymptom) ?? extractSymptomCandidate(summary);
};

const TONE_MATRIX: Record<ToneCategory, Record<SeverityBucket, string>> = {
  simple: {
    low: 'Thanks for sharing how {symptom} is behaving; we can stay calm while we gather more details.',
    medium: 'I hear that {symptom} is still bothering you; let\'s keep covering the most relevant details.',
    high: 'I\'m concerned by how intense {symptom} sounds right now; I\'m staying focused on what matters most.',
  },
  complex: {
    low: 'I appreciate the detail on {symptom}; we can continue tracking it together.',
    medium: 'I can tell {symptom} is affecting you; let\'s make sure we cover everything important.',
    high: 'I\'m very mindful of how severe {symptom} sounds; please keep me updated on anything urgent.',
  },
  critical: {
    low: 'I\'m staying focused on {symptom} because even subtle changes can be significant.',
    medium: 'This level of detail about {symptom} is critical; I\'m keeping the tone professional while we proceed.',
    high: 'I\'m deeply concerned about how urgent {symptom} feels; we need to keep moving carefully and directly.',
  },
  default: {
    low: 'Thanks for sharing how {symptom} is behaving; we can stay calm while we gather more details.',
    medium: 'I hear that {symptom} is still bothering you; let\'s keep covering the most relevant details.',
    high: 'I\'m concerned by how intense {symptom} sounds right now; I\'m staying focused on what matters most.',
  },
};

const buildEmpathyPrefix = (
  profile?: AssessmentProfile,
  primarySymptom?: string,
): string | undefined => {
  const severityScore = parseSeverityScore(profile?.severity);
  const bucket = getSeverityBucket(severityScore);
  const category = (profile?.symptom_category as ToneCategory) ?? 'default';
  const templates = TONE_MATRIX[category] || TONE_MATRIX.default;
  const template = templates[bucket] || TONE_MATRIX.default[bucket];
  return template.replace('{symptom}', formatSymptomReference(primarySymptom));
};

export const formatEmpatheticResponse = ({
  header,
  body,
  reason,
  reasonSource,
  nextAction,
  inlineAck,
  metadata,
  profile,
  primarySymptom,
  tone = 'empathetic',
}: EmpatheticResponseInput): EmpatheticResponseOutput => {
  const contentBlocks: string[] = [];

  if (header?.trim()) {
    contentBlocks.push(header.trim());
  }
  
  const prefix =
    tone === 'neutral' ? undefined : buildEmpathyPrefix(profile, primarySymptom);
  const ack = inlineAck?.trim();
  const trimmedBody = body?.trim();
  const bodySegments: string[] = [];

  if (prefix) bodySegments.push(prefix);
  if (ack) bodySegments.push(ensureSentenceEnding(ack));
  if (trimmedBody) bodySegments.push(trimmedBody);

  if (bodySegments.length > 0) {
    contentBlocks.push(bodySegments.join(' '));
  }

  // Internal fields (reason, nextAction) are intentionally excluded from the user-facing text
  // but preserved in metadata for debugging context.

  return {
    text: contentBlocks.join('\n\n'),
    metadata: {
      ...(metadata ?? {}),
      empatheticFormatter: {
        reason,
        reasonSource,
        nextAction,
        header,
        inlineAck,
      },
    },
  };
};
