import Constants from 'expo-constants';
import { Platform } from 'react-native';
import axios from 'axios';

const ensureApiBase = (url?: string) => {
  if (!url) return url;
  const normalized = url.replace(/\/+$/, '');
  if (/\/api(\/|$)/.test(normalized)) return normalized;
  return `${normalized}/api`;
};

const getApiUrl = () => {
  const configUrl = Constants.expoConfig?.extra?.apiUrl || Constants.expoConfig?.extra?.backendUrl;

  if (configUrl && configUrl !== 'http://localhost:3000/api' && !configUrl.includes('process.env')) {
    return ensureApiBase(configUrl);
  }

  if (Platform.OS !== 'web' && __DEV__) {
    const debuggerHost =
      Constants.manifest2?.extra?.expoGo?.debuggerHost || Constants.expoConfig?.hostUri;
    if (debuggerHost) {
      const ipMatch = debuggerHost.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        const detectedUrl = `http://${ipMatch[1]}:3000/api`;
        console.log(`[ApiConfig] Auto-detected backend URL: ${detectedUrl}`);
        return ensureApiBase(detectedUrl);
      }
    }

    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ipMatch = hostUri.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        const detectedUrl = `http://${ipMatch[1]}:3000/api`;
        console.log(`[ApiConfig] Auto-detected backend URL from manifest: ${detectedUrl}`);
        return ensureApiBase(detectedUrl);
      }
    }

    console.error('[ApiConfig] Could not auto-detect server IP. Backend requests will fail on physical device.');
    console.error('[ApiConfig] Please set EXPO_PUBLIC_BACKEND_URL in .env file (e.g., EXPO_PUBLIC_BACKEND_URL=http://192.168.1.4:3000/api)');
    console.error('[ApiConfig] Your Metro bundler IP is shown in the Expo start output (e.g., exp://192.168.1.4:8081)');
  }

  return ensureApiBase(configUrl || 'http://localhost:3000/api');
};

export const API_URL = getApiUrl();

export interface FeedbackReportPayload {
  subject?: string;
  message: string;
  contactEmail?: string;
  context?: Record<string, unknown>;
}

export const submitFeedbackReport = async (payload: FeedbackReportPayload) => {
  // Mock implementation: resolve quickly so the UI can simulate success/failure.
  // Replace this stub with a POST to `${API_URL}/admin/feedback` when the real endpoint is ready.
  await new Promise<void>((resolve) => setTimeout(resolve, 600));

  return {
    status: 'mock',
    submittedAt: new Date().toISOString(),
    payload,
  };
};

export const transferAssessmentResult = async (
  targetUsername: string,
  assessmentData: unknown,
) => {
  const response = await axios.post(
    `${API_URL}/assessments/transfer`,
    {
      targetUsername,
      assessmentData,
    },
    { timeout: 15000 },
  );

  return response.data;
};
