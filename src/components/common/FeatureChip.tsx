import React from 'react';
import type { ComponentProps } from 'react';
import { StyleSheet, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Chip, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type FeatureChipIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface FeatureChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: FeatureChipIcon;
  selectedIcon?: FeatureChipIcon;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const FeatureChip: React.FC<FeatureChipProps> = ({
  label,
  selected = false,
  onPress,
  icon,
  selectedIcon,
  disabled = false,
  style,
  textStyle,
  testID,
}) => {
  const theme = useTheme();
  const iconName = selected ? (selectedIcon ?? 'check') : icon;
  const iconColor = selected ? theme.colors.onPrimary : theme.colors.primary;

  const renderIcon = iconName
    ? ({ size }: { size: number }) => (
        <MaterialCommunityIcons name={iconName} size={size} color={iconColor} />
      )
    : undefined;

  return (
    <Chip
      mode="flat"
      selected={selected}
      onPress={onPress}
      disabled={disabled}
      showSelectedCheck={false}
      icon={renderIcon}
      textStyle={[
        styles.label,
        { color: selected ? theme.colors.onPrimary : theme.colors.primary },
        textStyle,
      ]}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.colors.primary : theme.colors.primaryContainer },
        style,
      ]}
      testID={testID}
    >
      {label}
    </Chip>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: 12,
    marginBottom: 4,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
});
