import React, { useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Linking, ActivityIndicator } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { StandardHeader } from '../components/common/StandardHeader';
import { ScreenSafeArea, Button } from '../components/common';
import { FeedItem } from '../components/features/feed/FeedItem';
import { fetchFeed } from '../store/feedSlice';
import { RootState, AppDispatch } from '../store';
import { FeedItem as FeedItemType } from '../types/feed';
import { theme as appTheme } from '../theme';

const PAGE_SIZE = 10;

export const HealthHubScreen = () => {
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { items, loading, error, currentPage, hasMore } = useSelector((state: RootState) => state.feed);
  const [refreshing, setRefreshing] = useState(false);
  const spacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const feedBottomPadding = spacing.lg * 2;

  const loadFeed = useCallback((page = 1) => {
    dispatch(fetchFeed({ page, pageSize: PAGE_SIZE }));
  }, [dispatch]);

  useEffect(() => {
    if (!items || items.length === 0) {
      loadFeed(1);
    }
  }, [items, loadFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchFeed({ page: 1, pageSize: PAGE_SIZE }));
    setRefreshing(false);
  }, [dispatch]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadFeed(currentPage + 1);
    }
  }, [loading, hasMore, currentPage, loadFeed]);

  const renderItem = ({ item }: { item: FeedItemType }) => {
    return (
      <FeedItem
        item={item}
        onPress={() => {
          if (item.url) {
            Linking.openURL(item.url);
          }
        }}
      />
    );
  };

  const renderFooter = () => {
    if (!loading) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
      disableBottomInset
    >
      <StandardHeader title="Hub" showBackButton={false} />

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: feedBottomPadding }]}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
        ListHeaderComponent={
          <View style={styles.headerInfo}>
            <Text variant="titleLarge" style={styles.headerTitle}>
              Latest Updates
            </Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>
              Stay informed with the latest health news and tips for Naga City.
            </Text>
            {error && (
              <View style={styles.errorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.colors.error} />
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
                <Button variant="text" compact onPress={() => loadFeed(currentPage)} title="Retry" />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="newspaper-variant-outline"
                size={80}
                color={theme.colors.outline}
              />
              <Text variant="headlineSmall" style={styles.emptyTitle}>
                No Updates Yet
              </Text>
              <Text variant="bodyMedium" style={styles.emptySubtitle}>
                Check back later for the latest health promotions and news.
              </Text>
              <Button variant="primary" onPress={() => loadFeed(1)} style={{ marginTop: 20 }} title="Refresh Hub" />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={{ marginTop: 16 }}>Loading latest health news...</Text>
            </View>
          )
        }
        ListFooterComponent={renderFooter}
      />
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  headerInfo: {
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontWeight: '800',
    color: '#45474B',
  },
  headerSubtitle: {
    color: '#666',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    marginTop: 24,
    fontWeight: '700',
    color: '#45474B',
  },
  emptySubtitle: {
    marginTop: 8,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(186, 26, 26, 0.05)',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  itemSeparator: {
    height: 16,
  },
});