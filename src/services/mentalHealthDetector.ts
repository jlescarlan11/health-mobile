import { KeywordDetector } from './base/KeywordDetector';

// Keywords derived from medical-knowledge.json and crisis intervention guidelines
// Critical (10): Immediate intent or active plan
// High (8-9): Ideation or severe symptoms
// Medium (5-7): Distress indicators
const CRISIS_KEYWORDS_SCORED: Record<string, number> = {
  suicide: 10,
  'kill myself': 10,
  'hurt myself': 10,
  'want to die': 10,
  'end my life': 10,
  'hang myself': 10,
  'cut myself': 10,
  overdose: 10,
  'take all the pills': 10,
  'better off dead': 10,
  dying: 7,
  'feel like dying': 7,
  'feeling like dying': 7,
  'self-harm': 9,
  'hearing voices': 9,
  hallucinations: 9,
  'no reason to live': 9,
  'severe depression': 7,
  'uncontrollable anger': 7,
  'panic attack': 7,
  "can't go on": 7,
  'give up': 6,
  'tired of living': 7,
  'make it stop': 6,
  hopelessness: 6,
  'want to end it': 8,
};

export interface MentalHealthResource {
  name: string;
  number: string;
  description: string;
}

export const MENTAL_HEALTH_RESOURCES: MentalHealthResource[] = [
  {
    name: 'NCMH Crisis Hotline',
    number: '1553',
    description: 'National Center for Mental Health (24/7)',
  },
  {
    name: 'Natasha Goulbourn Foundation',
    number: '(02) 8804-4673',
    description: '24/7 Hope Line',
  },
  {
    name: 'In Touch Crisis Line',
    number: '(02) 8893-7603',
    description: '24/7 Crisis Line',
  },
  {
    name: 'Naga City Mental Health Unit',
    number: '(054) 473-1234', // Placeholder - check for actual local number if available
    description: 'Local support services',
  },
];

interface MentalHealthDetectionResult {
  isCrisis: boolean;
  matchedKeywords: string[];
  message?: string;
  resources?: MentalHealthResource[];
  score: number;
  medical_justification?: string;
}

class MentalHealthDetector extends KeywordDetector {
  protected getKeywords(): Record<string, number> {
    return CRISIS_KEYWORDS_SCORED;
  }

  public detectCrisis(text: string): MentalHealthDetectionResult {
    const { matchedKeywords, score } = this.detect(text, true);

    // Threshold based decision
    const isCrisis = score >= 8;

    if (isCrisis) {
      console.log(
        `[MentalHealthDetector] Crisis keywords detected: ${matchedKeywords.join(', ')} (Score: ${score})`,
      );
      const medical_justification = matchedKeywords.join('; ');

      return {
        isCrisis: true,
        matchedKeywords,
        score,
        message:
          'Your symptoms indicate a mental health crisis. You are not alone. Please reach out to a crisis hotline or go to the nearest hospital immediately.',
        resources: MENTAL_HEALTH_RESOURCES,
        medical_justification,
      };
    }

    return {
      isCrisis: false,
      matchedKeywords,
      score,
    };
  }
}

// Singleton instance
const detector = new MentalHealthDetector();

export const detectMentalHealthCrisis = (text: string): MentalHealthDetectionResult => {
  return detector.detectCrisis(text);
};
