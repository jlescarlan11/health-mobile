import React, { useEffect, useState, useMemo, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import { Provider as PaperProvider } from "react-native-paper";
import { Provider as StoreProvider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { Stack } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import * as SplashScreen from "expo-splash-screen";

import { store, persistor } from "../src/store";
import {
  OfflineBanner,
  SafetyRecheckModal,
  LoadingScreen,
} from "../src/components/common";
import { setOfflineStatus, setLastSync, syncCompleted } from "../src/store/offlineSlice";
import { updateProfile } from "../src/store/profileSlice";
import { syncFacilities, syncClinicalHistory, getLastSyncTime } from "../src/services/syncService";
import { loadStoredAuthToken } from "../src/store/authSlice";
import { initDatabase } from "../src/services/database";
import { getScaledTheme } from "../src/theme";
import { useAppSelector, useAdaptiveUI, useAppDispatch } from "../src/hooks";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  /* reloading the app might cause this to error */
});

function RootLayoutContent() {
  const dispatch = useAppDispatch();
  const isHighRisk = useAppSelector((state) => state.navigation.isHighRisk);
  const { scaleFactor, isPWDMode, layoutPadding } = useAdaptiveUI();
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const authToken = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const profile = useAppSelector((state) => state.profile);
  const isSignedIn = Boolean(authToken);
  const authTokenRef = useRef(authToken);
  const isSignedInOnMount = useRef(isSignedIn);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    syncClinicalHistory().catch((err) =>
      console.log("[Sync] Clinical history sync triggered after authentication:", err),
    );
  }, [authToken]);

  useEffect(() => {
    dispatch(loadStoredAuthToken());
  }, [dispatch]);

  const scaledTheme = useMemo(() => {
    const baseTheme = getScaledTheme(scaleFactor);
    if (!isPWDMode) {
      return baseTheme;
    }
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: "#FEF9F2",
        onBackground: "#1B1C1D",
        surface: "#FFFFFF",
        outline: "#7C3AED",
      },
      roundness: 18,
      rippleColor: "#E5E7EB",
    };
  }, [scaleFactor, isPWDMode]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    const firstName = authUser.firstName?.trim();
    const lastName = authUser.lastName?.trim();
    const derivedFullName = firstName && lastName ? `${firstName} ${lastName}` : null;
    const authDob = authUser.dateOfBirth ?? null;

    if (derivedFullName && profile.fullName !== derivedFullName) {
      dispatch(updateProfile({ fullName: derivedFullName }));
    }

    if (authDob && profile.dob !== authDob) {
      dispatch(updateProfile({ dob: authDob }));
    }
  }, [authUser, profile.fullName, profile.dob, dispatch]);

  useEffect(() => {
    // Check for high risk status on mount
    if (isHighRisk) {
      setSafetyModalVisible(true);
    }

    // Initialize Database and Sync
    const startup = async () => {
      try {
        await initDatabase();

        // Initial Sync Status Load
        const lastSync = await getLastSyncTime();
        if (lastSync) {
          store.dispatch(setLastSync(lastSync));
        }

        // Initial Sync
        syncFacilities()
          .then((synced) => {
            if (synced) {
              store.dispatch(syncCompleted());
            }
          })
          .catch((err) =>
            console.log("Initial facilities sync failed (likely offline or error):", err),
          );
        if (isSignedInOnMount.current) {
          syncClinicalHistory().catch((err) =>
            console.log("Initial clinical history sync failed (likely offline or error):", err),
          );
        } else {
          console.log("[Sync] Skipping initial clinical history sync until signed in.");
        }
      } catch (err) {
        console.error("Startup initialization failed:", err);
      } finally {
        await SplashScreen.hideAsync();
      }
    };

    startup();

    // Network Listener
    let wasOffline = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = !!state.isConnected;
      store.dispatch(setOfflineStatus(!isConnected));

      if (isConnected && wasOffline) {
        console.log("[Sync] Connection restored, triggering background sync...");
        syncFacilities()
          .then((synced) => {
            if (synced) {
              store.dispatch(syncCompleted());
            }
          })
          .catch(() => {});
        if (authTokenRef.current) {
          syncClinicalHistory().catch(() => {});
        } else {
          console.log("[Sync] Skipping clinical history sync after reconnection until signed in.");
        }
      }
      wasOffline = !isConnected;
    });

    return () => {
      unsubscribe();
    };
  }, [isHighRisk]);

  const handleDismissSafetyModal = () => {
    setSafetyModalVisible(false);
  };

  const adaptiveContainerStyle = [
    styles.container,
    isPWDMode && {
      paddingHorizontal: layoutPadding / 2,
      paddingTop: layoutPadding / 2,
      paddingBottom: layoutPadding / 2,
      backgroundColor: "#FEF9F2",
    },
  ];

  return (
    <PaperProvider theme={scaledTheme}>
      <View style={adaptiveContainerStyle}>
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#F5F7F8" },
          }}
        >
          <Stack.Screen name="(Home)" options={{ headerShown: false }} />
        </Stack>
        <SafetyRecheckModal
          visible={safetyModalVisible}
          onDismiss={handleDismissSafetyModal}
        />
      </View>
    </PaperProvider>
  );
}

export default function RootLayout() {
  // Catch any unhandled errors during module loading
  useEffect(() => {
    const errorHandler = (error: Error) => {
      if (
        error?.message?.includes("RNFBAppModule") ||
        error?.message?.includes("Native module")
      ) {
        console.warn(
          "Native module not available (expected in some development environments):",
          error.message,
        );
      }
    };

    // Set up global error handler
    const originalError = console.error;
    console.error = (...args) => {
      if (
        args[0]?.message?.includes("RNFBAppModule") ||
        args[0]?.message?.includes("Native module")
      ) {
        errorHandler(args[0]);
        return; // Suppress the error;
      }
      originalError(...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return (
    <StoreProvider store={store}>
      <PersistGate loading={<LoadingScreen />} persistor={persistor}>
        <SafeAreaProvider>
          <RootLayoutContent />
        </SafeAreaProvider>
      </PersistGate>
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
