import { describe, expect, it } from 'vitest';
import { TriageAssessmentResponseSchema } from './triageSchema';

const buildBaseResponse = () => ({
  version: 'v1',
  controlSignal: 'CONTINUE' as const,
  aiResponse: {
    text: 'Continuing triage',
  },
  updatedProfile: {
    age: null,
    duration: null,
    severity: null,
    progression: null,
    red_flag_denials: null,
    summary: 'Profile summary',
  },
  metadata: {},
});

describe('TriageAssessmentResponseSchema', () => {
  it('accepts numeric updatedProfile.age', () => {
    const payload = buildBaseResponse();
    payload.updatedProfile.age = 35;

    expect(() => TriageAssessmentResponseSchema.parse(payload)).not.toThrow();
  });

  it('still accepts string updatedProfile.age for backwards compatibility', () => {
    const payload = buildBaseResponse();
    payload.updatedProfile.age = '42';

    expect(() => TriageAssessmentResponseSchema.parse(payload)).not.toThrow();
  });
});
