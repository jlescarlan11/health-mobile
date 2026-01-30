import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FacilityBusyness } from '../../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface BusynessIndicatorProps {
  busyness?: FacilityBusyness;
  showSeparator?: boolean;
  isVisible?: boolean;
  variant?: 'text' | 'badge';
}

export const BusynessIndicator: React.FC<BusynessIndicatorProps> = ({
  busyness,
  showSeparator = true,
  isVisible = true,
  variant = 'text',
}) => {
  if (!isVisible || !busyness || !busyness.status) return null;

  const getBusynessConfig = (status: string): { label: string; color: string; icon?: IconName } | null => {
    switch (status) {
      case 'quiet':
        return { label: 'Not Busy', color: '#379777', icon: undefined };
      case 'moderate':
        return { label: 'Moderately Busy', color: '#F4CE14', icon: 'account-group-outline' };
      case 'busy':
        return { label: 'Very Busy', color: '#F97316', icon: 'account-multiple' };
      default:
        return null;
    }
  };

  const config = getBusynessConfig(busyness.status);
  if (!config) return null;

  if (variant === 'badge') {
    return (
      <View
        style={[
          styles.badgeContainer,
          { backgroundColor: config.color + '15', borderColor: config.color + '30' },
        ]}
      >
        {config.icon && (
          <MaterialCommunityIcons
            name={config.icon}
            size={16}
            color={config.color}
            style={{ marginRight: 6 }}
          />
        )}
        <Text
          variant="labelLarge"
          style={{ color: config.color, fontWeight: '800', letterSpacing: 0.3 }}
        >
          {config.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showSeparator && (
        <Text variant="labelSmall" style={styles.separator}>
          •
        </Text>
      )}
      {config.icon && (
        <MaterialCommunityIcons
          name={config.icon}
          size={14}
          color={config.color}
          style={{ marginRight: 4 }}
        />
      )}
      <Text
        variant="labelMedium"
        style={{ color: config.color, fontWeight: '700', letterSpacing: 0.3 }}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  separator: {
    marginHorizontal: 6,
    color: '#94A3B8',
  },
});
