import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_STORAGE_KEY = 'health_mobile_auth_token';

/**
 * Retrieves the JWT that represents the current authenticated session.
 * Returns null when no token is cached or SecureStore access fails.
 */
export const getStoredAuthToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('[AuthSession] Failed to load stored auth token:', error);
    return null;
  }
};

/**
 * Persists the provided JWT so background sync helpers can reuse it.
 */
export const storeAuthToken = async (token: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.error('[AuthSession] Failed to persist auth token:', error);
  }
};

/**
 * Removes the cached token, typically when we detect authentication failure.
 */
export const clearStoredAuthToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('[AuthSession] Failed to clear stored auth token:', error);
  }
};

export const AUTH_TOKEN_KEY = AUTH_TOKEN_STORAGE_KEY;
