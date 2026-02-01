import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { useTheme } from 'react-native-paper';
import type { RootState } from '../../store';

export const OfflineBanner = () => {
  const isOffline = useSelector((state: RootState) => state.offline?.isOffline ?? false);
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: theme.colors.inverseSurface },
      ]}
    >
      <Text style={[styles.text, { color: theme.colors.inverseOnSurface }]}>
        You are offline. Showing cached data.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
});
