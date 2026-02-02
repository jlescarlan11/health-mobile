import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_URL } from './apiConfig';
import {
  clearStoredAuthSession,
  getStoredAuthToken,
  getStoredRefreshToken,
  storeAuthSession,
} from './authSession';

const REFRESH_TIMEOUT_MS = 15000;

type RefreshFailureHandler = () => void;
const refreshFailureHandlers: RefreshFailureHandler[] = [];

export const registerRefreshFailureHandler = (handler: RefreshFailureHandler) => {
  refreshFailureHandlers.push(handler);
  return () => {
    const idx = refreshFailureHandlers.indexOf(handler);
    if (idx >= 0) {
      refreshFailureHandlers.splice(idx, 1);
    }
  };
};

const notifyRefreshFailureHandlers = () => {
  refreshFailureHandlers.slice().forEach((handler) => {
    try {
      handler();
    } catch (error) {
      console.error('[HttpClient] Refresh failure handler crashed', error);
    }
  });
};

const isTokenExpired = (token?: string | null): boolean => {
  if (!token) {
    return true;
  }
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    if (!decoded?.exp) {
      return true;
    }
    const expiryMs = decoded.exp * 1000;
    return expiryMs < Date.now() + 5000;
  } catch (error) {
    console.warn('[HttpClient] Failed to decode JWT exp claim', error);
    return true;
  }
};

const refreshClient = axios.create();

let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error('Refresh token is missing');
    }

    try {
      const response = await refreshClient.post(
        `${API_URL}/auth/refresh`,
        { refreshToken },
        { timeout: REFRESH_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
      );
      const payload = response.data;
      const accessToken =
        typeof payload?.accessToken === 'string'
          ? payload.accessToken
          : typeof payload?.token === 'string'
          ? payload.token
          : null;
      const nextRefreshToken = typeof payload?.refreshToken === 'string' ? payload.refreshToken : null;

      if (!accessToken || !nextRefreshToken) {
        throw new Error('Refresh response did not include the expected tokens.');
      }

      await storeAuthSession({
        accessToken,
        refreshToken: nextRefreshToken,
      });

      return accessToken;
    } catch (error) {
      await clearStoredAuthSession();
      notifyRefreshFailureHandlers();
      throw error;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const ensureAccessToken = async (): Promise<string | null> => {
  const storedToken = await getStoredAuthToken();
  if (storedToken && !isTokenExpired(storedToken)) {
    return storedToken;
  }

  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }

  return refreshAccessToken();
};

axios.interceptors.request.use(async (config) => {
  const token = await ensureAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const tokenExpired =
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      originalRequest &&
      !originalRequest._retry;

    if (tokenExpired) {
      originalRequest._retry = true;
      try {
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
