import {
  getLevenshteinDistance,
  findAllFuzzyMatches,
  FUZZY_THRESHOLD,
} from '../../utils/stringUtils';

// Constants shared across detectors
export const NEGATION_KEYWORDS = [
  'no',
  'not',
  'never',
  'none',
  "don't",
  "doesn't",
  "didn't",
  "isn't",
  "aren't",
  'don-t',
  'doesn-t',
  'didn-t',
  'isn-t',
  'aren-t',
  'dont',
  'doesnt',
  'didnt',
  'isnt',
  'arent',
  'without',
  'denies',
  'denied',
  'negative',
  'absent',
  'ruled out',
  'free from',
  'wala',
  'hindi',
  'nope',
  'nah',
  'nothing',
  'not experiencing',
  'none of these',
  'not present',
  'bako',
  'dae',
  'dai',
  'wara',
];

export const AFFIRMATIVE_KEYWORDS = [
  'yes',
  'got',
  'currently',
  'ongoing',
  'nag',
  'may',
  'i am',
  "i'm",
  'iam',
  'im',
  'present',
  'experiencing',
  'meron',
  'iyo',
  'igwa',
];

export const SYSTEM_INDICATORS = [
  'are you experiencing',
  'do you have',
  'have you had',
  'please tell me',
  'could you',
  'can you',
  'to confirm',
  'also,',
  'question:',
  'slot_ids',
  'initial symptom:',
  'context:',
  'nearest',
  '{"question"',
  'answers:',
  'clinical profile:',
  'duration:',
  'severity:',
  'progression:',
  'red flag status:',
  'summary:',
];

export interface KeywordMatch {
  keyword: string;
  severity: number;
  negated: boolean;
  contextWindow: string;
  affirmationFound: boolean;
}

export interface SegmentAnalysis {
  text: string;
  isUserInput: boolean;
  potentialMatches: KeywordMatch[];
  activeMatches: KeywordMatch[];
  suppressedMatches: KeywordMatch[];
  maxScore: number;
}

export abstract class KeywordDetector {
  protected abstract getKeywords(): Record<string, number>;

  /**
   * Enhanced sanitization to remove system labels and identifiers
   */
  public sanitizeInput(text: string): {
    sanitized: string;
    rejected: { text: string; reason: string }[];
  } {
    const rejected: { text: string; reason: string }[] = [];

    // 1. Remove JSON structures and technical metadata while preserving content
    let cleaned = text
      .replace(/{"question":".*?","answer":"(.*?)"}/g, '$1') // Extract answer from JSON pairs
      .replace(/[[\]{}]/g, ' ') // Remove brackets
      .replace(/"answer":/g, ' ')
      .replace(/"question":/g, ' ')
      .replace(/"/g, ' ');

    // 2. Remove system labels specifically (preserve content)
    for (const indicator of SYSTEM_INDICATORS) {
      if (indicator === 'summary:' || indicator === 'clinical profile:') {
        const regex = new RegExp(`\\b${indicator}\\s*[^.?!\\n]*`, 'gi');
        cleaned = cleaned.replace(regex, ' ');
        continue;
      }

      const regex = new RegExp(`\\b${indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      cleaned = cleaned.replace(regex, ' ');
    }

    // 3. Tokenize into clean segments
    const segments = cleaned
      .split(/[.,?!;:\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);

    // 4. Drop segments that are too short or contain system-only indicators
    const validSegments = segments.filter((segment) => {
      if (segment.length < 2) return false;

      // Keep numeric-only answers (e.g., age) so sanitization doesn't strip the entire response.
      const lower = segment.toLowerCase();
      const systemWords = ['unknown', 'none', 'denied', 'none reported', 'not applicable', 'n/a'];
      if (systemWords.includes(lower)) return false;

      return true;
    });

    return {
      sanitized: validSegments.join('. '),
      rejected,
    };
  }

  /**
   * Tokenize text into sentences/segments
   */
  public tokenizeSentences(text: string): string[] {
    if (!text) return [];

    return text
      .split(/[.,?!;:\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Enhanced negation detection with context awareness
   */
  public isNegated(
    segment: string,
    keyword: string,
  ): { negated: boolean; hasAffirmation: boolean; contextWindow: string } {
    const PROXIMITY_WINDOW = 5;

    const normalizedSegment = segment
      .toLowerCase()
      .replace(/'/g, '-')
      .replace(/[^a-z0-9-\s]/g, ' ');
    const words = normalizedSegment.split(/\s+/).filter((w) => w.length > 0);
    const keywordWords = keyword.toLowerCase().split(/\s+/);

    if (keywordWords.length === 0 || words.length === 0) {
      return { negated: false, hasAffirmation: false, contextWindow: '' };
    }

    // Find keyword position
    let keywordStart = -1;
    for (let i = 0; i <= words.length - keywordWords.length; i++) {
      const window = words.slice(i, i + keywordWords.length).join(' ');
      const distance = getLevenshteinDistance(window, keyword.toLowerCase());

      if (distance <= Math.min(2, FUZZY_THRESHOLD)) {
        keywordStart = i;
        break;
      }
    }

    if (keywordStart === -1) {
      return { negated: false, hasAffirmation: false, contextWindow: '' };
    }

    // Check context window
    const start = Math.max(0, keywordStart - PROXIMITY_WINDOW - 5);
    const end = Math.min(words.length, keywordStart + keywordWords.length + PROXIMITY_WINDOW + 5);

    const contextWords = words.slice(start, end);
    const contextWindow = contextWords.join(' ');

    let hasNegation = false;
    let hasAffirmation = false;

    for (let k = 0; k < contextWords.length; k++) {
      const absolutePos = start + k;
      if (absolutePos >= keywordStart && absolutePos < keywordStart + keywordWords.length) {
        continue;
      }

      const currentWord = contextWords[k];

      if (NEGATION_KEYWORDS.some((neg) => currentWord === neg)) {
        const distance = absolutePos - keywordStart;

        if (distance < 0 && Math.abs(distance) <= PROXIMITY_WINDOW) {
          hasNegation = true;
        } else if (distance > 0 && distance <= 4) {
          const intermediateWords = words.slice(keywordStart + keywordWords.length, absolutePos);
          const hasConjunction = intermediateWords.some((w) =>
            ['but', 'and', 'or', 'though'].includes(w),
          );

          if (!hasConjunction) {
            hasNegation = true;
          }
        }
      }

      if (AFFIRMATIVE_KEYWORDS.some((aff) => currentWord === aff)) {
        if (Math.abs(absolutePos - keywordStart) <= 2) {
          hasAffirmation = true;
        }
      }
    }

    if (segment.toLowerCase().includes('denied') || segment.toLowerCase().includes('wala')) {
      hasNegation = true;
    }

    const negated = hasNegation && !hasAffirmation;

    return { negated, hasAffirmation, contextWindow };
  }

  /**
   * Analyze a single segment for keywords
   */
  protected analyzeSegment(segment: string, isUserInput: boolean): SegmentAnalysis {
    const potentialMatches: KeywordMatch[] = [];
    const activeMatches: KeywordMatch[] = [];
    const suppressedMatches: KeywordMatch[] = [];

    if (!isUserInput) {
      return {
        text: segment,
        isUserInput: false,
        potentialMatches: [],
        activeMatches: [],
        suppressedMatches: [],
        maxScore: 0,
      };
    }

    const keywordMap = this.getKeywords();
    const keywordList = Object.keys(keywordMap);

    const matches = findAllFuzzyMatches(segment, keywordList);

    for (const keyword of matches) {
      const severity = keywordMap[keyword];
      const negationResult = this.isNegated(segment, keyword);

      const match: KeywordMatch = {
        keyword,
        severity,
        negated: negationResult.negated,
        contextWindow: negationResult.contextWindow,
        affirmationFound: negationResult.hasAffirmation,
      };

      potentialMatches.push(match);

      if (negationResult.negated) {
        suppressedMatches.push(match);
      } else {
        activeMatches.push(match);
      }
    }

    const maxScore =
      activeMatches.length > 0 ? Math.max(...activeMatches.map((m) => m.severity)) : 0;

    return {
      text: segment,
      isUserInput: true,
      potentialMatches,
      activeMatches,
      suppressedMatches,
      maxScore,
    };
  }

  /**
   * Base detection logic
   */
  public detect(text: string, isUserInput: boolean = true) {
    const { sanitized, rejected } = this.sanitizeInput(text);

    if (!isUserInput) {
      return {
        sanitized,
        rejected,
        segments: [],
        score: 0,
        matchedKeywords: [] as string[],
      };
    }

    const segments = this.tokenizeSentences(sanitized.toLowerCase());
    const segmentAnalyses: SegmentAnalysis[] = [];
    const allActiveKeywords = new Set<string>();

    for (const segment of segments) {
      const analysis = this.analyzeSegment(segment, true);
      segmentAnalyses.push(analysis);

      for (const match of analysis.activeMatches) {
        allActiveKeywords.add(match.keyword);
      }
    }

    const matchedKeywords = Array.from(allActiveKeywords);
    const score =
      segmentAnalyses.length > 0 ? Math.max(...segmentAnalyses.map((s) => s.maxScore)) : 0;

    return {
      sanitized,
      rejected,
      segments: segmentAnalyses,
      score,
      matchedKeywords,
    };
  }
}
