// app.config.js
require("dotenv/config");

const baseConfig = require("./app.json");

/**
 * Dynamic configuration for Expo.
 * All sensitive values are read from environment variables (EXPO_PUBLIC_ prefix).
 * This ensures that credentials are not hardcoded in the source code or app.json.
 */
const envExtras = {
  backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL,
  apiUrl: process.env.EXPO_PUBLIC_BACKEND_URL,
  firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
};

// Filter out undefined values to avoid overriding app.json with undefined
const filteredEnvExtras = Object.fromEntries(
  Object.entries(envExtras).filter(([, value]) => value !== undefined && value !== ""),
);

module.exports = ({ config }) => {
  const extra = {
    ...(baseConfig.expo.extra || {}),
    ...(config?.extra || {}),
    ...filteredEnvExtras,
  };

  return {
    ...baseConfig,
    ...config,
    expo: {
      ...baseConfig.expo,
      ...config?.expo,
      extra,
    },
  };
};