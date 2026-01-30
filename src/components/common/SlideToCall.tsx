import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  StyleProp,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface SlideToCallProps {
  onSwipeComplete: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  label?: string;
}

export const SlideToCall: React.FC<SlideToCallProps> = ({
  onSwipeComplete,
  containerStyle,
  label = 'Slide to Call Emergency',
}) => {
  const theme = useTheme();
  const pan = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== trackWidth) {
      setTrackWidth(width);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,

        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10
          );
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,

        onPanResponderMove: (_, gestureState) => {
          if (!trackWidth) return;
          // Limit stretch to 1/4 of the track width
          const MAX_PAN = trackWidth / 4;
          const resistance = 0.5;

          if (gestureState.dx > 0) {
            const moveX = Math.min(gestureState.dx * resistance, MAX_PAN);
            pan.setValue(moveX);
          } else {
            pan.setValue(0);
          }
        },

        onPanResponderRelease: (_, gestureState) => {
          if (!trackWidth) return;
          const GESTURE_THRESHOLD = 100; // Adjusted threshold

          if (gestureState.dx >= GESTURE_THRESHOLD) {
            // RELEASE SNAP-BACK SEQUENCE
            Animated.timing(pan, {
              toValue: 0,
              duration: 200,
              useNativeDriver: false,
            }).start(({ finished }) => {
              if (finished) {
                onSwipeComplete();
              }
            });
          } else {
            Animated.spring(pan, {
              toValue: 0,
              useNativeDriver: false,
              friction: 8,
              tension: 50,
            }).start();
          }
        },

        onPanResponderTerminate: () => {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        },
      }),
    [trackWidth, pan, onSwipeComplete],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.error }, containerStyle]}>
      <View
        style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        <Text style={[styles.text, { color: theme.colors.onError }]}>{label}</Text>

        {/* The stretching tail */}
        <Animated.View
          style={[
            styles.stretchHandle,
            {
              backgroundColor: '#FFFFFF',
              width: Animated.add(50, pan),
            },
          ]}
        >
          {/* The leading circle with shadow to distinguish it */}
          <View style={[styles.circle, { backgroundColor: theme.colors.surface }]}>
            <MaterialCommunityIcons
              name="chevron-double-right"
              size={28}
              color={theme.colors.error}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  track: {
    flex: 1,
    borderRadius: 29,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  stretchHandle: {
    height: 50,
    borderRadius: 25,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    // Shadow shifted to the left to separate from the tail
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  text: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    zIndex: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
