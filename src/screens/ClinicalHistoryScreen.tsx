import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useTheme, Card, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootStackScreenProps } from '../types/navigation';
import { RootState } from '../store';
import * as DB from '../services/database';
import { ClinicalHistoryRecord } from '../services/database';
import { StandardHeader } from '../components/common/StandardHeader';
import { Button, Text, ScreenSafeArea, LoadingScreen } from '../components/common';
import { theme as appTheme } from '../theme';
import { useAuthStatus, useRedirectToSettingsIfSignedOut } from '../hooks';

type Props = RootStackScreenProps<'ClinicalHistory'>;

const ClinicalHistoryContent = () => {
  const navigation = useNavigation<Props['navigation']>();
  const theme = useTheme();
  const currentProfile = useSelector((state: RootState) => state.profile);
  const [history, setHistory] = useState<ClinicalHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const listBottomPadding = (themeSpacing.lg ?? 16) * 2;

  const loadHistory = async () => {
    try {
      setLoading(true);
      const records = await DB.getClinicalHistory();
      setHistory(records);
    } catch (error) {
      console.error('Failed to load clinical history:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, []),
  );

  const getLevelInfo = (level: string) => {
    const normalized = level.toLowerCase().replace('-', '_');
    switch (normalized) {
      case 'emergency':
        return { icon: 'alert-decagram', color: theme.colors.error };
      case 'hospital':
        return { icon: 'hospital-building', color: theme.colors.secondary };
      case 'health_center':
        return { icon: 'hospital-marker', color: theme.colors.primary };
      case 'self_care':
        return { icon: 'home-heart', color: theme.colors.primary };
      default:
        return { icon: 'clipboard-text-outline', color: theme.colors.outline };
    }
  };

  const isArchivedContext = useCallback(
    (snapshotStr?: string) => {
      if (!snapshotStr) return false;
      try {
        const snapshot = JSON.parse(snapshotStr);

        // Conservative comparison: Birth Year or Sex
        const currentYear = currentProfile.dob ? new Date(currentProfile.dob).getFullYear() : null;
        const snapshotYear = snapshot.dob ? new Date(snapshot.dob).getFullYear() : null;

        const yearChanged = currentYear !== snapshotYear;
        const sexChanged =
          currentProfile.sex?.toLowerCase() !== snapshot.sex?.toLowerCase() &&
          Boolean(currentProfile.sex) &&
          Boolean(snapshot.sex);

        return yearChanged || sexChanged;
      } catch (e) {
        console.error('Failed to parse profile snapshot:', e);
        return false;
      }
    },
    [currentProfile.dob, currentProfile.sex],
  );

  const renderItem = ({ item }: { item: ClinicalHistoryRecord }) => {
    const levelInfo = getLevelInfo(item.recommended_level);
    const date = new Date(item.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const time = new Date(item.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isArchived = isArchivedContext(item.profile_snapshot);

    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('ClinicalNote', { recordId: item.id })}
        accessible={true}
        accessibilityLabel={`Assessment from ${date}, ${item.recommended_level.replace('_', ' ')}. Symptoms: ${item.initial_symptoms}${isArchived ? '. Archived profile context' : ''}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to view the full clinical report"
      >
        <Card.Content style={styles.cardContent}>
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <View style={styles.titleWithSync}>
                <Text variant="titleMedium" numberOfLines={1} style={styles.symptomText}>
                  {item.initial_symptoms}
                </Text>
                <MaterialCommunityIcons 
                  name={item.synced ? "cloud-check" : "cloud-upload-outline"} 
                  size={16} 
                  color={item.synced ? theme.colors.primary : theme.colors.outline}
                  style={styles.syncIcon}
                />
              </View>
              {isArchived && (
                <Surface style={styles.archivedBadge} elevation={0}>
                  <Text variant="labelSmall" style={styles.archivedBadgeText}>
                    ARCHIVED CONTEXT
                  </Text>
                </Surface>
              )}
            </View>
            <Text variant="bodySmall" numberOfLines={1} style={styles.detailText}>
              {date} · {time} ·{' '}
              <Text style={[styles.levelText, { color: levelInfo.color }]}>
                {item.recommended_level.toUpperCase().replace('_', ' ')}
              </Text>
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.outline} />
        </Card.Content>
      </Card>
    );
  };

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <StandardHeader
        title="My Health Records"
        showBackButton
        onBackPress={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="folder-outline"
                size={80}
                color={theme.colors.outline}
              />
              <Text variant="headlineSmall" style={styles.emptyTitle}>
                Empty Vault
              </Text>
              <Text variant="bodyMedium" style={styles.emptySubtitle}>
                You don&apos;t have any saved clinical assessments yet.
              </Text>
              <Button
                title="Start New Assessment"
                variant="primary"
                onPress={() => navigation.navigate('Check', { screen: 'CheckSymptom' } as never)}
                style={styles.ctaButton}
              />
            </View>
          }
        />
      )}
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF2F4',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 12,
    paddingBottom: 0,
    flexGrow: 1,
  },
  card: {
    marginBottom: 8,
    elevation: 1,
    backgroundColor: '#FFFFFF',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  titleWithSync: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  syncIcon: {
    marginLeft: 4,
  },
  symptomText: {
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  archivedBadge: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  archivedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#666',
  },
  detailText: {
    color: '#666',
    marginTop: 4,
  },
  levelText: {
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
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
  ctaButton: {
    marginTop: 32,
    width: '100%',
    maxWidth: 250,
  },
  gatingWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
});

export const ClinicalHistoryScreen = () => {
  const { isSignedIn, isSessionLoaded } = useAuthStatus();
  const theme = useTheme();
  const navigation = useNavigation<RootStackScreenProps<'ClinicalHistory'>['navigation']>();

  useRedirectToSettingsIfSignedOut(isSignedIn, isSessionLoaded);

  if (!isSessionLoaded || !isSignedIn) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <StandardHeader
          title="My Health Records"
          showBackButton
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.gatingWrapper}>
          <LoadingScreen />
        </View>
      </ScreenSafeArea>
    );
  }

  return <ClinicalHistoryContent />;
};
