import axios, { isAxiosError } from 'axios';
import { API_URL } from './apiConfig';
import type { AuthUser } from '../types/auth';

const AUTH_LOGIN_ENDPOINT = `${API_URL}/auth/login`;
const AUTH_SIGNUP_ENDPOINT = `${API_URL}/auth/signup`;

const DEFAULT_TIMEOUT_MS = 15000;

export interface BackendValidationIssue {
  path: (string | number)[];
  message: string;
}

export interface AuthApiError extends Error {
  status?: number;
  details?: BackendValidationIssue[];
}

const createAuthApiError = (message: string): AuthApiError => {
  const error = new Error(message) as AuthApiError;
  return error;
};

const sanitizeResponseBody = (body: unknown): unknown => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  const clone = { ...body } as Record<string, unknown>;
  ['password', 'token', 'passwordHash'].forEach((key) => {
    if (key in clone) {
      clone[key] = '[REDACTED]';
    }
  });
  return clone;
};

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const parseAuthResponse = (payload: unknown): AuthResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected authentication response from the server.');
  }

  const data = payload as Record<string, unknown> & {
    accessToken?: string;
    refreshToken?: string;
    token?: string;
    user?: AuthUser;
  };

  const accessToken =
    typeof data.accessToken === 'string'
      ? data.accessToken
      : typeof data.token === 'string'
      ? data.token
      : null;
  if (!accessToken) {
    throw new Error('Authentication succeeded but no access token was returned.');
  }

  if (!data.refreshToken || typeof data.refreshToken !== 'string') {
    throw new Error('Authentication succeeded but no refresh token was returned.');
  }

  if (!data.user || typeof data.user !== 'object') {
    throw new Error('Authentication succeeded but user profile data is missing.');
  }

  return {
    accessToken,
    refreshToken: data.refreshToken,
    user: data.user as AuthUser,
  };
};

const getBackendMessage = (response: any, fallback: string, defaultPrefix: string) => {
  const status = response?.status;
  const payload = response?.data;
  const detail = payload?.error || payload?.message;
  if (detail) {
    return detail;
  }
  if (status && status >= 500) {
    return `${defaultPrefix} (server returned ${status}).`;
  }
  return fallback;
};

const buildValidationDetails = (details: unknown): BackendValidationIssue[] | undefined => {
  if (!Array.isArray(details)) {
    return undefined;
  }
  return details.map((detail) => {
    const detailRecord = (detail as Record<string, unknown>) ?? {};
    const rawPath = detailRecord.path;
    const safePath = Array.isArray(rawPath) ? rawPath : [];
    const rawMessage = detailRecord.message;
    const message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage ?? 'Invalid value');
    return { path: safePath, message };
  });
};

const handleAxiosError = (error: unknown, fallback: string, defaultPrefix: string): AuthApiError => {
  if (isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      const payload = error.response.data;
      if (__DEV__) {
        console.warn('Authentication request failed', {
          status,
          payload: sanitizeResponseBody(payload),
        });
      }
      const message = getBackendMessage(error.response, fallback, defaultPrefix);
      const apiError = createAuthApiError(message);
      apiError.status = status;
      const details = buildValidationDetails(payload?.details);
      if (details?.length) {
        apiError.details = details;
      }
      return apiError;
    }
    if (error.request) {
      return createAuthApiError('Unable to reach the authentication service. Please check your network connection.');
    }
  }
  return createAuthApiError(fallback);
};

const buildRequest = async (
  endpoint: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
  defaultPrefix: string,
) => {
  try {
    const response = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return parseAuthResponse(response.data);
  } catch (error) {
    throw handleAxiosError(error, fallbackMessage, defaultPrefix);
  }
};

export interface SignInFormPayload {
  phoneNumber: string;
  password: string;
  [key: string]: string;
}

export interface SignUpFormPayload {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  password: string;
  confirmPassword: string;
  [key: string]: string;
}

export const signIn = (payload: SignInFormPayload) =>
  buildRequest(
    AUTH_LOGIN_ENDPOINT,
    payload,
    'Unable to sign in at the moment. Please try again later.',
    'Sign in failed',
  );

export const signUp = (payload: SignUpFormPayload) =>
  buildRequest(
    AUTH_SIGNUP_ENDPOINT,
    payload,
    'Unable to create your account right now. Please try again later.',
    'Sign up failed',
  );
