import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, StyleProp } from 'react-native';
import { Card, useTheme } from 'react-native-paper';

interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
}

const SkeletonItem = ({ style }: { style: StyleProp<ViewStyle> }) => {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[{ opacity, backgroundColor: theme.colors.surfaceVariant }, style]} />
  );
};

export const FacilityCardSkeleton: React.FC<SkeletonProps> = ({ style }) => {
  const theme = useTheme();
  return (
    <Card
      style={[
        styles.card,
        style,
        {
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}
      mode="contained"
    >
      <View style={styles.cardInner}>
        {/* Header Row */}
        <SkeletonItem style={styles.titleLine} />

        {/* Meta Row */}
        <View style={styles.metaRow}>
          <SkeletonItem style={[styles.metaText, { width: 80 }]} />
          <SkeletonItem style={styles.separatorDot} />
          <SkeletonItem style={[styles.metaText, { width: 110 }]} />
          <SkeletonItem style={styles.separatorDot} />
          <SkeletonItem style={[styles.metaText, { width: 60 }]} />
        </View>

        {/* Status Row */}
        <View style={styles.statusRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SkeletonItem style={styles.statusIcon} />
            <SkeletonItem style={styles.statusText} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SkeletonItem style={styles.separatorDot} />
            <SkeletonItem style={styles.statusIcon} />
            <SkeletonItem style={[styles.statusText, { width: 90 }]} />
          </View>
        </View>

        {/* Services Row */}
        <View style={styles.servicesRow}>
          <SkeletonItem style={[styles.serviceChip, { width: 90 }]} />
          <SkeletonItem style={[styles.serviceChip, { width: 120 }]} />
          <SkeletonItem style={[styles.serviceChip, { width: 80 }]} />
        </View>

        {/* Action Buttons Row */}
        <View style={styles.actionsRow}>
          <SkeletonItem style={styles.actionButton} />
          <SkeletonItem style={styles.actionButton} />
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    borderRadius: 20,
    borderWidth: 0,
  },
  cardInner: {
    padding: 16,
  },
  titleLine: {
    width: '75%',
    height: 26,
    borderRadius: 6,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaText: {
    height: 12,
    borderRadius: 4,
  },
  separatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 6,
  },
  statusText: {
    width: 60,
    height: 14,
    borderRadius: 4,
  },
  servicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  serviceChip: {
    height: 24,
    borderRadius: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
  },
});
