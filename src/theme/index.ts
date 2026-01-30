import { MD3LightTheme } from 'react-native-paper';
import { DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';

// User defined palette
const palette = {
  background: '#EDF2F4', // Deeper, cooler neutral for better contrast
  yellow: '#F7DB50',
  green: '#379777',
  dark: '#45474B',
  // New additions for better contrast
  lightGreen: '#E8F5F1',
  mint: '#D4EDE4',
  softTeal: '#B8E6D5',
  lightYellow: '#FEF9E7',
};

export const theme = {
  ...MD3LightTheme,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  colors: {
    ...MD3LightTheme.colors,

    // Primary - Using Green
    primary: palette.green,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.lightGreen, // Very light green
    onPrimaryContainer: palette.dark,

    // Secondary - Using Yellow as accent
    secondary: palette.yellow,
    onSecondary: palette.dark,
    secondaryContainer: palette.lightYellow,
    onSecondaryContainer: palette.dark,

    // Tertiary - For alternative accent areas
    tertiary: '#5B9279', // Muted green
    onTertiary: '#FFFFFF',
    tertiaryContainer: palette.softTeal, // Soft teal for variety
    onTertiaryContainer: palette.dark,

    // Backgrounds
    background: palette.background,
    onBackground: palette.dark,

    // Surface
    surface: '#FFFFFF',
    onSurface: palette.dark,
    surfaceVariant: '#E0E2E3',
    onSurfaceVariant: palette.dark,

    // Borders
    outline: '#C5C7C8',
    outlineVariant: '#E0E2E3',

    // Elevation/Shadow
    shadow: '#000000',
    scrim: '#000000',

    // Error
    error: '#BA1A1A',
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',
  },
};

/**
 * buttonSystem centralizes the shared tokens for every button in the app:
 * - base defines the touch-target, padding, and typography that are slightly tighter than before
 *   so buttons feel less oversized while still being accessible.
 * - variants map the three preferred states (primary, secondary, tertiary/ghost) plus inline text
 *   and danger states, pointing at the theme colors that should power backgrounds, text, and borders.
 */
export const buttonSystem = {
  base: {
    borderRadius: 12,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.25,
  },
  variants: {
    primary: {
      mode: 'contained',
      backgroundColorKey: 'primary',
      textColorKey: 'onPrimary',
    },
    secondary: {
      mode: 'contained-tonal',
      backgroundColorKey: 'secondaryContainer',
      textColorKey: 'onSecondaryContainer',
    },
    ghost: {
      mode: 'outlined',
      textColorKey: 'primary',
      borderColorKey: 'outline',
    },
    text: {
      mode: 'text',
      textColorKey: 'primary',
    },
    danger: {
      mode: 'contained',
      backgroundColorKey: 'error',
      textColorKey: 'onError',
    },
  } as const,
} as const;

/** 
 * Generates a scaled version of the theme based on the provided scale factor.
 * This applies to all MD3 typography variants.
 */
export const getScaledTheme = (scaleFactor: number) => {
  if (scaleFactor === 1) return theme;

  const scaledTypography = { ...theme.fonts };

  // Iterate through all font variants and scale their fontSize and lineHeight
  Object.keys(scaledTypography).forEach((key) => {
    const variant = scaledTypography[key as keyof typeof scaledTypography];
    if (variant && typeof variant === 'object' && 'fontSize' in variant && 'lineHeight' in variant) {
      scaledTypography[key as keyof typeof scaledTypography] = {
        ...variant,
        fontSize: variant.fontSize ? (variant.fontSize as number) * scaleFactor : (variant.fontSize as number),
        lineHeight: variant.lineHeight ? (variant.lineHeight as number) * scaleFactor : (variant.lineHeight as number),
      };
    }
  });

  return {
    ...theme,
    fonts: scaledTypography,
  };
};

export const navigationTheme = {
  ...NavigationDefaultTheme,
  colors: {
    ...NavigationDefaultTheme.colors,
    background: palette.background,
    primary: palette.green,
    card: '#FFFFFF',
    text: palette.dark,
    border: '#E0E2E3',
  },
};
