import React from 'react';
import { Alert, StyleSheet, View, ViewStyle } from 'react-native';
import { Card, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Facility } from '../../types';
import { formatDistance } from '../../utils/locationUtils';
import { getOpenStatus, formatFacilityType } from '../../utils';
import { openExternalMaps } from '../../utils/linkingUtils';
import { TeleconsultBadge } from './TeleconsultBadge';
import { useAdaptiveUI } from '../../hooks/useAdaptiveUI';
import { sharingUtils } from '../../utils/sharingUtils';
import { FacilityStatusIndicator } from './FacilityStatusIndicator';
import { Text } from './Text';
import { FacilityActionButtons } from './FacilityActionButtons';

interface FacilityCardProps {
  facility: Facility;
  onPress?: () => void;
  style?: ViewStyle;
  showDistance?: boolean;
  distance?: number;
  matchedServices?: string[];
}

export const FacilityCard: React.FC<FacilityCardProps> = ({
  facility,
  onPress,
  style,
  showDistance = false,
  distance,
  matchedServices = [],
}) => {
  const theme = useTheme();
  const { scaleFactor, isPWDMode, simplifiedSpacing, borderRadius, touchTargetScale } = useAdaptiveUI();
  const { text: statusText } = getOpenStatus(facility);

  const hasTeleconsult = React.useMemo(() => {
    return facility.contacts?.some((c) => !!c.teleconsultUrl);
  }, [facility.contacts]);

  const accessibilityLabel = `Facility: ${facility.name}, Type: ${
    facility.type
  }, Status: ${statusText}${facility.yakapAccredited ? ', YAKAP Accredited' : ''}${
    matchedServices.length > 0 ? `, Matches Your Needs: ${matchedServices.join(', ')}` : ''
  }${
    showDistance
      ? `, Distance: ${
          typeof distance === 'number' && !isNaN(distance)
            ? formatDistance(distance)
            : 'unavailable'
        }`
      : ''
  }`;

  const metaRowStyle = [styles.metaRow, isPWDMode && styles.metaRowPWD];
  const metaTextStyle = [styles.metaText, isPWDMode && styles.metaTextPWD];
  const titleTextStyle = [
    styles.title,
    {
      fontSize: 20 * scaleFactor * (isPWDMode ? 1.05 : 1),
      lineHeight: 26 * scaleFactor,
    },
  ];
  const shareIconSize = 20 * scaleFactor * touchTargetScale;
  const cardInnerStyle = [
    styles.cardInner,
    {
      padding: simplifiedSpacing,
    },
  ];
  const titleRowStyle = [styles.titleRow, isPWDMode && { marginBottom: 8 }];
  const teleconsultStyle = {
    marginLeft: 4,
    marginTop: isPWDMode ? 10 : 2,
  };

  const handleDirectionsPress = async () => {
    const opened = await openExternalMaps({
      latitude: facility.latitude,
      longitude: facility.longitude,
      label: facility.name,
      address: facility.address,
    });

    if (!opened) {
      Alert.alert('Error', 'Failed to open maps for directions.');
    }
  };

  return (
    <Card
      style={[
        styles.card,
        style,
        {
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
          borderRadius,
          borderWidth: isPWDMode ? 1 : 0,
          borderColor: isPWDMode ? '#E5E7EB' : undefined,
        },
      ]}
      onPress={onPress}
      mode="contained"
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={cardInnerStyle}>
        <View style={titleRowStyle}>
          <Text variant="titleMedium" style={titleTextStyle}>
            {facility.name}
          </Text>
          <IconButton
            icon="share-variant-outline"
            size={shareIconSize}
            onPress={(e) => {
              e.stopPropagation();
              sharingUtils.shareFacilityInfo(facility);
            }}
            style={styles.shareIconButton}
            iconColor={theme.colors.primary}
            accessibilityLabel={`Share ${facility.name} info`}
          />
        </View>

        <View style={metaRowStyle}>
          {[
            formatFacilityType(facility.type),
            facility.yakapAccredited ? 'YAKAP Accredited' : null,
            showDistance
              ? typeof distance === 'number' && !isNaN(distance)
                ? `${formatDistance(distance)}`
                : 'Distance unavailable'
              : null,
          ]
            .filter(Boolean)
            .map((item, index, array) => (
              <React.Fragment key={index}>
                <Text variant="labelSmall" style={metaTextStyle}>
                  {item}
                </Text>
                {!isPWDMode && index < array.length - 1 && (
                  <Text variant="labelSmall" style={[styles.metaText, styles.metaSeparator]}>
                    •
                  </Text>
                )}
              </React.Fragment>
            ))}

          {hasTeleconsult && <TeleconsultBadge style={teleconsultStyle} />}
        </View>

        <FacilityStatusIndicator 
          facility={facility} 
          style={matchedServices.length > 0 ? { marginBottom: 8 } : undefined}
        />

        {matchedServices.length > 0 && (
          <View style={styles.matchContainer}>
            <MaterialCommunityIcons 
              name="check-circle-outline" 
              size={14} 
              color={theme.colors.primary} 
              style={styles.matchIcon} 
            />
            <Text variant="labelSmall" style={[styles.matchLabel, { color: theme.colors.onSurfaceVariant }]}>
              Matches your needs: {matchedServices.join(', ')}
            </Text>
          </View>
        )}

        <FacilityActionButtons
          contacts={facility.contacts}
          primaryPhone={facility.phone}
          onDirectionsPress={handleDirectionsPress}
          containerStyle={styles.actionsRow}
        />
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    borderRadius: 20,
    borderWidth: 0,
  },
  cardInner: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    lineHeight: 26,
    letterSpacing: -0.2,
    flex: 1,
  },
  shareIconButton: {
    margin: 0,
    marginTop: -4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaRowPWD: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  metaTextPWD: {
    fontSize: 14,
    marginBottom: 6,
    color: '#475467',
  },
  metaSeparator: {
    marginHorizontal: 6,
    color: '#94A3B8',
  },
  matchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchIcon: {
    marginRight: 6,
  },
  matchLabel: {
    fontWeight: '600',
    letterSpacing: 0.1,
    flex: 1,
  },
  actionsRow: {
    marginTop: 8,
  },
});
