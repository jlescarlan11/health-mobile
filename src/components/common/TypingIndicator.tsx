import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

interface TypingIndicatorProps {
  dotColor?: string;
  dotSize?: number;
  dotMargin?: number;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  dotColor,
  dotSize = 6,
  dotMargin = 4,
}) => {
  const theme = useTheme();
  const color = dotColor || theme.colors.primary;

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (value: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(value, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(value, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );
    };

    const animation = Animated.parallel([
      animateDot(dot1, 0),
      animateDot(dot2, 200),
      animateDot(dot3, 400),
    ]);

    animation.start();

    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const getDotStyle = (value: Animated.Value): Animated.WithAnimatedObject<ViewStyle> => ({
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: color,
    marginHorizontal: dotMargin,
    opacity: value.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        }),
      },
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.3],
        }),
      },
    ] as ViewStyle['transform'],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={getDotStyle(dot1)} />
      <Animated.View style={getDotStyle(dot2)} />
      <Animated.View style={getDotStyle(dot3)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
});
