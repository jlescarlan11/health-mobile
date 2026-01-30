import { Facility } from '../types';

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

export const formatDistance = (distanceInKm: number): string => {
  if (distanceInKm < 1) {
    return `${Math.round(distanceInKm * 1000)}m`;
  }
  return `${distanceInKm.toFixed(1)}km`;
};

/**
 * Finds the nearest facilities of specified types.
 * @param facilities List of facilities to search from
 * @param userLocation Current user location
 * @param types Array of facility types to look for
 * @returns An object mapping each type to its nearest facility (or null if not found)
 */
export const findNearestFacilitiesByType = (
  facilities: Facility[],
  userLocation: { latitude: number; longitude: number } | null,
  types: string[] = ['Hospital', 'Health Center'],
): Record<string, Facility | null> => {
  const result: Record<string, Facility | null> = {};

  // Initialize result with null for each requested type
  types.forEach((type) => {
    result[type] = null;
  });

  if (!facilities || !facilities.length || !userLocation) {
    return result;
  }

  facilities.forEach((facility) => {
    if (types.includes(facility.type)) {
      // Use existing distance if available, otherwise calculate it
      const distance =
        facility.distance ??
        calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          facility.latitude,
          facility.longitude,
        );

      const currentNearest = result[facility.type];

      // If none found yet for this type, or this one is closer
      if (!currentNearest || distance < (currentNearest.distance ?? Infinity)) {
        result[facility.type] = {
          ...facility,
          distance,
        };
      }
    }
  });

  return result;
};
