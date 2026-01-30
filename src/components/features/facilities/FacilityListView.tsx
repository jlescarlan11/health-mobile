import React, { useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';

import { RootState, AppDispatch } from '../../../store';
import { fetchFacilities } from '../../../store/facilitiesSlice';
import { FacilityCard } from '../../common/FacilityCard';
import { Button } from '../../common/Button';
import { FacilityCardSkeleton } from './FacilityCardSkeleton';
import { FacilitiesStackScreenProps } from '../../../types/navigation';
import { Facility } from '../../../types';
import { resolveServiceAlias } from '../../../utils/facilityUtils';

type FacilityListNavigationProp = FacilitiesStackScreenProps<'FacilityDirectory'>['navigation'];

type FacilityListViewProps = {
  ListHeaderComponent?: React.ReactElement | null;
};

export const FacilityListView: React.FC<FacilityListViewProps> = ({ ListHeaderComponent }) => {
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<FacilityListNavigationProp>();

  const { filteredFacilities, isLoading, error, filters } = useSelector(
    (state: RootState) => state.facilities,
  );

  const loadFacilities = useCallback(() => {
    dispatch(fetchFacilities());
  }, [dispatch]);

  // Removed useEffect for initial load to avoid double fetching if parent handles it.
  // Parent component should dispatch fetchFacilities() on mount if needed.

  const handleRefresh = () => {
    loadFacilities();
  };

  const handleFacilityPress = (facility: Facility) => {
    navigation.navigate('FacilityDetails', { facilityId: facility.id });
  };

  const renderItem = ({ item }: { item: Facility }) => (
    <FacilityCard
      facility={item}
      distance={item.distance}
      showDistance={true} // Assuming calculated distance is available or handled by parent/card
      onPress={() => handleFacilityPress(item)}
      style={styles.card}
    />
  );

  const renderFooter = () => {
    if (!isLoading || filteredFacilities.length === 0) return null;
    return (
      <View style={styles.footer}>
        <FacilityCardSkeleton />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      // Show skeletons on initial load
      return (
        <View>
          {[1, 2, 3].map((i) => (
            <FacilityCardSkeleton key={i} style={styles.card} />
          ))}
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.error, marginBottom: 12 }}>{error}</Text>
          <Button variant="outline" onPress={loadFacilities} title="Retry" />
        </View>
      );
    }

    const searchQuery = filters.searchQuery || '';
    const hasAliasMatch =
      searchQuery && resolveServiceAlias(searchQuery).toLowerCase() !== searchQuery.toLowerCase();

    return (
      <View style={styles.center}>
        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          No facilities found
        </Text>
        {!hasAliasMatch ? (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
            >
              Try searching for something else, like:
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                Emergency
              </Text>
              <Text style={{ color: theme.colors.outline }}>•</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                Dental
              </Text>
              <Text style={{ color: theme.colors.outline }}>•</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                X-ray
              </Text>
            </View>
          </View>
        ) : (
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 12, textAlign: 'center' }}
          >
            Try adjusting your search or filters to find what you&apos;re looking for.
          </Text>
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={filteredFacilities}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  card: {
    marginBottom: 12,
  },
  footer: {
    paddingVertical: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 50,
  },
});
