import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  createMigrate,
  getStoredState,
  PersistConfig,
} from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from './secureStorage';

import authReducer from './authSlice';
import facilitiesReducer from './facilitiesSlice';
import navigationReducer from './navigationSlice';
import offlineReducer from './offlineSlice';
import settingsReducer from './settingsSlice';
import medicationReducer from './medicationSlice';
import profileReducer from './profileSlice';
import feedReducer from './feedSlice';

// Re-export reducers for convenience
export { default as authReducer } from './authSlice';
export { default as facilitiesReducer } from './facilitiesSlice';
export { default as navigationReducer } from './navigationSlice';
export { default as offlineReducer } from './offlineSlice';
export { default as settingsReducer } from './settingsSlice';
export { default as medicationReducer } from './medicationSlice';
export { default as profileReducer } from './profileSlice';
export { default as feedReducer } from './feedSlice';

const ROOT_KEY = 'health-app-root';
const LEGACY_ROOT_KEY = 'root';

/**
 * Custom storage wrapper to handle migration from legacy generic 'root' key
 * to project-specific 'health-app-root' key.
 */
const crossAppSafeStorage = {
  ...AsyncStorage,
  getItem: async (key: string) => {
    const value = await AsyncStorage.getItem(key);
    if (!value && key === `persist:${ROOT_KEY}`) {
      const legacyValue = await AsyncStorage.getItem(`persist:${LEGACY_ROOT_KEY}`);
      if (legacyValue) {
        console.log(`[Persistence] Migrating legacy storage from ${LEGACY_ROOT_KEY} to ${ROOT_KEY}`);
        await AsyncStorage.setItem(key, legacyValue);
        // We keep legacy for one session for safety, or we could remove it.
        // Given PII concerns, we'll remove it after a successful migration check in the future,
        // but for now we just ensure connectivity.
      }
      return legacyValue;
    }
    return value;
  },
};

const migrations = {
  1: (state: Record<string, unknown> | undefined) => {
    // Surgical removal of legacy auth state if it exists
    if (state && state.auth) {
      const newState = { ...state };
      delete newState.auth;
      return newState;
    }
    return state;
  },
  2: (state: Record<string, unknown> | undefined) => {
    // Purge enrollment state when migrating to version 2
    if (state && state.enrollment) {
      const newState = { ...state };
      delete newState.enrollment;
      return newState;
    }
    return state;
  },
  3: (state: Record<string, unknown> | undefined) => {
    // Ensure specializedModes is initialized in settings to prevent crashes
    if (state && state.settings && !(state.settings as Record<string, unknown>).specializedModes) {
      return {
        ...state,
        settings: {
          ...(state.settings as Record<string, unknown>),
          specializedModes: {
            isSenior: false,
            isPWD: false,
            isChronic: false,
          },
        },
      };
    }
    return state;
  },
  4: (state: Record<string, unknown> | undefined) => {
    // Initialize new profile health fields if they don't exist
    if (state && state.profile && (state.profile as Record<string, unknown>).chronicConditions === undefined) {
      return {
        ...state,
        profile: {
          ...(state.profile as Record<string, unknown>),
          chronicConditions: [],
          allergies: [],
          currentMedications: [],
          surgicalHistory: null,
          familyHistory: null,
        },
      };
    }
    return state;
  },
  5: (state: Record<string, unknown> | undefined) => {
    // Deprecate currentMedications from profile (moved to medicationSlice)
    if (state && state.profile && (state.profile as Record<string, unknown>).currentMedications) {
      const newProfile = { ...(state.profile as Record<string, unknown>) };
      delete newProfile.currentMedications;
      return {
        ...state,
        profile: newProfile,
      };
    }
    return state;
  },
  6: (state: Record<string, unknown> | undefined) => {
    // Version 6: Reduce PII footprint by nullifying deprecated fields
    if (state && state.profile) {
      const profile = { ...(state.profile as Record<string, unknown>) };
      profile.username = null;
      profile.phoneNumber = null;
      console.log('[Persistence] Nullifying deprecated PII fields in profile');
      return {
        ...state,
        profile,
      };
    }
    return state;
  },
};

/**
 * Persist config for the sensitive profile slice using SecureStore.
 * Includes a fallback to migrate data from the legacy root AsyncStorage if needed.
 */
const profilePersistConfig = {
  key: 'profile',
  keyPrefix: 'secure_',
  storage: secureStorage,
  getStoredState: async (config: PersistConfig<unknown>) => {
    try {
      // 1. Try to get from SecureStore
      const state = await getStoredState(config);
      if (state) return state;

      // 2. Fallback: try to migrate from legacy root storage in AsyncStorage
      // We look for the profile field within the root persistence object
      const rootPersistKeys = [`persist:${ROOT_KEY}`, `persist:${LEGACY_ROOT_KEY}`];
      for (const rootKey of rootPersistKeys) {
        const rootData = await AsyncStorage.getItem(rootKey);
        if (rootData) {
          const parsedRoot = JSON.parse(rootData);
          if (parsedRoot.profile) {
            console.log(`[Persistence] Migrating profile from legacy root (${rootKey}) to SecureStore`);
            const profileState = JSON.parse(parsedRoot.profile);
            // Apply v6 migration logic manually if migrating from old storage
            profileState.username = null;
            profileState.phoneNumber = null;
            return profileState;
          }
        }
      }
    } catch (error) {
      console.error('[Persistence] Profile migration error:', error);
    }
    return undefined;
  },
};

const rootReducer = combineReducers({
  auth: authReducer,
  facilities: facilitiesReducer,
  navigation: navigationReducer,
  offline: offlineReducer,
  settings: settingsReducer,
  medication: medicationReducer,
  profile: persistReducer(profilePersistConfig as any, profileReducer),
  feed: feedReducer,
});

const persistConfig = {
  key: ROOT_KEY,
  version: 6,
  storage: crossAppSafeStorage,
  whitelist: ['settings', 'navigation', 'offline', 'medication', 'feed'],
  migrate: createMigrate(migrations as any, { debug: false }),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        warnAfter: 128,
      },
      immutableCheck: {
        warnAfter: 128,
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
