import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface TeleconsultBadgeProps {
  style?: ViewStyle;
}

export const TeleconsultBadge: React.FC<TeleconsultBadgeProps> = ({ style }) => {
  const theme = useTheme();

  return (
    <View
      style={[styles.badge, { backgroundColor: theme.colors.tertiaryContainer }, style]}
      accessible={true}
      accessibilityLabel="Teleconsultation Available"
      accessibilityRole="image"
    >
      <MaterialCommunityIcons
        name="video-outline"
        size={14}
        color={theme.colors.onTertiaryContainer}
        style={styles.icon}
      />
      <Text variant="labelSmall" style={[styles.text, { color: theme.colors.onTertiaryContainer }]}>
        Teleconsult
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
