import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useUserLocation } from './useUserLocation';
import { useLocationAccessState } from './useLocationAccessState';

const LOCATION_POLL_INTERVAL = 4000;

export const useLocationAvailability = () => {
  const {
    location,
    errorMsg,
    manualDistrictId,
    permissionStatus,
    permissionCanAskAgain,
    locationServicesEnabled,
    requestPermission,
    getCurrentLocation,
    refreshPermissionStatus: baseRefreshPermissionStatus,
    setManualLocation,
  } = useUserLocation({
    watch: false,
    requestOnMount: false,
    showDeniedAlert: false,
  });

  const { canUseLocation, canRequestPermission, needsSettings } = useLocationAccessState({
    permissionStatus,
    canAskAgain: permissionCanAskAgain,
    locationServicesEnabled,
  });

  const prevCanUseLocationRef = useRef<boolean>(false);

  useEffect(() => {
    if (canUseLocation && !prevCanUseLocationRef.current) {
      getCurrentLocation();
    }
    prevCanUseLocationRef.current = canUseLocation;
  }, [canUseLocation, getCurrentLocation]);

  const refreshPermissionStatus = useCallback(
    () => baseRefreshPermissionStatus(),
    [baseRefreshPermissionStatus],
  );

  useFocusEffect(
    useCallback(() => {
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let isActive = true;
      let currentAppState: AppStateStatus = AppState.currentState;

      const clearPolling = () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      const startPolling = () => {
        if (intervalId) return;
        intervalId = setInterval(() => {
          if (!isActive || currentAppState !== 'active') return;
          refreshPermissionStatus();
        }, LOCATION_POLL_INTERVAL);
      };

      const handleAppStateChange = (nextState: AppStateStatus) => {
        currentAppState = nextState;
        if (!isActive) return;
        if (nextState === 'active') {
          refreshPermissionStatus();
          startPolling();
        } else {
          clearPolling();
        }
      };

      const subscription = AppState.addEventListener('change', handleAppStateChange);

      refreshPermissionStatus();
      if (currentAppState === 'active') {
        startPolling();
      }

      return () => {
        isActive = false;
        clearPolling();
        subscription.remove();
      };
    }, [refreshPermissionStatus]),
  );

  return {
    location,
    errorMsg,
    manualDistrictId,
    permissionStatus,
    permissionCanAskAgain,
    locationServicesEnabled,
    canUseLocation,
    canRequestPermission,
    needsSettings,
    requestPermission,
    getCurrentLocation,
    refreshPermissionStatus,
    setManualLocation,
  };
};
