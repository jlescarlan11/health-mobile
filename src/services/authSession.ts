import * as SecureStore from 'expo-secure-store';

const AUTH_SESSION_STORAGE_KEY = 'health_mobile_auth_session';

export interface AuthSessionTokens {
  accessToken: string;
  refreshToken: string;
}

const readStoredSession = async (): Promise<AuthSessionTokens | null> => {
  try {
    const stored = await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    return JSON.parse(stored) as AuthSessionTokens;
  } catch (error) {
    console.error('[AuthSession] Failed to read stored auth session:', error);
    return null;
  }
};

/**
 * Retrieves the most recently saved access token or null if none is stored.
 */
export const getStoredAuthToken = async (): Promise<string | null> => {
  const session = await readStoredSession();
  return session?.accessToken ?? null;
};

/**
 * Retrieves the refresh token associated with the current session.
 */
export const getStoredRefreshToken = async (): Promise<string | null> => {
  const session = await readStoredSession();
  return session?.refreshToken ?? null;
};

/**
 * Persists both access and refresh tokens.
 */
export const storeAuthSession = async (tokens: AuthSessionTokens): Promise<void> => {
  try {
    await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error('[AuthSession] Failed to persist auth session:', error);
  }
};

/**
 * Clears the cached session tokens.
 */
export const clearStoredAuthSession = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('[AuthSession] Failed to clear stored auth session:', error);
  }
};

export const AUTH_TOKEN_KEY = AUTH_SESSION_STORAGE_KEY;
