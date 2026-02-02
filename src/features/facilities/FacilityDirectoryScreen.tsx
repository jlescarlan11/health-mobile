import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { Searchbar, Chip, useTheme } from 'react-native-paper';
import { Text } from '../../components/common/Text';
import { useDispatch, useSelector } from 'react-redux';
import { useRoute, RouteProp } from '@react-navigation/native';
import { debounce } from 'lodash';
import { ScreenSafeArea, Button, Modal } from '../../components/common';

import { AppDispatch, RootState } from '../../store';
import { fetchFacilities, setFilters } from '../../store/facilitiesSlice';
import { FacilityListView } from '../../components/features/facilities';
import { StandardHeader } from '../../components/common/StandardHeader';
import { FacilitiesStackParamList } from '../../navigation/types';
import { useLocationAvailability } from '../../hooks';

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
  const filters = useSelector((state: RootState) => state.facilities.filters);

  const {
    permissionStatus,
    permissionCanAskAgain,
    locationServicesEnabled,
    canUseLocation,
    canRequestPermission,
    needsSettings,
    requestPermission,
    getCurrentLocation,
  } = useLocationAvailability();

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

  const [isPermissionModalVisible, setPermissionModalVisible] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionModalError, setPermissionModalError] = useState<string | null>(null);

  const locationServicesDisabled = locationServicesEnabled === false;
  const showLocationPermissionBanner = !canUseLocation;

  useEffect(() => {
    if (__DEV__) {
      console.debug('FacilityDirectory location state', {
        permissionStatus,
        permissionCanAskAgain,
        locationServicesEnabled,
        canUseLocation,
        canRequestPermission,
        needsSettings,
      });
    }
  }, [
    permissionStatus,
    permissionCanAskAgain,
    locationServicesEnabled,
    canUseLocation,
    canRequestPermission,
    needsSettings,
  ]);

  const handleModalClose = useCallback(() => {
    setPermissionModalVisible(false);
    setIsRequestingPermission(false);
    setPermissionModalError(null);
  }, []);

  const handleEnableLocationPress = useCallback(() => {
    setPermissionModalError(null);
    setPermissionModalVisible(true);
  }, []);

  const handleAllowLocation = useCallback(async () => {
    setIsRequestingPermission(true);
    setPermissionModalError(null);
    const granted = await requestPermission();
    setIsRequestingPermission(false);

    if (granted) {
      setPermissionModalVisible(false);
      getCurrentLocation();
      return;
    }

    setPermissionModalError(
      'Permission was not granted. You can try again or open Settings to enable location access.',
    );
  }, [getCurrentLocation, requestPermission]);

  const handleOpenSettings = useCallback(() => {
    handleModalClose();
    Linking.openSettings().catch(() => {});
  }, [handleModalClose]);

  const showSettingsFallback = needsSettings || locationServicesDisabled;

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

          {showLocationPermissionBanner && (
            <View
              style={[
                styles.permissionBanner,
                {
                  borderColor: theme.colors.outlineVariant,
                  backgroundColor: theme.colors.surfaceVariant,
                },
              ]}
            >
              <Text
                variant="bodyMedium"
                style={[styles.permissionBannerText, { color: theme.colors.onSurfaceVariant }]}
              >
                Location is off. Enable it in Settings to use location-based features.
              </Text>
              <Button
                variant="outline"
                title="Enable location"
                onPress={handleEnableLocationPress}
                contentStyle={styles.permissionButtonContent}
                style={styles.permissionButton}
              />
            </View>
          )}

          <FacilityListView />
          <Modal
            visible={isPermissionModalVisible}
            onDismiss={handleModalClose}
            dismissable={!isRequestingPermission}
            contentContainerStyle={styles.permissionModalContent}
          >
            <Text variant="titleLarge" style={[styles.permissionModalTitle, { color: theme.colors.onSurface }]}>
              {locationServicesDisabled
                ? 'Location services are off'
                : needsSettings
                ? 'Location permission required'
                : 'Enable location'}
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.permissionModalMessage,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {locationServicesDisabled
                ? 'Device location services are disabled. Turn them on in your phone settings to use nearby facilities.'
                : needsSettings
                ? 'Location access was denied permanently. Open Settings to grant the permission.'
                : 'Allow this app to use your location so we can surface nearby facilities and services.'}
            </Text>
            {permissionModalError && (
              <Text
                variant="bodySmall"
                style={[
                  styles.permissionModalError,
                  { color: theme.colors.error },
                ]}
              >
                {permissionModalError}
              </Text>
            )}
            <View style={styles.permissionModalActions}>
              <Button
                title={showSettingsFallback ? 'Open Settings' : 'Allow location'}
                loading={!showSettingsFallback && isRequestingPermission}
                onPress={showSettingsFallback ? handleOpenSettings : handleAllowLocation}
                contentStyle={styles.permissionModalPrimaryContent}
                style={styles.permissionModalPrimaryButton}
              />
              <Button
                variant="text"
                title="Not now"
                onPress={handleModalClose}
                disabled={isRequestingPermission}
                style={styles.permissionModalSecondaryButton}
              />
            </View>
          </Modal>
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
  permissionBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  permissionBannerText: {
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'left',
  },
  permissionButton: {
    alignSelf: 'flex-start',
  },
  permissionButtonContent: {
    paddingHorizontal: 16,
  },
  permissionModalContent: {
    width: '100%',
    maxWidth: 420,
  },
  permissionModalTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  permissionModalMessage: {
    marginBottom: 8,
    lineHeight: 20,
  },
  permissionModalError: {
    marginTop: 4,
    marginBottom: 4,
  },
  permissionModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
  },
  permissionModalPrimaryButton: {
    marginLeft: 8,
  },
  permissionModalPrimaryContent: {
    paddingHorizontal: 20,
  },
  permissionModalSecondaryButton: {
    marginLeft: 8,
  },
});

export default FacilityDirectoryScreen;
