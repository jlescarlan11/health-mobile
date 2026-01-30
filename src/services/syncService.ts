import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchFacilitiesFromApi } from './facilityService';
import { saveFacilitiesFull } from './database';
import { store } from '../store';
import { syncCompleted, setOfflineStatus } from '../store/offlineSlice';
import { Facility } from '../types';

export const syncFacilities = async () => {
  const state = await NetInfo.fetch();

  if (!state.isConnected) {
    store.dispatch(setOfflineStatus(true));
    throw new Error('Cannot sync: Offline');
  }

  try {
    console.log('Starting facilities sync...');
    const data = await fetchFacilitiesFromApi();

    let facilitiesToSave: Facility[] = [];
    if (Array.isArray(data)) {
      facilitiesToSave = data;
    } else if (data.facilities && Array.isArray(data.facilities)) {
      facilitiesToSave = data.facilities;
    }

    if (facilitiesToSave.length > 0) {
      await saveFacilitiesFull(facilitiesToSave);
      const timestamp = Date.now();
      await AsyncStorage.setItem('last_sync_timestamp', timestamp.toString());
      store.dispatch(syncCompleted());
      console.log('Facilities sync completed successfully');
      return true;
    } else {
      console.log('No facilities data to sync');
      return false;
    }
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
};

export const getLastSyncTime = async (): Promise<number | null> => {
  try {
    const timestamp = await AsyncStorage.getItem('last_sync_timestamp');
    return timestamp ? parseInt(timestamp, 10) : null;
  } catch (error) {
    console.error('Error getting last sync time:', error);
    return null;
  }
};
