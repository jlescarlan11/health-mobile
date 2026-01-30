import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getFacilities } from '../services/facilityService';
import { Facility, FacilityService } from '../types';
import { calculateDistance } from '../utils/locationUtils';
import { getOpenStatus, resolveServiceAlias } from '../utils/facilityUtils';

interface FacilityFilters {
  type?: string[];
  services?: FacilityService[];
  yakapAccredited?: boolean;
  searchQuery?: string;
  openNow?: boolean;
  quietNow?: boolean;
  telemedicine?: boolean;
}

interface FacilitiesState {
  facilities: Facility[];
  filteredFacilities: Facility[];
  selectedFacilityId: string | null;
  userLocation: { latitude: number; longitude: number } | null;
  filters: FacilityFilters;
  isLoading: boolean;
  error: string | null;
}

const initialState: FacilitiesState = {
  facilities: [],
  filteredFacilities: [],
  selectedFacilityId: null,
  userLocation: null,
  filters: {
    type: [],
    services: [],
    yakapAccredited: false,
    openNow: false,
    quietNow: false,
    telemedicine: false,
    searchQuery: '',
  },
  isLoading: false,
  error: null,
};

export const fetchFacilities = createAsyncThunk('facilities/fetchFacilities', async () => {
  const data = await getFacilities();
  return { data };
});

// Shared filtering logic
const applyFilters = (facilities: Facility[], filters: FacilityFilters): Facility[] => {
  if (!filters) return facilities;
  const { type, services, yakapAccredited, searchQuery, openNow, quietNow, telemedicine } = filters;

  return facilities.filter((facility) => {
    const matchesType = !type || type.length === 0 || type.includes(facility.type);
    const matchesYakap = !yakapAccredited || facility.yakapAccredited;
    const matchesSearch = matchesSearchQuery(facility, searchQuery);

    const matchesServices =
      !services ||
      services.length === 0 ||
      services.some(
        (s) =>
          facility.services.includes(s) ||
          (facility.specialized_services && facility.specialized_services.includes(s as string)),
      );

    const matchesOpen = !openNow || getOpenStatus(facility).isOpen;
    const matchesQuiet = !quietNow || (facility.busyness && facility.busyness.score < 0.4);

    const matchesTelemedicine =
      !telemedicine || (facility.contacts && facility.contacts.some((c) => c.platform !== 'phone'));

    return (
      matchesType &&
      matchesYakap &&
      matchesSearch &&
      matchesServices &&
      matchesOpen &&
      matchesQuiet &&
      matchesTelemedicine
    );
  });
};

// Helper for consistent sorting
const sortFacilities = (a: Facility, b: Facility) => {
  const statusA = getOpenStatus(a);
  const statusB = getOpenStatus(b);

  const getRank = (color: string) => {
    if (color === '#379777' || color === 'green') return 1;
    if (color === '#F97316' || color === 'orange') return 2;
    return 3;
  };

  const rankA = getRank(statusA.color);
  const rankB = getRank(statusB.color);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // Secondary sort: Distance
  return (a.distance || Infinity) - (b.distance || Infinity);
};

const normalizeSearchText = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');

const toSearchableText = (value: unknown) => normalizeSearchText(String(value ?? ''));

const getResolvedSearchQuery = (searchQuery: string) => {
  const normalized = normalizeSearchText(searchQuery);
  if (!normalized) return '';

  const resolved = normalizeSearchText(resolveServiceAlias(normalized));

  // Guard against overly-broad substring alias rules (e.g. "service" -> "Emergency" via "er").
  if (resolved === 'emergency') {
    const hasEmergencyToken =
      /\bemergency\b/.test(normalized) ||
      /\burgent\b/.test(normalized) ||
      /\ber\b/.test(normalized);
    return hasEmergencyToken ? resolved : normalized;
  }

  if (resolved === 'ob-gyn') {
    const hasObGynToken =
      /\bob\b/.test(normalized) || normalized.includes('gyne') || normalized.includes('women');
    return hasObGynToken ? resolved : normalized;
  }

  if (resolved === 'ent') {
    const hasEntToken =
      /\bent\b/.test(normalized) ||
      normalized.includes('ear') ||
      normalized.includes('nose') ||
      normalized.includes('throat');
    return hasEntToken ? resolved : normalized;
  }

  return resolved;
};

const matchesSearchQuery = (facility: Facility, searchQuery?: string) => {
  if (!searchQuery) return true;

  const query = normalizeSearchText(searchQuery);
  if (!query) return true;

  const normalizedName = toSearchableText(facility.name);
  const normalizedAddress = toSearchableText(facility.address);

  if (normalizedName.includes(query) || normalizedAddress.includes(query)) {
    return true;
  }

  const resolvedQuery = getResolvedSearchQuery(query);
  const serviceStrings: string[] = [
    ...(facility.services || []),
    ...(facility.specialized_services || []),
  ]
    .filter(Boolean)
    .map(String);

  return serviceStrings.some((service) => {
    const rawService = toSearchableText(service);
    const resolvedService = toSearchableText(resolveServiceAlias(String(service)));

    return (
      rawService.includes(query) ||
      rawService.includes(resolvedQuery) ||
      resolvedService.includes(query) ||
      resolvedService.includes(resolvedQuery)
    );
  });
};

const facilitiesSlice = createSlice({
  name: 'facilities',
  initialState,
  reducers: {
    selectFacility: (state, action: PayloadAction<string | null>) => {
      state.selectedFacilityId = action.payload;
    },
    setUserLocation: (
      state,
      action: PayloadAction<{ latitude: number; longitude: number } | null>,
    ) => {
      state.userLocation = action.payload;

      if (action.payload) {
        const { latitude, longitude } = action.payload;

        const updateDistance = (f: Facility) => {
          f.distance = calculateDistance(latitude, longitude, f.latitude, f.longitude);
        };

        state.facilities.forEach(updateDistance);
        state.filteredFacilities.forEach(updateDistance);

        // Sort filtered facilities using helper
        state.filteredFacilities.sort(sortFacilities);
      }
    },
    setFilters: (state, action: PayloadAction<Partial<FacilityFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.filteredFacilities = applyFilters(state.facilities, state.filters);
      state.filteredFacilities.sort(sortFacilities);
    },
    clearFilters: (state) => {
      state.filters = {
        type: [],
        services: [],
        yakapAccredited: false,
        openNow: false,
        quietNow: false,
        telemedicine: false,
        searchQuery: '',
      };
      state.filteredFacilities = [...state.facilities];
      state.filteredFacilities.sort(sortFacilities);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFacilities.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchFacilities.fulfilled, (state, action) => {
        state.isLoading = false;
        const { data } = action.payload;

        let newFacilities: Facility[] = [];

        if (Array.isArray(data)) {
          newFacilities = data;
        } else if (data && typeof data === 'object') {
          newFacilities = data.facilities || [];
        }

        // Calculate distances if location is already known
        if (state.userLocation) {
          const { latitude, longitude } = state.userLocation;
          newFacilities = newFacilities.map((f) => ({
            ...f,
            distance: calculateDistance(latitude, longitude, f.latitude, f.longitude),
          }));
        }

        // Normalize busyness data from API response
        newFacilities = newFacilities.map((f) => {
          const score = (f as any).busyness_score as number ?? (f.busyness?.score || 0);
          let status: 'quiet' | 'moderate' | 'busy' = 'quiet';
          if (score >= 0.7) status = 'busy';
          else if (score >= 0.4) status = 'moderate';

          return {
            ...f,
            busyness: {
              score,
              status,
            },
          };
        });

        state.facilities = newFacilities;
        state.filteredFacilities = applyFilters(state.facilities, state.filters);
        state.filteredFacilities.sort(sortFacilities);
      })
      .addCase(fetchFacilities.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch facilities';
      });
  },
});

export const { selectFacility, setFilters, clearFilters, setUserLocation } =
  facilitiesSlice.actions;
export default facilitiesSlice.reducer;
