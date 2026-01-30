import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Facility } from '../../types';
import { BusynessIndicator } from './BusynessIndicator';
import { Text } from './Text';
import { getOpenStatus } from '../../utils/facilityUtils';

interface FacilityStatusIndicatorProps {
  facility: Facility;
  style?: ViewStyle;
}

export const FacilityStatusIndicator: React.FC<FacilityStatusIndicatorProps> = ({
  facility,
  style,
}) => {
  const { text, color, isOpen } = getOpenStatus(facility);

  return (
    <View style={[styles.statusRow, style]}>
      <View style={styles.statusTextRow}>
        <MaterialCommunityIcons
          name={isOpen ? 'clock-check-outline' : 'clock-alert-outline'}
          size={14}
          color={color}
          style={styles.icon}
        />
        <Text
          variant="labelMedium"
          style={[styles.statusText, { color }]}
          accessibilityRole="text"
        >
          {text}
        </Text>
      </View>
      <BusynessIndicator busyness={facility.busyness} isVisible={isOpen} />
    </View>
  );
};

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  statusText: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});