import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { isAxiosError } from 'axios';
import { fetchFacilitiesFromApi } from './facilityService';
import * as DB from './database';
import { Facility } from '../types';
import { API_URL } from './apiConfig';
import { getStoredAuthToken } from './authSession';

const HISTORY_SYNC_BACKOFF_KEY = 'history_sync_next_attempt_ms';
const MAX_FAILURES_PER_RUN = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 120_000;

const parseRetryAfterHeader = (value?: string): number | null => {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return Math.max(0, parsed - Date.now());
  }

  return null;
};

const computeBackoffDelay = (attempt: number, retryAfterHeader?: string): number => {
  const headerDelay = parseRetryAfterHeader(retryAfterHeader);
  if (headerDelay !== null) {
    return Math.min(headerDelay, MAX_BACKOFF_MS);
  }

  const exponent = Math.min(attempt, 6);
  const baseDelay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
  const jitter = Math.random() * 500;
  return Math.min(MAX_BACKOFF_MS, baseDelay + jitter);
};

const logRateLimitHeaders = (headers?: Record<string, unknown>) => {
  if (!headers) {
    return;
  }

  const details = [
    headers['retry-after'] ? `retry-after=${headers['retry-after']}` : null,
    headers['ratelimit-limit'] ? `limit=${headers['ratelimit-limit']}` : null,
    headers['ratelimit-remaining'] ? `remaining=${headers['ratelimit-remaining']}` : null,
    headers['ratelimit-reset'] ? `reset=${headers['ratelimit-reset']}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (details) {
    console.log(`[Sync] Rate limit headers: ${details}`);
  }
};

const scheduleNextSyncAfterDelay = async (
  delayMs: number,
  reason: string,
  retryAfterHeader?: string,
) => {
  const nextAllowed = Date.now() + delayMs;
  try {
    await AsyncStorage.setItem(HISTORY_SYNC_BACKOFF_KEY, nextAllowed.toString());
  } catch (error) {
    console.error('[Sync] Unable to persist history sync backoff state:', error);
  }

  console.log(
    `[Sync] ${reason}; next clinical history sync allowed at ${new Date(
      nextAllowed,
    ).toISOString()} (delay ${delayMs}ms, retry-after header: ${retryAfterHeader ?? 'n/a'}).`,
  );
};

export const syncClinicalHistory = async () => {
  const networkState = await NetInfo.fetch();
  if (!networkState.isConnected) {
    return false;
  }

  const backoffValue = await AsyncStorage.getItem(HISTORY_SYNC_BACKOFF_KEY);
  if (backoffValue) {
    const nextAllowedAt = Number(backoffValue);
    if (!Number.isNaN(nextAllowedAt) && Date.now() < nextAllowedAt) {
      console.log(
        `[Sync] Delaying clinical history sync until ${new Date(
          nextAllowedAt,
        ).toISOString()} (backoff in effect).`,
      );
      return false;
    }

    await AsyncStorage.removeItem(HISTORY_SYNC_BACKOFF_KEY);
  }

  const unsyncedRecords = await DB.getUnsyncedHistory();
  if (unsyncedRecords.length === 0) {
    return false;
  }

  const token = await getStoredAuthToken();
  const tokenPresent = Boolean(token);
  console.log(
    `[Sync] Starting clinical history sync. Batch size=${unsyncedRecords.length}, tokenPresent=${tokenPresent}`,
  );

  if (!token) {
    console.log('[Sync] Skipping clinical history sync because no authentication token is available.');
    return false;
  }

  let successCount = 0;
  let failureCount = 0;
  let firstFailureStatus: string | null = null;
  let transientBackoffAttempts = 0;

  for (const record of unsyncedRecords) {
    if (failureCount >= MAX_FAILURES_PER_RUN) {
      transientBackoffAttempts += 1;
      const delay = computeBackoffDelay(transientBackoffAttempts);
      await scheduleNextSyncAfterDelay(
        delay,
        `Stopped after ${failureCount} failures in one run`,
      );
      break;
    }

    const payload = {
      id: record.id,
      timestamp: record.timestamp,
      initial_symptoms: record.initial_symptoms,
      recommended_level: record.recommended_level,
      clinical_soap: record.clinical_soap,
      medical_justification: record.medical_justification,
      profile_snapshot: record.profile_snapshot ? JSON.parse(record.profile_snapshot) : null,
    };

    try {
      const response = await axios.post(`${API_URL}/history`, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 201 || response.status === 200) {
        await DB.markHistorySynced(record.id);
        successCount += 1;
        continue;
      }

      failureCount += 1;
      if (!firstFailureStatus) {
        firstFailureStatus = response.status.toString();
      }
      console.warn(
        `[Sync] Unexpected response status ${response.status} for record ${record.id}; skipping until next cycle.`,
      );
    } catch (error) {
      const axiosError = isAxiosError(error) ? error : null;
      const status = axiosError?.response?.status;
      failureCount += 1;

      const failureLabel = status ? status.toString() : axiosError?.code ?? 'network';
      if (!firstFailureStatus) {
        firstFailureStatus = failureLabel;
      }

      if (status === 401 || status === 403) {
        console.warn(
          `[Sync] Authentication error (${status}). Blocking clinical history sync until credentials are refreshed.`,
        );
        break;
      }

      const headers = axiosError?.response ? axiosError.response.headers : undefined;
      const retryAfterHeader = headers ? (headers['retry-after'] as string | undefined) : undefined;

      if (status === 429) {
        logRateLimitHeaders(headers);
        transientBackoffAttempts += 1;
        const delay = computeBackoffDelay(transientBackoffAttempts, retryAfterHeader);
        await scheduleNextSyncAfterDelay(
          delay,
          'Rate limit reached while syncing clinical history records',
          retryAfterHeader,
        );
        break;
      }

      if (!status) {
        transientBackoffAttempts += 1;
        const delay = computeBackoffDelay(transientBackoffAttempts);
        await scheduleNextSyncAfterDelay(
          delay,
          'Network error encountered during clinical history sync',
        );
        break;
      }

      if (status >= 500) {
        logRateLimitHeaders(headers);
        transientBackoffAttempts += 1;
        const delay = computeBackoffDelay(transientBackoffAttempts, retryAfterHeader);
        await scheduleNextSyncAfterDelay(
          delay,
          `Server error ${status} during clinical history sync`,
          retryAfterHeader,
        );
        break;
      }

      if (status >= 400) {
        console.error(
          `[Sync] Client error ${status} for record ${record.id}; skipping without retry.`,
        );
        continue;
      }

      transientBackoffAttempts += 1;
      const delay = computeBackoffDelay(transientBackoffAttempts);
      await scheduleNextSyncAfterDelay(delay, 'Unexpected error during clinical history sync');
      break;
    }
  }

  console.log(
    `[Sync] Clinical history sync complete. Batch=${unsyncedRecords.length}, success=${successCount}, failure=${failureCount}, firstFailure=${firstFailureStatus ?? 'none'}`,
  );

  if (successCount > 0) {
    console.log(`[Sync] Successfully synced ${successCount} clinical history records.`);
    return true;
  }

  return false;
};

export const syncFacilities = async () => {
  const state = await NetInfo.fetch();

  if (!state.isConnected) {
    throw new Error('Cannot sync: Offline');
  }

  try {
    console.log('Starting facilities sync...');
    const data = await fetchFacilitiesFromApi();

    let facilitiesToSave: Facility[] = [];
    if (Array.isArray(data)) {
      facilitiesToSave = data;
    } else if (data.facilities && Array.isArray(data.facilities)) {
      facilitiesToSave = data.facilities;
    }

    if (facilitiesToSave.length > 0) {
      await DB.saveFacilitiesFull(facilitiesToSave);
      const timestamp = Date.now();
      await AsyncStorage.setItem('last_sync_timestamp', timestamp.toString());
      console.log('Facilities sync completed successfully');
      return true;
    } else {
      console.log('No facilities data to sync');
      return false;
    }
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
};

export const getLastSyncTime = async (): Promise<number | null> => {
  try {
    const timestamp = await AsyncStorage.getItem('last_sync_timestamp');
    return timestamp ? parseInt(timestamp, 10) : null;
  } catch (error) {
    console.error('Error getting last sync time:', error);
    return null;
  }
};
