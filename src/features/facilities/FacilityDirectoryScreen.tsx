import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Pressable,
  ScrollView,
} from 'react-native';
import { Menu, Searchbar, Chip, useTheme } from 'react-native-paper';
import { Text } from '../../components/common/Text';
import { useDispatch, useSelector } from 'react-redux';
import { useRoute, RouteProp } from '@react-navigation/native';
import { debounce } from 'lodash';
import { ScreenSafeArea, Button } from '../../components/common';

import { AppDispatch, RootState } from '../../store';
import { fetchFacilities, setFilters } from '../../store/facilitiesSlice';
import { FacilityListView } from '../../components/features/facilities';
import { StandardHeader } from '../../components/common/StandardHeader';
import { FacilitiesStackParamList } from '../../navigation/types';
import { useUserLocation } from '../../hooks';
import { NAGA_CITY_DISTRICTS } from '../../constants/location';

const FILTERS = [
  { id: 'health_center', label: 'Health Centers', facet: 'type' },
  { id: 'hospital', label: 'Hospitals', facet: 'type' },
  { id: 'yakap', label: 'YAKAP Accredited', facet: 'yakapAccredited' },
  { id: 'open_now', label: 'Open Now', facet: 'openNow' },
  { id: 'quiet_now', label: 'Quiet Now', facet: 'quietNow' },
  { id: 'telemedicine', label: 'Telemedicine', facet: 'telemedicine' },
];

export const FacilityDirectoryScreen = () => {
  const theme = useTheme();
  const route = useRoute<RouteProp<FacilitiesStackParamList, 'FacilityDirectory'>>();
  const dispatch = useDispatch<AppDispatch>();
  const [searchQuery, setSearchQuery] = useState('');
  const [districtMenuVisible, setDistrictMenuVisible] = useState(false);
  const filters = useSelector((state: RootState) => state.facilities.filters);

  // Use the custom hook for location management
  // It will automatically update the Redux store with the user's location
  const {
    permissionStatus,
    getCurrentLocation,
    setManualLocation,
    manualDistrictId,
  } = useUserLocation({
    watch: false,
    requestOnMount: false,
    showDeniedAlert: false,
  });
  const selectedDistrict = NAGA_CITY_DISTRICTS.find((d) => d.id === manualDistrictId);

  // Load initial data
  useEffect(() => {
    dispatch(fetchFacilities());
  }, [dispatch]);

  // Debounce search dispatch
  const debouncedDispatch = useMemo(
    () =>
      debounce((query: string) => {
        dispatch(setFilters({ searchQuery: query }));
      }, 500),
    [dispatch],
  );

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    debouncedDispatch(text);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    dispatch(setFilters({ searchQuery: '' }));
    Keyboard.dismiss();
  };

  const handleFilterPress = useCallback((filterId: string) => {
    if (filterId === 'all') {
      dispatch(
        setFilters({
          type: [],
          yakapAccredited: false,
          openNow: false,
          quietNow: false,
          telemedicine: false,
        }),
      );
      return;
    }

    const filterDef = FILTERS.find((f) => f.id === filterId);
    if (!filterDef) return;

    if (filterDef.facet === 'type') {
      const currentTypes = filters.type || [];
      const newTypes = currentTypes.includes(filterId)
        ? currentTypes.filter((t) => t !== filterId)
        : [...currentTypes, filterId];
      dispatch(setFilters({ type: newTypes }));
    } else if (filterDef.facet === 'yakapAccredited') {
      dispatch(setFilters({ yakapAccredited: !filters.yakapAccredited }));
    } else if (filterDef.facet === 'openNow') {
      dispatch(setFilters({ openNow: !filters.openNow }));
    } else if (filterDef.facet === 'quietNow') {
      dispatch(setFilters({ quietNow: !filters.quietNow }));
    } else if (filterDef.facet === 'telemedicine') {
      dispatch(setFilters({ telemedicine: !filters.telemedicine }));
    }
  }, [dispatch, filters]);

  const isFilterActive = (filterId: string) => {
    if (!filters) return filterId === 'all';
    if (filterId === 'all') {
      return (
        (!filters.type || filters.type.length === 0) &&
        !filters.yakapAccredited &&
        !filters.openNow &&
        !filters.quietNow &&
        !filters.telemedicine
      );
    }
    const filterDef = FILTERS.find((f) => f.id === filterId);
    if (!filterDef) return false;

    if (filterDef.facet === 'type') {
      return filters.type?.includes(filterId);
    }
    return !!filters[filterDef.facet as keyof typeof filters];
  };

  // Handle route params (filter)
  useEffect(() => {
    if (route.params?.filter) {
      handleFilterPress(route.params.filter);
    }
  }, [route.params?.filter, handleFilterPress]);

  const showLocationPermissionBanner =
    permissionStatus === 'denied' || permissionStatus === 'undetermined';

  const handlePermissionPress = () => {
    if (permissionStatus === 'undetermined') {
      getCurrentLocation();
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const handleDistrictSelect = (districtId: string) => {
    setManualLocation(districtId);
    setDistrictMenuVisible(false);
  };

  return (
    <ScreenSafeArea style={styles.container} edges={['left', 'right', 'bottom']}>
      <StandardHeader title="Facility Directory" showBackButton />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.contentContainer}>
          <View style={styles.searchContainer}>
            <Searchbar
              placeholder="Search facilities, address..."
              onChangeText={handleSearchChange}
              value={searchQuery}
              style={[styles.searchBar, { borderColor: theme.colors.outline }]}
              icon="magnify"
              onClearIconPress={handleClearSearch}
            />
          </View>

          <View style={styles.filterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              <Chip
                key="all"
                selected={isFilterActive('all')}
                onPress={() => handleFilterPress('all')}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isFilterActive('all')
                      ? theme.colors.primaryContainer
                      : theme.colors.surface,
                    borderColor: isFilterActive('all')
                      ? theme.colors.primary
                      : theme.colors.outline,
                  },
                ]}
                textStyle={{
                  color: isFilterActive('all')
                    ? theme.colors.onPrimaryContainer
                    : theme.colors.onSurface,
                  fontWeight: isFilterActive('all') ? '700' : '400',
                }}
                showSelectedOverlay
                mode="outlined"
                selectedColor={theme.colors.primary}
              >
                All
              </Chip>
              {FILTERS.map((filter) => {
                const isSelected = isFilterActive(filter.id);
                return (
                  <Chip
                    key={filter.id}
                    selected={isSelected}
                    onPress={() => handleFilterPress(filter.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primaryContainer
                          : theme.colors.surface,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
                      },
                    ]}
                    textStyle={{
                      color: isSelected ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                      fontWeight: isSelected ? '700' : '400',
                    }}
                    showSelectedOverlay
                    mode="outlined"
                    selectedColor={theme.colors.primary}
                  >
                    {filter.label}
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          <FacilityListView
            ListHeaderComponent={
              showLocationPermissionBanner ? (
                <View style={styles.locationBannerContainer}>
                  <Pressable
                    onPress={handlePermissionPress}
                    style={({ pressed }) => [
                      styles.locationBanner,
                      {
                        borderColor: theme.colors.outlineVariant,
                        backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.primary,
                        textAlign: 'center',
                        fontWeight: '500',
                      }}
                    >
                      Find the nearest help by sharing your location.
                    </Text>
                  </Pressable>

                  <View style={styles.manualLocationRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Or select your district:
                    </Text>
                    <Menu
                      visible={districtMenuVisible}
                      onDismiss={() => setDistrictMenuVisible(false)}
                      anchor={
                        <Button
                          variant="ghost"
                          compact
                          onPress={() => setDistrictMenuVisible(true)}
                          icon="chevron-down"
                          contentStyle={{ flexDirection: 'row-reverse' }}
                          title={selectedDistrict ? selectedDistrict.name : 'Select District'}
                        />
                      }
                    >
                      {NAGA_CITY_DISTRICTS.map((district) => (
                        <Menu.Item
                          key={district.id}
                          onPress={() => handleDistrictSelect(district.id)}
                          title={district.name}
                        />
                      ))}
                    </Menu>
                  </View>
                </View>
              ) : selectedDistrict ? (
                <View style={styles.selectedDistrictBanner}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Sorted by distance from
                  </Text>
                  <Menu
                    visible={districtMenuVisible}
                    onDismiss={() => setDistrictMenuVisible(false)}
                    anchor={
                      <Button
                        variant="ghost"
                        compact
                        onPress={() => setDistrictMenuVisible(true)}
                        icon="chevron-down"
                        contentStyle={{ flexDirection: 'row-reverse' }}
                        title={selectedDistrict.name}
                      />
                    }
                  >
                    {NAGA_CITY_DISTRICTS.map((district) => (
                      <Menu.Item
                        key={district.id}
                        onPress={() => handleDistrictSelect(district.id)}
                        title={district.name}
                      />
                    ))}
                  </Menu>
                </View>
              ) : null
            }
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  searchBar: {
    flex: 1,
    elevation: 0,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  filterContainer: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
  },
  chip: {
    marginRight: 8,
  },
  locationBannerContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  locationBanner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDistrictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

export default FacilityDirectoryScreen;