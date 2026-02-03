import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import * as DB from '../services/database';
import type { RootState } from './index';
import { syncClinicalHistory } from '../services/syncService';
import { AssessmentResponse } from '../types';

export interface LatestAssessment {
  id: string;
  clinical_soap: string;
  recommended_level: string;
  medical_justification?: string;
  final_disposition: AssessmentResponse['final_disposition'];
  initial_symptoms: string;
  timestamp: number;
  isGuest?: boolean;
  profile_snapshot?: string;
}

interface OfflineState {
  isOffline: boolean;
  lastSync: number | null;
  pendingSyncs: number;
  latestAssessment: LatestAssessment | null;
}

const initialState: OfflineState = {
  isOffline: false,
  lastSync: null,
  pendingSyncs: 0,
  latestAssessment: null,
};

// Simple UUID generator
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Persistence Thunk
export const saveClinicalNote = createAsyncThunk(
  'offline/saveClinicalNote',
  async (
    payload: Omit<LatestAssessment, 'id' | 'timestamp' | 'profile_snapshot'>,
    { dispatch, getState },
  ): Promise<LatestAssessment | null> => {
    const state = getState() as RootState;
    const profile = state.profile;
    const medications = state.medication?.items?.filter((m) => m.is_active) || [];

    // For Guest Mode: We update Redux but SKIP DB persistence and exclude profile details
    if (payload.isGuest) {
      const guestRecord: LatestAssessment = {
        ...payload,
        id: generateUUID(),
        timestamp: Date.now(),
        profile_snapshot: undefined, // Explicitly exclude profile for guests
        final_disposition: payload.final_disposition,
      };
      
      console.log('[Offline] Guest mode assessment detected. Updating Redux only.');
      dispatch(updateLatestAssessment(guestRecord));
      return guestRecord;
    }

    // VALIDATION: Ensure the profile is non-empty (at least Name or DOB)
    if (!profile.fullName && !profile.dob) {
      console.warn(
        '[Offline] Profile is empty (missing Name and DOB). Skipping clinical history persistence to prevent anonymous records.',
      );
      return null;
    }

    const record: LatestAssessment = {
      ...payload,
      id: generateUUID(),
      timestamp: Date.now(),
      profile_snapshot: JSON.stringify({
        ...profile,
        medications,
      }),
    };

    try {
      // Persist to SQLite
      await DB.saveClinicalHistory({
        id: record.id,
        timestamp: record.timestamp,
        initial_symptoms: record.initial_symptoms,
        recommended_level: record.recommended_level,
        clinical_soap: record.clinical_soap,
        medical_justification: record.medical_justification || '',
        profile_snapshot: record.profile_snapshot,
      });

      // Update Redux state via reducer
      dispatch(updateLatestAssessment(record));

      // Trigger background sync if online and authenticated
      if (!state.offline.isOffline && Boolean(state.auth.token)) {
        syncClinicalHistory().catch((err) =>
          console.log('[Sync] Background history sync triggered after save:', err),
        );
      } else if (!state.auth.token) {
        console.log('[Sync] Skipping background history sync until signed in.');
      }

      return record;
    } catch (error) {
      console.error('Failed to persist clinical history to database:', error);
      // Still update Redux so UI shows the result, even if DB write failed
      dispatch(updateLatestAssessment(record));
      return record;
    }
  },
);

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setOfflineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOffline = action.payload;
    },
    syncCompleted: (state) => {
      state.lastSync = Date.now();
      state.pendingSyncs = Math.max(0, state.pendingSyncs - 1);
    },
    setLastSync: (state, action: PayloadAction<number>) => {
      state.lastSync = action.payload;
    },
    addPendingSync: (state) => {
      state.pendingSyncs += 1;
    },
    resetSyncStatus: (state) => {
      state.pendingSyncs = 0;
    },
    updateLatestAssessment: (state, action: PayloadAction<LatestAssessment>) => {
      state.latestAssessment = action.payload;
    },
    clearLatestAssessment: (state) => {
      state.latestAssessment = null;
    },
  },
});

export const {
  setOfflineStatus,
  syncCompleted,
  setLastSync,
  addPendingSync,
  resetSyncStatus,
  updateLatestAssessment,
  clearLatestAssessment,
} = offlineSlice.actions;

// Selectors
export const selectLatestClinicalNote = (state: RootState) =>
  state.offline.latestAssessment;

export default offlineSlice.reducer;
