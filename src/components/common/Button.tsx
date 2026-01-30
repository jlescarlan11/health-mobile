import React from 'react';
import { StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Button as PaperButton, useTheme } from 'react-native-paper';
import { useAdaptiveUI } from '../../hooks/useAdaptiveUI';
import { buttonSystem } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'text' | 'danger' | 'outline';

const variantAlias: Record<ButtonVariant, keyof typeof buttonSystem.variants> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  text: 'text',
  danger: 'danger',
  outline: 'ghost',
};

interface ButtonProps extends Omit<React.ComponentProps<typeof PaperButton>, 'children' | 'mode'> {
  onPress: () => void;
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  mode?: 'text' | 'outlined' | 'contained' | 'elevated' | 'contained-tonal';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'image' | 'text' | 'none';
}

export const Button: React.FC<ButtonProps> = ({
  onPress,
  title,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  labelStyle,
  contentStyle,
  mode: modeProp,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  buttonColor: buttonColorProp,
  textColor: textColorProp,
  ...props
}) => {
  const theme = useTheme();
  const { scaleFactor, isPWDMode, touchTargetScale, borderRadius } = useAdaptiveUI();

  const normalizedVariant = variantAlias[variant] ?? 'primary';
  const variantConfig = buttonSystem.variants[normalizedVariant];

  const resolvedButtonColor =
    buttonColorProp ?? 
    (('backgroundColorKey' in variantConfig) ? theme.colors[variantConfig.backgroundColorKey as keyof typeof theme.colors] : undefined);
  const resolvedTextColor =
    textColorProp ?? 
    (('textColorKey' in variantConfig) ? theme.colors[variantConfig.textColorKey as keyof typeof theme.colors] : undefined);

  const finalMode = modeProp || variantConfig.mode;
  const borderColor =
    ('borderColorKey' in variantConfig) && finalMode === 'outlined'
      ? theme.colors[variantConfig.borderColorKey as keyof typeof theme.colors]
      : undefined;
  const labelScale = isPWDMode ? 1.1 : 1;
  const buttonBorderRadius = isPWDMode
    ? Math.max(borderRadius, buttonSystem.base.borderRadius)
    : buttonSystem.base.borderRadius;

  const buttonStyle = [
    styles.button,
    finalMode === 'outlined' && borderColor ? { borderColor } : null,
    {
      minHeight: buttonSystem.base.minHeight * touchTargetScale,
      borderRadius: buttonBorderRadius,
    },
    style,
  ];

  const scaledLabelStyle = [
    styles.label,
    {
      fontSize: buttonSystem.base.fontSize * scaleFactor * labelScale,
      lineHeight: buttonSystem.base.lineHeight * scaleFactor * labelScale,
      letterSpacing: buttonSystem.base.letterSpacing,
    },
    labelStyle,
  ];

  const finalContentStyle = [
    styles.content,
    {
      paddingVertical: buttonSystem.base.paddingVertical * scaleFactor * (isPWDMode ? 1.1 : 1),
      paddingHorizontal: buttonSystem.base.paddingHorizontal * scaleFactor,
    },
    contentStyle,
  ];

  return (
    <PaperButton
      mode={finalMode}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      icon={icon}
      buttonColor={resolvedButtonColor as any}
      textColor={resolvedTextColor as any}
      style={buttonStyle as any}
      labelStyle={scaledLabelStyle}
      contentStyle={finalContentStyle}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      {...props}
    >
      {title}
    </PaperButton>
  );
};

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    textTransform: 'none',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
