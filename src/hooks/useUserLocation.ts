import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { useDispatch, useSelector } from 'react-redux';
import { setUserLocation } from '../store/facilitiesSlice';
import { RootState } from '../store';
import { Alert, Linking } from 'react-native';
import { calculateDistance } from '../utils/locationUtils';
import { generateVisitorHash } from '../utils/privacyUtils';
import { sendFacilitySignal } from '../services/facilityService';
import { NAGA_CITY_DISTRICTS } from '../constants/location';

interface UseUserLocationOptions {
  watch?: boolean;
  requestOnMount?: boolean;
  showDeniedAlert?: boolean;
}

export const useUserLocation = (options: UseUserLocationOptions = { watch: false }) => {
  const { watch = false, requestOnMount = true, showDeniedAlert = true } = options;
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [manualDistrictId, setManualDistrictId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const dispatch = useDispatch();
  const facilities = useSelector((state: RootState) => state.facilities.facilities);
  const facilitiesRef = useRef(facilities);

  // Update facilities ref when Redux state changes, without triggering re-renders of callbacks
  useEffect(() => {
    facilitiesRef.current = facilities;
  }, [facilities]);

  // Persistence for dwell detection across location updates
  const dwellState = useRef<{
    facilityId: string | null;
    startTime: number | null;
    hasSignaled: boolean;
  }>({
    facilityId: null,
    startTime: null,
    hasSignaled: false,
  });

  /**
   * Evaluates proximity to healthcare facilities and manages dwell timing.
   * If a user remains within 50m of a facility for > 3 minutes, a visit signal is sent.
   */
  const checkProximity = useCallback((currentLocation: Location.LocationObject) => {
    const currentFacilities = facilitiesRef.current;
    if (!currentFacilities || currentFacilities.length === 0) return;

    const { latitude, longitude } = currentLocation.coords;
    let nearestFacilityId: string | null = null;
    let minDistance = Infinity;

    // Find the nearest facility within 50 meters (0.05 km)
    for (const facility of currentFacilities) {
      const distance = calculateDistance(
        latitude,
        longitude,
        facility.latitude,
        facility.longitude,
      );
      if (distance <= 0.05 && distance < minDistance) {
        minDistance = distance;
        nearestFacilityId = facility.id;
      }
    }

    const now = Date.now();
    const state = dwellState.current;

    if (nearestFacilityId) {
      if (state.facilityId === nearestFacilityId) {
        // User is still within the same facility radius
        const dwellDuration = now - (state.startTime || now);
        // Signal after 3 continuous minutes (180,000 ms)
        if (dwellDuration >= 3 * 60 * 1000 && !state.hasSignaled) {
          const visitorHash = generateVisitorHash();
          sendFacilitySignal(nearestFacilityId, visitorHash);
          state.hasSignaled = true;
        }
      } else {
        // Entered a new facility radius (or first detection)
        state.facilityId = nearestFacilityId;
        state.startTime = now;
        state.hasSignaled = false;
      }
    } else {
      // Not within any facility radius; reset dwell state
      state.facilityId = null;
      state.startTime = null;
      state.hasSignaled = false;
    }
  }, []); // No dependencies - uses facilitiesRef and dwellState refs

  const setManualLocation = useCallback(
    (districtId: string) => {
      const district = NAGA_CITY_DISTRICTS.find((d) => d.id === districtId);
      if (district) {
        setManualDistrictId(districtId);
        dispatch(
          setUserLocation({
            latitude: district.latitude,
            longitude: district.longitude,
          }),
        );
      }
    },
    [dispatch],
  );

  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);

      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        if (showDeniedAlert) {
          Alert.alert(
            'Location Permission Required',
            'This app needs access to your location to show nearby facilities. Please enable it in settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error requesting location permission:', err);
      return false;
    }
  }, [showDeniedAlert]);

  const refreshPermissionStatus = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(status);
      return status;
    } catch (error) {
      console.warn('Error refreshing location permission status:', error);
      return null;
    }
  }, []);

  const getCurrentLocation = useCallback(async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(location);
      checkProximity(location);
      dispatch(
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }),
      );
    } catch (error) {
      setErrorMsg('Error getting location');
      console.warn(error);
    }
  }, [dispatch, requestPermission, checkProximity]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(currentStatus);

      if (currentStatus !== 'granted') {
        if (!requestOnMount) return;
        const hasPermission = await requestPermission();
        if (!hasPermission) return;
      }

      // Get initial location immediately
      getCurrentLocation();

      if (watch) {
        try {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000, // Update every 5 seconds
              distanceInterval: 10, // Update every 10 meters
            },
            (newLocation) => {
              setLocation(newLocation);
              checkProximity(newLocation);
              dispatch(
                setUserLocation({
                  latitude: newLocation.coords.latitude,
                  longitude: newLocation.coords.longitude,
                }),
              );
            },
          );
        } catch (error) {
          console.warn('Error watching position:', error);
        }
      }
    };

    startWatching();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [watch, requestOnMount, checkProximity, dispatch, getCurrentLocation, requestPermission]);

  return {
    location,
    errorMsg,
    permissionStatus,
    manualDistrictId,
    requestPermission,
    getCurrentLocation,
    refreshPermissionStatus,
    setManualLocation,
  };
};
