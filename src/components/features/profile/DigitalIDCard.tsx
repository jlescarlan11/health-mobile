import React, { useState, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Switch, useTheme, Surface } from 'react-native-paper';
import { useAppSelector } from '../../../hooks/reduxHooks';
import { useAuthStatus } from '../../../hooks';
import { selectAllMedications } from '../../../store/medicationSlice';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '../../common/Text';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Button } from '../../common';
import { formatIsoDateForDisplay } from '../../../utils/dobUtils';

export const DigitalIDCard: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, unknown>>>();
  const profile = useAppSelector((state) => state.profile);
  const medications = useAppSelector(selectAllMedications);
  const { isSignedIn, derivedFullName, authDob, hasAuthDob } = useAuthStatus();
  const [showSnapshot, setShowSnapshot] = useState(false);
  const { width: screenWidth } = useWindowDimensions();

  // Keep QR size stable to avoid layout shifts while still fitting narrow screens
  const cardWidth = screenWidth - 48;
  const qrSize = 140;
  const scanHintMinWidth = qrSize + 32;
  const resolvedFullName = profile.fullName?.trim() || derivedFullName;
  const resolvedDob = profile.dob || (hasAuthDob ? authDob ?? null : null);
  const displayFullName = resolvedFullName || '---';
  const displayDob = resolvedDob ? formatDobForDisplay(resolvedDob) : '---';

  const activeMedicationStrings = useMemo(() => {
    return medications
      .filter((m) => m.is_active)
      .map((m) => {
        const parts = [m.name];
        if (m.dosage) parts.push(m.dosage);
        return parts.join(' ');
      });
  }, [medications]);

  const qrPayload = useMemo(() => {
    const payload: Record<string, unknown> = { version: 2 };

    const addTextField = (key: string, value?: string | null) => {
      const normalized = sanitizeText(value);
      if (normalized) {
        payload[key] = normalized;
      }
    };

    addTextField('name', resolvedFullName);
    addTextField('date of birth', resolvedDob);
    addTextField('blood type', profile.bloodType);
    addTextField('philhealth id', profile.philHealthId);

    const snapshotData = buildHealthSnapshot(profile, activeMedicationStrings);
    if (Object.keys(snapshotData).length) {
      payload['health snapshot'] = snapshotData;
    }

    return payload;
  }, [profile, activeMedicationStrings, resolvedFullName, resolvedDob]);

  const qrValue = JSON.stringify(qrPayload);
  const basicInfoEntries = [
    { label: 'Full Name', value: displayFullName },
    { label: 'Date of Birth', value: displayDob },
    { label: 'Blood Type', value: profile.bloodType || '---' },
    { label: 'PhilHealth ID', value: profile.philHealthId || '---' },
  ];

  if (!isSignedIn) {
    return null;
  }

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={2}>
      {/* Header with Branding */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="id-card"
            size={20}
            color={theme.colors.secondary}
            style={styles.headerIcon}
          />
          <Text style={styles.headerTitle}>NAGA CITY HEALTH ID</Text>
        </View>
        <Button
          variant="text"
          compact
          onPress={() => navigation.navigate('HealthProfileEdit')}
          textColor={theme.colors.surface}
          title="Edit"
        />
      </View>

      <View style={styles.content}>
        <View style={[styles.qrWrapper, { minWidth: scanHintMinWidth }]}>
          <View style={styles.qrContainer}>
            <QRCode
              value={qrValue}
              size={qrSize}
              color={theme.colors.onSurface}
              backgroundColor="transparent"
              quietZone={4}
            />
          </View>
          <Text variant="labelSmall" style={styles.scanHint} numberOfLines={1} ellipsizeMode="tail">
            SCAN TO VERIFY
          </Text>
        </View>

        <Surface
          style={[
            styles.basicInfoCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
          elevation={1}
        >
          <Text variant="labelSmall" style={styles.basicInfoHeader}>
            BASIC INFORMATION
          </Text>
          <View style={styles.basicInfoGrid}>
            {basicInfoEntries.map((entry) => (
              <View key={entry.label} style={styles.basicInfoItem}>
                <Text variant="labelSmall" style={styles.detailGridLabel}>
                  {entry.label}
                </Text>
                <Text variant="titleMedium" style={styles.detailGridValue} numberOfLines={2}>
                  {entry.value}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.toggleRow}>
            <Text variant="labelSmall" style={styles.toggleLabel}>
              Show Health Snapshot
            </Text>
            <Switch
              value={showSnapshot}
              onValueChange={setShowSnapshot}
              color={theme.colors.primary}
              style={styles.switch}
            />
          </View>

          {showSnapshot && (
            <View style={styles.medicalSection}>
              <View style={styles.medicalGrid}>
                {[
                  {
                    label: 'Chronic conditions',
                    value: formatListForDisplay(profile.chronicConditions),
                  },
                  {
                    label: 'Allergies',
                    value: formatListForDisplay(profile.allergies),
                  },
                  {
                    label: 'Current medications',
                    value: formatListForDisplay(activeMedicationStrings),
                  },
                  {
                    label: 'Surgical history',
                    value: formatTextValue(profile.surgicalHistory),
                  },
                  {
                    label: 'Family history',
                    value: formatTextValue(profile.familyHistory),
                  },
                ].map((entry) => {
                  const columnStyle =
                    cardWidth >= 420 ? styles.medicalItemHalf : styles.medicalItemFull;
                  return (
                    <View key={entry.label} style={[styles.medicalItem, columnStyle]}>
                      <Text variant="labelSmall" style={styles.detailGridLabel}>
                        {entry.label.toUpperCase()}
                      </Text>
                      <Text
                        variant="titleMedium"
                        style={[styles.detailGridValue, { color: theme.colors.onSurface }]}
                        numberOfLines={4}
                      >
                        {entry.value}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </Surface>
      </View>

      {/* Footer Decoration */}
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 10,
  },
  content: {
    padding: 16,
  },
  qrWrapper: {
    alignItems: 'center',
  },
  detailsGrid: {
    marginTop: 16,
  },
  detailGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailGridItem: {
    paddingVertical: 6,
  },
  detailGridItemHalf: {
    flexBasis: '48%',
  },
  detailGridItemFull: {
    flexBasis: '100%',
  },
  detailGridLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#45474B',
    letterSpacing: 0.5,
  },
  detailGridValue: {
    marginTop: 4,
    fontWeight: '400',
    color: '#1E1E1E',
    lineHeight: 20,
  },
  qrContainer: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E2E3',
  },
  scanHint: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: '700',
    opacity: 0.5,
    textAlign: 'center',
    flexWrap: 'nowrap',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  toggleLabel: {
    fontWeight: '700',
    color: '#45474B',
  },
  switch: {
    transform: [{ scale: 0.95 }],
  },
  divider: {
    height: 1,
    marginTop: 12,
  },
  medicalSection: {
    marginTop: 12,
  },
  medicalGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  medicalItem: {
    marginBottom: 12,
  },
  medicalItemHalf: {
    flexBasis: '48%',
  },
  medicalItemFull: {
    flexBasis: '100%',
  },
  hiddenMessage: {
    marginTop: 8,
    fontWeight: '500',
    opacity: 0.7,
  },
  basicInfoCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 0.5,
    marginTop: 16,
  },
  basicInfoHeader: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: 8,
    color: '#5D5F63',
  },
  basicInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  basicInfoItem: {
    width: '50%',
    paddingVertical: 6,
    paddingRight: 12,
  },
});

function formatDobForDisplay(dob?: string | null): string {
  if (!dob) {
    return '';
  }
  return formatIsoDateForDisplay(dob);
}

function formatListForDisplay(items?: string[] | null): string {
  if (!items || items.length === 0) {
    return 'Not recorded';
  }

  const filtered = items.map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  if (!filtered.length) {
    return 'Not recorded';
  }

  return filtered.join(', ');
}

function formatTextValue(value?: string | null): string {
  return value && value.trim() ? value : 'Not recorded';
}

function sanitizeText(value?: string | null): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

function buildHealthSnapshot(
  profile: {
    chronicConditions?: string[];
    allergies?: string[];
    surgicalHistory?: string | null;
    familyHistory?: string | null;
  },
  activeMedications: string[],
): Record<string, string | string[]> {
  const snapshot: Record<string, string | string[]> = {};

  const addList = (label: string, list?: string[]) => {
    const normalized = (list ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
    if (normalized.length) {
      snapshot[label] = normalized;
    }
  };

  const addText = (label: string, value?: string | null) => {
    const normalized = sanitizeText(value);
    if (normalized) {
      snapshot[label] = normalized;
    }
  };

  addList('chronic conditions', profile.chronicConditions);
  addList('allergies', profile.allergies);
  addList('current medications', activeMedications);
  addText('surgical history', profile.surgicalHistory);
  addText('family history', profile.familyHistory);

  return snapshot;
}
