import axios from 'axios';
import { API_URL } from './apiConfig';
import {
  getFacilities as getFacilitiesFromDb,
  saveFacilitiesFull as saveFacilitiesToDb,
} from './database';
import NetInfo from '@react-native-community/netinfo';
import { normalizeFacilitiesApiResponse } from '../utils/validation';

/**
 * Sends a privacy-preserving proximity signal for a facility.
 * @param facilityId The ID of the facility visited.
 * @param visitorHash The daily rotating visitor hash.
 */
export const sendFacilitySignal = async (facilityId: string, visitorHash: string) => {
  try {
    const timestamp = new Date().toISOString();
    await axios.post(`${API_URL}/facilities/signal`, {
      facilityId,
      visitorHash,
      timestamp,
    });
  } catch (error) {
    // Fail silently to avoid interrupting user experience, but log for debugging
    console.warn(`[FacilityService] Failed to send proximity signal for ${facilityId}:`, error);
  }
};

export const fetchFacilitiesFromApi = async () => {
  try {
    const response = await axios.get(`${API_URL}/facilities`);
    const normalized = normalizeFacilitiesApiResponse(response.data);
    if (normalized.rejectedCount > 0) {
      console.warn(
        `[FacilityService] Dropped ${normalized.rejectedCount} malformed facility record(s) from API response.`,
      );
    }
    return normalized.data;
  } catch (error: unknown) {
    console.error('Error fetching facilities from API:', error);
    throw error;
  }
};

export const getFacilities = async () => {
  const netInfo = await NetInfo.fetch();

  if (netInfo.isConnected) {
    try {
      const data = await fetchFacilitiesFromApi();
      // Optionally cache the data here as well, or rely on the background sync service.
      // For robust fallback, it's good to cache on every successful fetch.
      // We need to match the data structure expected by saveFacilities.
      // Assuming response.data is the array or has a facilities property.
      // Based on existing logs: response.data?.facilities?.length or response.data?.length

      let facilitiesToSave: unknown[] = [];
      if (Array.isArray(data)) {
        facilitiesToSave = data;
      } else if (data.facilities && Array.isArray(data.facilities)) {
        facilitiesToSave = data.facilities;
      }

      const normalized = normalizeFacilitiesApiResponse(facilitiesToSave);

      if (normalized.facilities.length > 0) {
        saveFacilitiesToDb(normalized.facilities).catch((err) =>
          console.error('Failed to cache facilities:', err),
        );
      }

      return normalizeFacilitiesApiResponse(data).data;
    } catch (error) {
      console.warn('API fetch failed, falling back to local database:', error);
    }
  }

  // Fallback to database
  console.log('Fetching facilities from local database');
  const localData = await getFacilitiesFromDb();
  if (localData && localData.length > 0) {
    return normalizeFacilitiesApiResponse(localData).data;
  }

  throw new Error('No internet connection and no cached data available.');
};
