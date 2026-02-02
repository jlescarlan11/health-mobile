import axios, { isAxiosError } from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../services/apiConfig';
import { detectEmergency, isNegated } from '../services/emergencyDetector';
import { detectMentalHealthCrisis } from '../services/mentalHealthDetector';
import { applyHedgingCorrections } from '../utils/hedgingDetector';
import {
  calculateTriageScore,
  normalizeSlot,
} from '../utils/aiUtils';
import { AssessmentResponse } from '../types';
import {
  AssessmentProfile,
  AssessmentQuestion,
  TriageAdjustmentRule,
  TriageLogic,
  TriageCareLevel,
  TriageAssessmentRequest,
  TriageAssessmentResponse,
} from '../types/triage';
import {
  TriageAssessmentRequestSchema,
  TriageAssessmentResponseSchema,
} from '../schemas/triageSchema';
import { ZodError } from 'zod';

export class TriageContractError extends Error {
  constructor(
    message: string,
    public code: 'VALIDATION_ERROR' | 'VERSION_MISMATCH' | 'NETWORK_ERROR' | 'SERVER_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = 'TriageContractError';
  }
}

// Configuration - API_KEY and MODEL_NAME are removed as they are now handled by the backend
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_VERSION = 2; // Increment when cache structure changes
const MAX_RETRIES = 3;
const RATE_LIMIT_RPM = 15;
const RATE_LIMIT_DAILY = 1500;
const STORAGE_KEY_DAILY_COUNT = 'gemini_daily_usage_count';
const STORAGE_KEY_DAILY_DATE = 'gemini_daily_usage_date';
const STORAGE_KEY_CACHE_PREFIX = 'gemini_cache_';
const STORAGE_KEY_LAST_CLEANUP = 'gemini_last_cache_cleanup';
const STORAGE_KEY_RPM_TIMESTAMPS = 'gemini_rpm_timestamps';

const CLINICAL_PROFILE_CONTEXT_MESSAGE_LIMIT = 20;

const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000;
const PROFILE_CACHE_PREFIX = 'clinical_profile_cache_';
const PROFILE_CACHE_VERSION = 1;

const PLAN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PLAN_CACHE_PREFIX = 'assessment_plan_cache_';
const PLAN_CACHE_VERSION = 1;

const normalizeCacheInput = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const getAssessmentPlanCacheKey = (
  symptom: string,
  patientContext?: string,
  fullName?: string | null,
): string => {
  const base = normalizeCacheInput(symptom || '');
  let key = `${PLAN_CACHE_PREFIX}${base}`;
  if (patientContext && patientContext.trim()) {
    key += `|ctx:${simpleHash(normalizeCacheInput(patientContext))}`;
  }
  if (fullName && fullName.trim()) {
    key += `|name:${simpleHash(normalizeCacheInput(fullName))}`;
  }
  return key;
};

const simpleHash = (value: string): string => {
  let hash = 0;
  if (!value || value.length === 0) {
    return '0';
  }
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const getHistoryHash = (text: string): string => simpleHash(normalizeCacheInput(text || ''));
const getProfileCacheKey = (historyHash: string): string =>
  `${PROFILE_CACHE_PREFIX}${historyHash}|v${PROFILE_CACHE_VERSION}`;

const TRUNCATED_BODY_LIMIT = 1200;
const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'set-cookie']);

const truncateForLog = (value: string, limit = TRUNCATED_BODY_LIMIT) =>
  value.length <= limit ? value : `${value.slice(0, limit)}... (truncated)`;

const safeJsonStringify = (value: unknown) => {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const describeResponseBody = (body: unknown) => truncateForLog(safeJsonStringify(body));

const sanitizeHeaders = (headers?: Record<string, unknown>) => {
  if (!headers) return {};
  const sanitized: Record<string, unknown> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) return;
    sanitized[key] = value;
  });
  return sanitized;
};

type ResponseDiagnostics = {
  status?: number;
  headers: Record<string, unknown>;
  bodyPreview: string;
};

const describeHttpResponse = (response?: {
  status?: number;
  headers?: Record<string, unknown>;
  data?: unknown;
}): ResponseDiagnostics => ({
  status: response?.status,
  headers: sanitizeHeaders(response?.headers),
  bodyPreview: describeResponseBody(response?.data),
});

interface ClinicalProfileCacheEntry {
  data: AssessmentProfile;
  timestamp: number;
  version: number;
}

interface AssessmentPlanCacheEntry {
  data: { questions: AssessmentQuestion[]; intro?: string };
  timestamp: number;
  version: number;
}

interface RecommendationNarrativeInput {
  initialSymptom?: string;
  profileSummary?: string;
  answers?: string;
  selectedOptions?: string;
  recommendedLevel?: string;
  keyConcerns?: string[];
  relevantServices?: string[];
  redFlags?: string[];
  clinicalSoap?: string;
}

interface RecommendationNarrativeOutput {
  recommendationNarrative: string;
  handoverNarrative: string;
}

class NonRetryableError extends Error {
  public readonly isRetryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface CacheEntry {
  data: AssessmentResponse;
  timestamp: number;
  version: number;
}

export class GeminiClient {
  private requestTimestamps: number[]; // For RPM tracking
  private cacheQueue: Promise<void>; // For non-blocking cache operations
  private profileCacheQueue: Promise<void>;
  private inFlightProfileExtractions: Map<string, Promise<AssessmentProfile>>;

  constructor() {
    this.requestTimestamps = [];
    this.cacheQueue = Promise.resolve();
    this.profileCacheQueue = Promise.resolve();
    this.inFlightProfileExtractions = new Map<string, Promise<AssessmentProfile>>();
  }

  /**
   * Shared helper for backend AI requests.
   * Applies the centralized rate limit + retry policy.
   */
  private async callBackendAI(
    endpoint: string,
    data: any,
  ): Promise<any> {
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        await this.checkRateLimits();

        const response = await axios.post(`${API_URL}/ai${endpoint}`, data, {
            timeout: 30000,
        });
        
        return response.data;
      } catch (error) {
        const errMessage = (error as Error).message || 'Unknown error';

        if (!this.isTransientFailure(error)) {
          console.error(`[GeminiClient] Non-retryable backend error at ${endpoint}:`, errMessage);
          throw error;
        }

        attempt += 1;
        console.warn(`[GeminiClient] Backend attempt ${attempt} failed at ${endpoint}:`, errMessage);

        if (attempt >= MAX_RETRIES) {
          throw error;
        }

        const delay = this.getRetryDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Failed to connect to AI service after multiple attempts.');
  }

  /**
   * Normalizes strings used for cache keys to avoid volatility from whitespace or casing.
   */
  private normalizeCacheKeyInput(value: string): string {
    return value.replace(/\s+/g, ' ').toLowerCase().trim();
  }

  /**
   * Generates a cache key based on symptoms, history, and an optional override input.
   */
  private getCacheKey(
    symptoms: string,
    history: ChatMessage[] = [],
    cacheKeyInput?: string,
    patientContext?: string,
  ): string {
    const overrideSource = cacheKeyInput?.trim() ? cacheKeyInput : symptoms;
    const symptomsKey = this.normalizeCacheKeyInput(overrideSource);
    let key = symptomsKey;

    if (history.length > 0) {
      // Hash conversation for fixed-length keys
      const historyStr = history.map((m) => `${m.role}:${m.text}`).join('|');
      const historyHash = this.simpleHash(historyStr);
      key = `${key}|h:${historyHash}`;
    }

    if (patientContext && patientContext.trim()) {
      const contextHash = this.simpleHash(this.normalizeCacheKeyInput(patientContext));
      key = `${key}|ctx:${contextHash}`;
    }

    return key;
  }

  /**
   * Simple hash function for generating fixed-length cache keys.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Enforces rate limiting (RPM and Daily) with persistent RPM tracking.
   */
  private async checkRateLimits(): Promise<void> {
    const now = Date.now();

    // 1. RPM Check (Persistent)
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_RPM_TIMESTAMPS);
      const timestamps = stored ? JSON.parse(stored) : [];

      // Filter and check
      this.requestTimestamps = timestamps.filter((t: number) => now - t < 60 * 1000);

      if (this.requestTimestamps.length >= RATE_LIMIT_RPM) {
        const oldest = this.requestTimestamps[0];
        const waitTime = 60 * 1000 - (now - oldest) + 500;
        console.warn(`[GeminiClient] RPM limit reached. Waiting ${waitTime}ms.`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      console.warn('Failed to check RPM limits:', error);
      // Fallback to in-memory tracking
      this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60 * 1000);
    }

    // 2. Daily Limit Check (Persistent)
    try {
      const todayStr = new Date().toDateString();
      const storedDate = await AsyncStorage.getItem(STORAGE_KEY_DAILY_DATE);
      let count = 0;

      if (storedDate === todayStr) {
        const storedCount = await AsyncStorage.getItem(STORAGE_KEY_DAILY_COUNT);
        count = storedCount ? parseInt(storedCount, 10) : 0;
      } else {
        // Reset for new day
        await AsyncStorage.setItem(STORAGE_KEY_DAILY_DATE, todayStr);
      }

      if (count >= RATE_LIMIT_DAILY) {
        throw new NonRetryableError('Daily AI request limit reached. Please try again tomorrow.');
      }

      // Increment and save
      await AsyncStorage.setItem(STORAGE_KEY_DAILY_COUNT, (count + 1).toString());
    } catch (error) {
      console.warn('Failed to check daily limits:', error);
    }

    // Record timestamp and persist (fire-and-forget)
    this.requestTimestamps.push(now);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_RPM_TIMESTAMPS,
        JSON.stringify(this.requestTimestamps),
      );
    } catch (e) {
      console.warn('Failed to persist RPM state:', e);
    }
  }

  /**
   * Periodically clears cache entries that are expired or no longer match the current version.
   * Runs if more than 24 hours have passed since the last cleanup trigger.
   */
  private async performCacheCleanup(): Promise<void> {
    try {
      const now = Date.now();
      const lastCleanup = await AsyncStorage.getItem(STORAGE_KEY_LAST_CLEANUP);
      const lastCleanupTime = lastCleanup ? parseInt(lastCleanup, 10) : 0;

      if (now - lastCleanupTime > 24 * 60 * 60 * 1000) {
        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = (allKeys || []).filter((key) => key.startsWith(STORAGE_KEY_CACHE_PREFIX));

        if (cacheKeys.length > 0) {
          const keyPairs = await AsyncStorage.multiGet(cacheKeys);
          const keysToRemove: string[] = [];

          keyPairs.forEach(([key, cachedJson]) => {
            if (!cachedJson) {
              keysToRemove.push(key);
              return;
            }

            try {
              const cached = JSON.parse(cachedJson) as CacheEntry;
              const age = now - (typeof cached.timestamp === 'number' ? cached.timestamp : 0);

              if (cached.version !== CACHE_VERSION || age >= CACHE_TTL_MS) {
                keysToRemove.push(key);
              }
            } catch (parseError) {
              keysToRemove.push(key);
              console.warn(
                '[GeminiClient] Failed to parse cache entry during cleanup:',
                parseError,
              );
            }
          });

          if (keysToRemove.length > 0) {
            await AsyncStorage.multiRemove(keysToRemove);
            console.log(
              `[GeminiClient] Removed ${keysToRemove.length} expired or version-mismatched cache entries.`,
            );
          }
        }

        await AsyncStorage.setItem(STORAGE_KEY_LAST_CLEANUP, now.toString());
      }
    } catch (error) {
      console.warn('[GeminiClient] Periodic cache cleanup failed:', error);
    }
  }

  /**
   * Manually clears all cached assessments from storage.
   * Useful for debugging or when a user wants to reset their assessment history.
   */
  public async clearCache(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = (allKeys || []).filter((key) => key.startsWith(STORAGE_KEY_CACHE_PREFIX));

      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
        console.log(`[GeminiClient] Manually cleared ${cacheKeys.length} cache entries.`);
      }
    } catch (error) {
      console.error('[GeminiClient] Failed to clear assessment cache:', error);
      throw new Error('Failed to clear assessment cache.');
    }
  }


  /**
   * Calculates retry delay with jitter to prevent thundering herd.
   */
  private getRetryDelay(attempt: number): number {
    const baseDelay = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000; // 0-1000ms random jitter
    return baseDelay + jitter;
  }

  /**
   * Produces the initial assessment plan (Call #1) with caching.
   */
  public async generateAssessmentPlan(
    initialSymptom: string,
    patientContext?: string,
    fullName?: string | null,
  ): Promise<{ questions: AssessmentQuestion[]; intro?: string }> {
    const cacheKey = getAssessmentPlanCacheKey(initialSymptom, patientContext, fullName);

    try {
      const cachedJson = await AsyncStorage.getItem(cacheKey);
      if (cachedJson) {
        const cached = JSON.parse(cachedJson) as AssessmentPlanCacheEntry;
        if (
          cached.version === PLAN_CACHE_VERSION &&
          Date.now() - cached.timestamp < PLAN_CACHE_TTL_MS
        ) {
          console.log('[GeminiClient] Returning cached assessment plan');
          return cached.data;
        }

        await AsyncStorage.removeItem(cacheKey);
      }
    } catch (cacheReadError) {
      console.warn('[GeminiClient] Assessment plan cache read failed:', cacheReadError);
    }

    try {
      const plan = await this.callBackendAI('/plan', {
        initialSymptom,
        patientContext,
        fullName,
      });

      AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: plan,
          timestamp: Date.now(),
          version: PLAN_CACHE_VERSION,
        } as AssessmentPlanCacheEntry),
      ).catch((cacheWriteError) =>
        console.warn('[GeminiClient] Assessment plan cache write failed:', cacheWriteError),
      );

      return plan;
    } catch (error) {
      console.error('[GeminiClient] Failed to generate assessment plan:', error);
      // Let the caller handle it
      throw error;
    }
  }

  /**
   * Refines the assessment plan by generating focused follow-up questions based on the current profile.
   */
  public async refineAssessmentPlan(
    currentProfile: AssessmentProfile,
    remainingCount: number,
  ): Promise<AssessmentQuestion[]> {
    try {
      const result = await this.callBackendAI('/refine-plan', {
        currentProfile,
        remainingCount,
      });

      return result.questions || [];
    } catch (error) {
      console.error('[GeminiClient] Failed to refine assessment plan:', error);
      return [];
    }
  }

  public async expandAssessment(context: any): Promise<{ questions: AssessmentQuestion[] }> {
    try {
      const result = await this.callBackendAI('/expand-assessment', context);
      return result;
    } catch (error) {
      console.error('[GeminiClient] Failed to expand assessment:', error);
      return { questions: [] };
    }
  }

  /**
   * Generates a single, targeted follow-up question for immediate drill-down.
   */
  public async generateImmediateFollowUp(
    profile: AssessmentProfile,
    context: string,
  ): Promise<AssessmentQuestion> {
    try {
      const result = await this.callBackendAI('/follow-up', {
        profile,
        context,
      });

      return result.question;
    } catch (error) {
      console.error('[GeminiClient] Failed to generate immediate follow-up:', error);
      return {
        id: `fallback-${Date.now()}`,
        text: 'Could you tell me more about that specific symptom?',
        type: 'text',
        tier: 3,
        is_red_flag: false,
      };
    }
  }

  public async generateBridgeMessage(args: {
    lastUserAnswer: string;
    nextQuestion: string;
  }): Promise<string> {
    try {
        const result = await this.callBackendAI('/bridge', {
            lastUserAnswer: args.lastUserAnswer,
            nextQuestion: args.nextQuestion,
        });
        return result.message;
    } catch (error) {
        console.error('[GeminiClient] Failed to generate bridge message:', error);
        return '';
    }
  }

  public async generateRecommendationNarratives(
    input: RecommendationNarrativeInput,
  ): Promise<RecommendationNarrativeOutput> {
    try {
        const result = await this.callBackendAI('/narrative', { input });
        return result;
    } catch (error) {
      console.error('[GeminiClient] Narrative generation failed:', error);
      return {
        recommendationNarrative: 'AI narrative unavailable. Please proceed with the recommended care level.',
        handoverNarrative: 'Handover details unavailable.',
      };
    }
  }

  /**
   * Extracts the final clinical profile (Call #2) with caching and de-duplication.
   */
  public async extractClinicalProfile(
    history: { role: 'assistant' | 'user'; text: string }[],
    options?: {
      currentProfileSummary?: string;
      previousProfile?: AssessmentProfile;
    },
  ): Promise<AssessmentProfile> {
    const profileSummary =
      options?.currentProfileSummary?.trim() || 'No previous profile summary is available.';

    // Prune history to last N messages
    const recentMessages = history
      .filter((msg) => msg.text && msg.text.trim())
      .slice(-CLINICAL_PROFILE_CONTEXT_MESSAGE_LIMIT);

    const historyHash = getHistoryHash(`${profileSummary}||${JSON.stringify(recentMessages)}`);
    const versionedHistoryKey = `${historyHash}|v${PROFILE_CACHE_VERSION}`;
    const cacheKey = getProfileCacheKey(historyHash);

    try {
      const cachedJson = await AsyncStorage.getItem(cacheKey);
      if (cachedJson) {
        const cached = JSON.parse(cachedJson) as ClinicalProfileCacheEntry;
        if (
          cached.version === PROFILE_CACHE_VERSION &&
          Date.now() - cached.timestamp < PROFILE_CACHE_TTL_MS
        ) {
          console.log('[GeminiClient] Returning cached clinical profile');
          return cached.data;
        }
        await AsyncStorage.removeItem(cacheKey);
      }
    } catch (cacheReadError) {
      console.warn('[GeminiClient] Clinical profile cache read failed:', cacheReadError);
    }

    const inflight = this.inFlightProfileExtractions.get(versionedHistoryKey);
    if (inflight) {
      return inflight;
    }

    const persistProfileToCache = (profile: AssessmentProfile) => {
      this.profileCacheQueue = this.profileCacheQueue
        .then(() =>
          AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({
              data: profile,
              timestamp: Date.now(),
              version: PROFILE_CACHE_VERSION,
            } as ClinicalProfileCacheEntry),
          ),
        )
        .catch((error) =>
          console.warn('[GeminiClient] Clinical profile cache write failed:', error),
        );
    };

    const requestPromise = (async () => {
      try {
        const profile = await this.callBackendAI('/profile', {
            history: recentMessages,
            options,
        });

        profile.age = normalizeSlot(profile.age);
        profile.duration = normalizeSlot(profile.duration);
        profile.severity = normalizeSlot(profile.severity);
        profile.progression = normalizeSlot(profile.progression);
        profile.red_flag_denials = normalizeSlot(profile.red_flag_denials, { allowNone: true });

        const correctedProfile = applyHedgingCorrections(profile);

        const { score, escalated_category } = calculateTriageScore({
          ...correctedProfile,
          symptom_text: recentMessages.map(m => m.text).join('\n'),
        });

        correctedProfile.triage_readiness_score = score;
        correctedProfile.symptom_category = escalated_category;

        if (escalated_category === 'complex' || escalated_category === 'critical') {
          correctedProfile.is_complex_case = true;
        }

        persistProfileToCache(correctedProfile);
        return correctedProfile;
      } catch (error) {
        console.error('[GeminiClient] Failed to extract profile:', error);

        return {
          age: null,
          duration: null,
          severity: null,
          progression: null,
          red_flag_denials: null,
          uncertainty_accepted: false,
          summary: 'Failed to extract summary from backend.',
          denied_symptoms: [],
          covered_symptoms: [],
        };
      }
    })();

    this.inFlightProfileExtractions.set(versionedHistoryKey, requestPromise);
    requestPromise.finally(() => {
      this.inFlightProfileExtractions.delete(versionedHistoryKey);
    });

    return requestPromise;
  }

  /**
   * Simplified unary response generator for ad-hoc prompts.
   */
  public async getGeminiResponse(prompt: string): Promise<string> {
    try {
        const response = await axios.post(`${API_URL}/ai/chat`, { prompt });
        return response.data.text.trim();
    } catch (error) {
      console.error('[GeminiClient] getGeminiResponse failed:', error);
      throw error;
    }
  }

  /**
   * Streams AI output similarly to the legacy approach while still respecting rate limits.
   */
  public async *streamGeminiResponse(
    prompt: string | any[],
    options?: {
      generationConfig?: { responseMimeType: string };
      chunkSize?: number;
    },
  ): AsyncGenerator<string, void, unknown> {
    try {
      const response = await axios.post(`${API_URL}/ai/chat`, { prompt });
      const responseText = response.data.text;
      const chunkSize = options?.chunkSize ?? 20;

      for (let i = 0; i < responseText.length; i += chunkSize) {
        yield responseText.slice(i, i + chunkSize);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } catch (error) {
      console.error('[GeminiClient] streamGeminiResponse failed:', error);
      throw error;
    }
  }

  /**
   * Refines follow-up questions while leveraging centralized retry handling.
   */
  public async refineQuestion(questionText: string, userAnswer: string): Promise<string> {
    try {
        const result = await this.callBackendAI('/refine-question', {
            questionText,
            userAnswer,
        });
        return result.refinedQuestion || questionText;
    } catch (error) {
      console.error('[GeminiClient] Failed to refine question:', error);
      return questionText;
    }
  }

  public async evaluateTriageState(args: {
    history: any[];
    profile: AssessmentProfile;
    currentTurn: number;
    totalPlannedQuestions: number;
    remainingQuestions: any[];
    previousProfile?: AssessmentProfile;
    clarificationAttempts: number;
  }): Promise<any> {
    try {
      const result = await this.callBackendAI('/evaluate-triage', args);
      return result;
    } catch (error) {
      console.error('[GeminiClient] Failed to evaluate triage state:', error);
      // Fallback to a safe CONTINUE signal if backend fails
      return {
        signal: 'CONTINUE',
        reason: 'Backend evaluation failed, continuing as fallback.',
      };
    }
  }

  public async triageAssess(args: TriageAssessmentRequest): Promise<TriageAssessmentResponse> {
    const trimmedFullName =
      typeof args.fullName === 'string' ? args.fullName.trim() : '';
    const requestPayload = {
      ...args,
      fullName: trimmedFullName || undefined,
    };

    try {
      TriageAssessmentRequestSchema.parse(requestPayload);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error('[GeminiClient] triageAssess request validation failed:', error.issues);
        throw new TriageContractError(
          'Invalid triage request payload',
          'VALIDATION_ERROR',
          error.issues,
        );
      }
      throw error;
    }

    try {
      const response = await axios.post(`${API_URL}/v1/triage/assess`, requestPayload, {
        timeout: 45000, // Longer timeout for orchestration
      });

      const responseDiagnostics = describeHttpResponse(response);
      const validationResult = TriageAssessmentResponseSchema.safeParse(response.data);

      if (!validationResult.success) {
        console.error('[GeminiClient] triageAssess response validation failed:', {
          ...responseDiagnostics,
          validationIssues: validationResult.error.issues,
          validationError: validationResult.error,
        });
        throw new TriageContractError(
          'Incompatible API response structure',
          'VALIDATION_ERROR',
          {
            ...responseDiagnostics,
            validationIssues: validationResult.error.issues,
          },
        );
      }

      const validatedData = validationResult.data;

      if (validatedData.version !== 'v1') {
        console.error('[GeminiClient] triageAssess version mismatch:', {
          ...responseDiagnostics,
          receivedVersion: validatedData.version,
          expectedVersion: 'v1',
        });
        throw new TriageContractError(
          'API version mismatch',
          'VERSION_MISMATCH',
          {
            ...responseDiagnostics,
            receivedVersion: validatedData.version,
            expectedVersion: 'v1',
          },
        );
      }

      return validatedData as TriageAssessmentResponse;
    } catch (error) {
      if (isAxiosError(error)) {
        const responseDiagnostics = describeHttpResponse(error.response);
        const baseLogEntry = {
          ...responseDiagnostics,
          message: error.message,
        };

        if (responseDiagnostics.status === 400) {
          console.error('[GeminiClient] triageAssess contract mismatch (HTTP 400):', baseLogEntry);
          throw new TriageContractError(
            'Contract validation failed against the triage service',
            'VALIDATION_ERROR',
            baseLogEntry,
          );
        }

        if (responseDiagnostics.status && responseDiagnostics.status >= 500) {
          console.error(
            `[GeminiClient] triageAssess server error (HTTP ${responseDiagnostics.status}):`,
            baseLogEntry,
          );
          throw new TriageContractError(
            'Triage service internal error',
            'SERVER_ERROR',
            baseLogEntry,
          );
        }

        console.error('[GeminiClient] triageAssess network error:', baseLogEntry);
        throw new TriageContractError(
          'Failed to connect to triage service',
          'NETWORK_ERROR',
          baseLogEntry,
        );
      }

      console.error('[GeminiClient] triageAssess unexpected error:', error);
      throw error;
    }
  }

  /**
   * Initializes triage logic metadata with a stable original level.
   */
  private createTriageLogic(original: TriageCareLevel): TriageLogic {
    return {
      original_level: original,
      final_level: original,
      adjustments: [],
    };
  }

  private isEmergencyLocalOnlyToggleEnabled(): boolean {
    return Constants.expoConfig?.extra?.forceEmergencyLocalFallback === true;
  }

  /**
   * Appends a triage adjustment entry and updates the final level.
   */
  private appendTriageAdjustment(
    logic: TriageLogic,
    from: TriageCareLevel,
    to: TriageCareLevel,
    rule: TriageAdjustmentRule,
    reason: string,
  ): TriageLogic {
    return {
      original_level: logic.original_level,
      final_level: to,
      adjustments: [
        ...logic.adjustments,
        {
          from,
          to,
          rule,
          reason,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Only transient failures can be retried.
   */
  private isTransientFailure(error: unknown): boolean {
    if (error instanceof NonRetryableError) {
      return false;
    }

    if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status && status >= 500 && status < 600) return true;
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) return true;
        if (!error.response) return true; // Network errors
    }

    return false;
  }

  /**
   * Main assessment function.
   */
  public async assessSymptoms(
    symptoms: string,
    history: ChatMessage[] = [],
    safetyContext?: string,
    profile?: AssessmentProfile,
    cacheKeyInput?: string,
    patientContext?: string,
  ): Promise<AssessmentResponse> {
    // 0. Periodic Cleanup (non-blocking)
    this.performCacheCleanup().catch((e) => console.warn('Cleanup failed:', e));

    // 1. Safety Overrides (Local Logic)
    const scanInput = safetyContext || symptoms;
    const historyContext = history.length > 0 ? history.map((h) => h.text).join('\n') : undefined;

    const emergency = detectEmergency(scanInput, {
      isUserInput: true,
      historyContext: historyContext,
      profile: profile,
      questionId: 'final_safety_scan',
    });

    let emergencyFallback: AssessmentResponse | null = null;

    if (emergency.isEmergency && !profile?.is_recent_resolved) {
      console.log(
        `[GeminiClient] Emergency detected locally (${emergency.matchedKeywords.join(', ')}). Preparing fallback and attempting AI enrichment.`, 
      );

      let advice =
        'CRITICAL: Potential life-threatening condition detected based on your symptoms. Go to the nearest emergency room or call emergency services immediately.';

      if (emergency.affectedSystems.includes('Trauma')) {
        advice =
          'CRITICAL: Severe injury detected. Please go to the nearest emergency room immediately for urgent trauma care.';
      } else if (
        emergency.affectedSystems.includes('Cardiac') ||
        emergency.affectedSystems.includes('Respiratory')
      ) {
        advice =
          'CRITICAL: Potential life-threatening cardiovascular or respiratory distress detected. Seek emergency medical care immediately.';
      } else if (emergency.affectedSystems.includes('Neurological')) {
        advice =
          'CRITICAL: Potential neurological emergency detected. Please go to the nearest emergency room immediately.';
      }

      emergencyFallback = {
        recommended_level: 'emergency',
        follow_up_questions: [],
        user_advice: advice,
        clinical_soap: `S: Patient reports ${emergency.matchedKeywords.join(', ')}. O: AI detected critical emergency keywords (${emergency.affectedSystems.join(', ')}). A: Potential life-threatening condition. P: Immediate ED referral.`,
        key_concerns: emergency.matchedKeywords.map((k) => `Urgent: ${k}`),
        critical_warnings: ['Life-threatening condition possible', 'Do not delay care'],
        relevant_services: ['Emergency'],
        red_flags: emergency.matchedKeywords,
        triage_readiness_score: 1.0,
        medical_justification: emergency.medical_justification,
        triage_logic: this.appendTriageAdjustment(
          this.createTriageLogic('emergency'),
          'emergency',
          'emergency',
          emergency.affectedSystems.includes('Cardiac')
            ? 'SYSTEM_BASED_LOCK_CARDIAC'
            : 'RED_FLAG_UPGRADE',
          emergency.medical_justification || 'Emergency override triggered by keyword detector.',
        ),
      };
    }

    const mhCrisis = detectMentalHealthCrisis(scanInput);
    if (mhCrisis.isCrisis) {
      const response: AssessmentResponse = {
        recommended_level: 'emergency',
        follow_up_questions: [],
        user_advice:
          'Your symptoms indicate a mental health crisis. You are not alone. Please reach out to a crisis hotline or go to the nearest hospital immediately.',
        clinical_soap: `S: Patient reports ${mhCrisis.matchedKeywords.join(', ')}. O: AI detected crisis keywords. A: Mental health crisis. P: Immediate psychiatric evaluation/intervention.`,
        key_concerns: ['Risk of self-harm or severe distress'],
        critical_warnings: ['You are not alone. Professional help is available now.'],
        relevant_services: ['Mental Health'],
        red_flags: mhCrisis.matchedKeywords,
        triage_readiness_score: 1.0,
        medical_justification: mhCrisis.medical_justification,
        triage_logic: this.appendTriageAdjustment(
          this.createTriageLogic('emergency'),
          'emergency',
          'emergency',
          'MENTAL_HEALTH_OVERRIDE',
          mhCrisis.medical_justification || 'Mental health crisis detected',
        ),
      };

      this.logFinalResult(response, scanInput);
      return response;
    }

    if (this.isEmergencyLocalOnlyToggleEnabled() && emergencyFallback) {
      console.warn(
        '[GeminiClient] Emergency local-only toggle enabled; returning local emergency fallback without calling Gemini.',
      );
      this.logFinalResult(emergencyFallback, symptoms);
      return emergencyFallback;
    }

    // 2. Cache Check (non-blocking read)
    const cacheKey = this.getCacheKey(symptoms, history, cacheKeyInput, patientContext);
    const fullCacheKey = `${STORAGE_KEY_CACHE_PREFIX}${cacheKey}`;

    if (!emergencyFallback) {
      try {
        const cachedJson = await AsyncStorage.getItem(fullCacheKey);
        if (cachedJson) {
          const cached = JSON.parse(cachedJson) as CacheEntry;
          if (cached.version === CACHE_VERSION && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            console.log('[GeminiClient] Returning cached response from storage');
            this.logFinalResult(cached.data, symptoms);
            return cached.data;
          } else {
            await AsyncStorage.removeItem(fullCacheKey);
          }
        }
      } catch (error) {
        console.warn('[GeminiClient] Cache read failed:', error);
      }
    }

    // 3. Backend Call
    try {
        const parsed = await this.callBackendAI('/assess', {
            symptoms,
            history,
            patientContext,
        });

        // --- ENFORCE EMERGENCY FALLBACK IF APPLICABLE ---
        if (emergencyFallback) {
          console.log('[GeminiClient] Applying Emergency System Lock to AI Response.');
          parsed.recommended_level = 'emergency';
          parsed.triage_logic = emergencyFallback.triage_logic;

          parsed.red_flags = Array.from(
            new Set([...(parsed.red_flags || []), ...emergencyFallback.red_flags]),
          );

          parsed.triage_readiness_score = 1.0;

          if (!parsed.relevant_services || parsed.relevant_services.length === 0) {
            parsed.relevant_services = ['Emergency'];
          }
        }

        const levels: TriageCareLevel[] = ['self_care', 'health_center', 'hospital', 'emergency'];
        let targetLevel = parsed.recommended_level as TriageCareLevel;
        const originalLevel = targetLevel;
        parsed.triage_logic = this.createTriageLogic(originalLevel);
        parsed.is_conservative_fallback = false;

        const denials = (profile?.red_flag_denials || '').toLowerCase();
        const historyContextText = history.length > 0 ? history.map((h) => h.text).join(' ') : '';
        const combinedText = `${symptoms} ${historyContextText}`.toLowerCase();

        const positiveRedFlags = (parsed.red_flags || []).filter((rf: string) => {
          const { negated } = isNegated(denials, rf);
          if (negated) return false;
          if (profile?.denial_confidence === 'low') return false;
          return true;
        });

        const criticalKeywords = ['breathing', 'chest pain', 'confusion', 'bleeding'];
        const isCriticalMissing = 
          !profile?.red_flags_resolved &&
          criticalKeywords.some((k) => {
            if (!combinedText.includes(k)) return false;
            const { negated } = isNegated(denials, k);
            return !negated;
          });
        
        const isCriticalFriction = 
          profile?.clinical_friction_detected &&
          criticalKeywords.some((k) => (profile.clinical_friction_details as any)?.toLowerCase?.().includes?.(k));

        const hasPositiveRedFlag = positiveRedFlags.length > 0;
        const hasCriticalRisk = isCriticalMissing || isCriticalFriction;

        if ((hasPositiveRedFlag || hasCriticalRisk) && targetLevel !== 'emergency') {
          const fromLevel = targetLevel;
          targetLevel = 'emergency';
          parsed.is_conservative_fallback = true;
          parsed.triage_logic = this.appendTriageAdjustment(
            parsed.triage_logic,
            fromLevel,
            'emergency',
            'RED_FLAG_UPGRADE',
            hasPositiveRedFlag
              ? `Positive red flags detected: ${positiveRedFlags.join(', ')}`
              : `Critical risk unresolved or contradictory.`,
          );
        }

        const readinessThreshold = profile?.is_vulnerable ? 0.9 : 0.8;
        const isLowReadiness =
          parsed.triage_readiness_score !== undefined &&
          parsed.triage_readiness_score < readinessThreshold;
        const isAmbiguous = parsed.ambiguity_detected === true;

        const needsConservativeStepUp = (isLowReadiness) || isAmbiguous;

        if (needsConservativeStepUp && levels.indexOf(targetLevel) < 3) {
          const currentLevelIdx = levels.indexOf(targetLevel);
          const nextLevel = levels[currentLevelIdx + 1] as TriageCareLevel;
          
          const fromLevel = targetLevel;
          targetLevel = nextLevel;
          parsed.is_conservative_fallback = true;
          parsed.triage_logic = this.appendTriageAdjustment(
            parsed.triage_logic,
            fromLevel,
            nextLevel,
            'READINESS_UPGRADE',
            `triage_readiness_score ${parsed.triage_readiness_score ?? 'N/A'} or ambiguity triggered conservative upgrade.`,
          );
        }

        if (profile?.is_recent_resolved && levels.indexOf(targetLevel) < 2) {
          const fromLevel = targetLevel;
          targetLevel = 'hospital';
          parsed.is_conservative_fallback = true;
          parsed.triage_logic = this.appendTriageAdjustment(
            parsed.triage_logic,
            fromLevel,
            'hospital',
            'RECENT_RESOLVED_FLOOR',
            `Recent resolved symptom requires hospital evaluation.`,
          );

          const temporalNote =
            '\n\nWhile your symptoms have eased, the type of event you described still needs prompt evaluation to rule out time-sensitive conditions.';
          if (!parsed.user_advice.includes(temporalNote)) {
            parsed.user_advice += temporalNote;
          }
        }

        this.synchronizeAssessmentResponse(parsed, targetLevel);

        if (parsed.triage_logic) {
          parsed.triage_logic = {
            ...parsed.triage_logic,
            final_level: parsed.recommended_level as TriageCareLevel,
          };
        }

        this.cacheQueue = this.cacheQueue
          .then(() =>
            AsyncStorage.setItem(
              fullCacheKey,
              JSON.stringify({
                data: parsed,
                timestamp: Date.now(),
                version: CACHE_VERSION,
              } as CacheEntry),
            ),
          )
          .catch((error) => console.warn('[GeminiClient] Cache write failed:', error));

        this.logFinalResult(parsed, symptoms);
        return parsed;
    } catch (error) {
        if (emergencyFallback) {
          console.warn('[GeminiClient] Backend unavailable for emergency case. Using local fallback.');
          this.logFinalResult(emergencyFallback, symptoms);
          return emergencyFallback;
        }
        throw error;
    }
  }

  private synchronizeAssessmentResponse(
    response: AssessmentResponse,
    targetLevel: TriageCareLevel,
  ): AssessmentResponse {
    if (response.recommended_level === targetLevel) return response;

    const fromLevel = response.recommended_level;
    response.recommended_level = targetLevel;

    const serviceMap: Record<TriageCareLevel, any[]> = {
      self_care: ['Consultation'],
      health_center: ['Primary Care', 'Consultation'],
      hospital: ['General Medicine', 'Internal Medicine', 'Laboratory'],
      emergency: ['Emergency', 'Trauma Care'],
    };

    const targetServices = serviceMap[targetLevel];
    response.relevant_services = Array.from(new Set([...response.relevant_services, ...targetServices]));

    const needsMajorOverride =
      !response.user_advice ||
      targetLevel === 'emergency' ||
      (fromLevel as string) === 'emergency';

    if (needsMajorOverride) {
      switch (targetLevel) {
        case 'emergency':
          response.user_advice =
            'CRITICAL: Your symptoms require immediate medical attention. Please go to the nearest Emergency Room or call emergency services immediately.';
          break;
        case 'hospital':
          response.user_advice =
            'Based on the complexity of your symptoms, we recommend a professional evaluation at a Hospital. While no immediate life-threatening signs are present, diagnostics are advised.';
          break;
        case 'health_center':
          response.user_advice =
            'We recommend visiting your local Health Center for a professional check-up. This is appropriate for your current symptoms to ensure proper care and monitoring.';
          break;
        case 'self_care':
          response.user_advice =
            'Your symptoms appear manageable at home with rest and monitoring. Follow the self-care steps below and seek medical help if your condition worsens.';
          break;
      }
    }

    return response;
  }

  private logFinalResult(recommendation: AssessmentResponse, assessmentText: string) {
    const levelLabel = recommendation.recommended_level.replace(/_/g, ' ').toUpperCase();
    console.log(`[GeminiClient] FINAL RESULT: ${levelLabel}`);
  }
}

export const geminiClient = new GeminiClient();
