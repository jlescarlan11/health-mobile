import axios, { isAxiosError } from 'axios';
import { API_URL } from './apiConfig';
import type { AuthUser } from '../types/auth';

const AUTH_LOGIN_ENDPOINT = `${API_URL}/auth/login`;
const AUTH_SIGNUP_ENDPOINT = `${API_URL}/auth/signup`;

const DEFAULT_TIMEOUT_MS = 15000;

const parseAuthResponse = (payload: unknown): { token: string; user: AuthUser } => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected authentication response from the server.');
  }

  const data = payload as Record<string, unknown> & { token?: string; user?: AuthUser };
  if (!data.token || typeof data.token !== 'string') {
    throw new Error('Authentication succeeded but no token was returned.');
  }
  if (!data.user || typeof data.user !== 'object') {
    throw new Error('Authentication succeeded but user profile data is missing.');
  }

  return { token: data.token, user: data.user as AuthUser };
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

const handleAxiosError = (error: unknown, fallback: string, defaultPrefix: string) => {
  if (isAxiosError(error)) {
    if (error.response) {
      return getBackendMessage(error.response, fallback, defaultPrefix);
    }
    if (error.request) {
      return 'Unable to reach the authentication service. Please check your network connection.';
    }
  }
  return fallback;
};

const buildRequest = async (endpoint: string, payload: Record<string, unknown>, fallbackMessage: string, defaultPrefix: string) => {
  try {
    const response = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return parseAuthResponse(response.data);
  } catch (error) {
    const message = handleAxiosError(error, fallbackMessage, defaultPrefix);
    throw new Error(message);
  }
};

export interface SignInFormPayload {
  phoneNumber: string;
  password: string;
}

export interface SignUpFormPayload {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  password: string;
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
