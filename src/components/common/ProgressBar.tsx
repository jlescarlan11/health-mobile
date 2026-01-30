import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

interface ProgressBarProps {
  /**
   * Progress value between 0 and 1.
   */
  progress: number;
  /**
   * Height of the progress bar. Defaults to 8.
   */
  height?: number;
  /**
   * Custom color for the progress bar. Defaults to theme primary.
   */
  color?: string;
  /**
   * Custom background color for the track. Defaults to theme surfaceVariant.
   */
  trackColor?: string;
  /**
   * Optional custom style for the container.
   */
  style?: ViewStyle;
  /**
   * Duration of the animation in milliseconds. Defaults to 300.
   */
  animationDuration?: number;
  /**
   * Whether the progress bar should show an animation when progress changes. Defaults to true.
   */
  animated?: boolean;
  /**
   * Optional label to display above the progress bar.
   */
  label?: string;
  /**
   * Whether to show the percentage next to the label. Defaults to false.
   */
  showPercentage?: boolean;
}

/**
 * A responsive and accessible ProgressBar component.
 * Adapts to container width and provides smooth visual updates.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = 8,
  color,
  trackColor,
  style,
  animationDuration = 300,
  animated = true,
  label,
  showPercentage = false,
}) => {
  const theme = useTheme();

  // Ensure progress is within [0, 1]
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  // Animation value
  const animatedProgress = useRef(new Animated.Value(clampedProgress)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(animatedProgress, {
        toValue: clampedProgress,
        duration: animationDuration,
        useNativeDriver: false, // width cannot be animated with native driver
      }).start();
    } else {
      animatedProgress.setValue(clampedProgress);
    }
  }, [clampedProgress, animated, animationDuration, animatedProgress]);

  const activeColor = color || theme.colors.primary;
  const inactiveColor = trackColor || theme.colors.surfaceVariant;

  const widthInterpolation = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.root, style]}>
      {!!(label || showPercentage) && (
        <View style={styles.labelContainer}>
          {label ? (
            <Animated.Text style={[styles.label, { color: theme.colors.onSurface }]}>
              {label}
            </Animated.Text>
          ) : (
            <View />
          )}
          {showPercentage && (
            <Animated.Text style={[styles.percentage, { color: theme.colors.onSurfaceVariant }]}>
              {`${Math.round(clampedProgress * 100)}%`}
            </Animated.Text>
          )}
        </View>
      )}
      <View
        style={[
          styles.container,
          {
            height,
            backgroundColor: inactiveColor,
            borderRadius: height / 2,
          },
        ]}
        accessible={true}
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(clampedProgress * 100),
        }}
      >
        <Animated.View
          style={[
            styles.progressLine,
            {
              backgroundColor: activeColor,
              width: widthInterpolation,
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    marginVertical: 8,
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  percentage: {
    fontSize: 12,
    fontWeight: '400',
  },
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  progressLine: {
    height: '100%',
  },
});
