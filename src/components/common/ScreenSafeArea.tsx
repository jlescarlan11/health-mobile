import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useAdaptiveUI } from '../../hooks/useAdaptiveUI';

type ScreenSafeAreaProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  disableBottomInset?: boolean;
};

export const ScreenSafeArea = ({
  children,
  style,
  edges,
  disableBottomInset = false,
}: ScreenSafeAreaProps) => {
  const defaultEdges: Edge[] = ['top', 'left', 'right', 'bottom'];
  const requestedEdges = edges ?? defaultEdges;
  const safeEdges = disableBottomInset
    ? requestedEdges.filter((edge) => edge !== 'bottom')
    : requestedEdges;
  const { isPWDMode, layoutPadding } = useAdaptiveUI();
  const adaptivePadding = isPWDMode ? layoutPadding : 0;
  const adaptiveStyle = {
    paddingHorizontal: adaptivePadding,
    paddingTop: adaptivePadding,
    paddingBottom: disableBottomInset ? 0 : adaptivePadding,
    backgroundColor: isPWDMode ? '#FFF7F1' : undefined,
  };
  return (
    <SafeAreaView edges={safeEdges} style={[styles.container, adaptiveStyle, style]}>
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
