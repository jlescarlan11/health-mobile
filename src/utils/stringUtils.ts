/**
 * Utility functions for string manipulation and fuzzy matching.
 * Stricter version with performance improvements.
 */

const FALSE_POSITIVES: Record<string, string[]> = {
  doing: ['dying'],
  laying: ['dying'],
  lying: ['dying'],
  trying: ['dying'],
  drying: ['dying'],
  'want to give': ['want to die'],

  // False positives for short Bicolano keywords
  bar: ['bari'], // 'bari' (broken)
  bare: ['bari'],
  bear: ['bari'],
  suck: ['suka'], // 'suka' (vomit)
  dug: ['dugi'], // 'dugi' (choking/fishbone)
  hopes: ['hapos'], // 'hapos' (asthma)
  hop: ['hapos'],
  pods: ['pudos'], // 'pudos' (shortness of breath)

  // Choking collisions (common -ing words)
  coming: ['choking'],
  cooking: ['choking'],
  joking: ['choking'],
  checking: ['choking'],
  shocking: ['choking'],
  clocking: ['choking'],
  booking: ['choking'],

  // Medicine vs Muscle Pain (gamot vs gadot)
  // Also common Bicolano words like 'gabot' (pull) and 'kadot' (pinch)
  gamot: ['gadot'],
  gabot: ['gadot'],
  kadot: ['gadot'],
};

export const FUZZY_THRESHOLD = 2;

/**
 * Calculates the Levenshtein distance between two strings.
 * Early termination when distance exceeds threshold.
 *
 * @param s1 The first string to compare.
 * @param s2 The second string to compare.
 * @param maxDistance Maximum distance threshold (early termination if exceeded).
 * @returns The Levenshtein distance, or Infinity if it exceeds maxDistance.
 */
export const getLevenshteinDistance = (
  s1: string,
  s2: string,
  maxDistance: number = Infinity,
): number => {
  if (s1.length > s2.length) {
    return getLevenshteinDistance(s2, s1, maxDistance);
  }

  const m = s1.length;
  const n = s2.length;

  if (n - m > maxDistance) return Infinity;
  if (m === 0) return n;

  let previousRow = Array.from({ length: m + 1 }, (_, i) => i);
  let currentRow = new Array(m + 1);

  for (let j = 0; j < n; j++) {
    currentRow[0] = j + 1;
    let minInRow = currentRow[0];

    for (let i = 0; i < m; i++) {
      const substitutionCost = s1[i] === s2[j] ? 0 : 1;
      currentRow[i + 1] = Math.min(
        previousRow[i + 1] + 1,
        currentRow[i] + 1,
        previousRow[i] + substitutionCost,
      );
      minInRow = Math.min(minInRow, currentRow[i + 1]);
    }

    if (minInRow > maxDistance) {
      return Infinity;
    }

    const temp = previousRow;
    previousRow = currentRow;
    currentRow = temp;
  }

  return previousRow[m];
};

/**
 * Normalizes and tokenizes text once for reuse.
 */
interface NormalizedText {
  normalized: string;
  tokens: string[];
  ngrams: Map<number, string[]>;
}

const normalizeAndTokenize = (text: string): NormalizedText => {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim();
  const tokens = normalized ? normalized.split(/\s+/) : [];

  return {
    normalized,
    tokens,
    ngrams: new Map(),
  };
};

/**
 * Generate n-grams with caching.
 */
const getNgrams = (textData: NormalizedText, n: number): string[] => {
  if (textData.ngrams.has(n)) {
    return textData.ngrams.get(n)!;
  }

  const { tokens } = textData;
  const ngrams: string[] = [];

  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }

  textData.ngrams.set(n, ngrams);
  return ngrams;
};

/**
 * Calculate threshold based on string length using percentage-based approach.
 * Stricter thresholds for better precision.
 */
const getThreshold = (length: number): number => {
  if (length <= 4) return 0; // Exact match only for very short words
  if (length <= 7) return 1; // 1 edit for medium words
  return Math.floor(length * 0.2); // 20% error rate for longer words
};

/**
 * Scans a text for ALL fuzzy matches against a list of keywords.
 * Stricter matching with performance optimizations.
 */
export const findAllFuzzyMatches = (text: string, keywords: string[]): string[] => {
  if (!text || !keywords || keywords.length === 0) return [];

  const found = new Set<string>();
  const textData = normalizeAndTokenize(text);

  if (textData.tokens.length === 0) return [];

  const normalizedKeywords = keywords
    .map((kw) => ({
      original: kw,
      normalized: kw.toLowerCase().trim(),
      wordCount: kw.trim().split(/\s+/).length,
    }))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  for (const { original, normalized, wordCount } of normalizedKeywords) {
    if (found.has(original)) continue;

    const len = normalized.length;
    const threshold = getThreshold(len);

    // Calculate valid length range for potential matches
    const minLen = Math.max(1, len - threshold);
    const maxLen = len + threshold;

    // Only generate n-grams for the actual word count needed
    const ngrams = getNgrams(textData, wordCount);

    for (const ngram of ngrams) {
      // Early exit: length filter
      if (ngram.length < minLen || ngram.length > maxLen) {
        continue;
      }

      // Early exit: first character must match (stricter matching)
      if (ngram[0] !== normalized[0]) {
        continue;
      }

      // Early exit: check false positives
      if (FALSE_POSITIVES[ngram]?.includes(original)) {
        continue;
      }

      // Calculate distance with threshold limit
      const distance = getLevenshteinDistance(ngram, normalized, threshold);

      if (distance <= threshold) {
        found.add(original);
        break;
      }
    }
  }

  return Array.from(found);
};

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
} as const;

const NUMBER_WORD_SET = new Set(Object.keys(NUMBER_WORDS));

const parseNumberWords = (text: string): number | null => {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let current: string[] = [];

  const flush = (): number | null => {
    if (current.length === 0) return null;
    let value = 0;
    let working = 0;

    for (const token of current) {
      if (token === 'and') continue;
      if (token === 'hundred') {
        working = (working || 1) * 100;
        continue;
      }
      const mapped = NUMBER_WORDS[token as keyof typeof NUMBER_WORDS];
      if (mapped === undefined) {
        return null;
      }
      working += mapped;
    }

    value += working;
    return value;
  };

  for (const token of tokens) {
    const parts = token.split('-').filter(Boolean);
    const isNumberWord = parts.every((part) => NUMBER_WORD_SET.has(part) || part === 'and');

    if (isNumberWord) {
      current.push(...parts);
      continue;
    }

    const parsed = flush();
    if (parsed !== null) return parsed;
    current = [];
  }

  const parsed = flush();
  return parsed !== null ? parsed : null;
};

const getFirstNonNegativeNumber = (text: string): number | null => {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return null;

  for (const match of matches) {
    if (!match.startsWith('-')) {
      return Number(match);
    }
  }

  return null;
};

/**
 * Normalizes a numeric value from free-form text.
 *
 * Spec (examples):
 * - "7/10" -> 7
 * - "7 out of 10" -> 7
 * - "7" or "it's a 7" -> 7
 * - "seven" or "forty-five" -> 7 / 45
 * - "5-7" or "between 5 and 7" -> 6 (midpoint)
 * - "moderate" -> null
 * - ""/null/undefined -> null
 *
 * Priority order when multiple numbers exist:
 * 1) Slash fraction ("/10") patterns (most specific).
 * 2) "out of 10" patterns.
 * 3) Numeric ranges like "5-7" or "between 5 and 7" (midpoint).
 * 4) Standalone numeric digits (first match).
 * 5) Written number words (first match).
 *
 * Limitations/assumptions:
 * - No clamping; callers decide range suitability.
 * - Negative numbers are not normalized.
 */
export const normalizeNumericValue = (text: string | null | undefined): number | null => {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lowerText = trimmed.toLowerCase();

  const fractionMatch = lowerText.match(/\b(\d+(?:\.\d+)?)\s*\/\s*10\b/i);
  if (fractionMatch?.[1]) {
    return Number(fractionMatch[1]);
  }

  const outOfMatch = lowerText.match(/\b(\d+(?:\.\d+)?)\s*out of\s*10\b/i);
  if (outOfMatch?.[1]) {
    return Number(outOfMatch[1]);
  }

  const betweenRangeMatch = lowerText.match(
    /\bbetween\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\b/i,
  );
  if (betweenRangeMatch?.[1] && betweenRangeMatch?.[2]) {
    const start = Number(betweenRangeMatch[1]);
    const end = Number(betweenRangeMatch[2]);
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      return (start + end) / 2;
    }
  }

  const dashRangeMatch = lowerText.match(/\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\b/i);
  if (dashRangeMatch?.[1] && dashRangeMatch?.[2]) {
    const start = Number(dashRangeMatch[1]);
    const end = Number(dashRangeMatch[2]);
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      return (start + end) / 2;
    }
  }

  const numericMatch = getFirstNonNegativeNumber(lowerText);
  if (numericMatch !== null) {
    return numericMatch;
  }

  const wordNumber = parseNumberWords(lowerText);
  return wordNumber !== null && !Number.isNaN(wordNumber) ? wordNumber : null;
};

/**
 * Formats a raw facility type (e.g., "health_center") into a title-cased string (e.g., "Health Center").
 */
export const formatFacilityType = (type: string): string => {
  if (!type) return '';
  return type
    .split(/[_\s]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};
