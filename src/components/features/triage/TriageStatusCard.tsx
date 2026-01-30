import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, useTheme, MD3Theme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '../../common/Button';
import { Text } from '../../common/Text';
import { TriageLevel } from '../../../types/triage';

interface TriageStatusCardProps {
  level: TriageLevel;
  instruction?: string;
  intro?: string;
  onEmergencyAction?: () => void;
}

type ThemeColors = MD3Theme['colors'];

const LEVEL_LABELS: Record<TriageLevel, string> = {
  emergency: 'Emergency (Life-Threatening)',
  hospital: 'Hospital (Specialized Care)',
  'health-center': 'Health Center (Primary Care)',
  'self-care': 'Self Care (Home Management)',
};

export const getLevelLabel = (level: TriageLevel) => LEVEL_LABELS[level] ?? level;

export const TriageStatusCard: React.FC<TriageStatusCardProps> = ({
  level,
  intro,
  instruction,
  onEmergencyAction,
}) => {
  const theme = useTheme() as MD3Theme & { spacing: Record<string, number> };
  const spacing = theme.spacing;
  const levelConfig = getLevelConfig(level, theme.colors);
  const showEmergencyButton = level === 'emergency' && Boolean(onEmergencyAction);
  const levelLabel = getLevelLabel(level);

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: levelConfig.backgroundColor,
          shadowColor: theme.colors.shadow,
          padding: spacing.lg,
        },
      ]}
      mode="contained"
      accessible={true}
      accessibilityRole="text"
    >
      <View style={[styles.content, { gap: spacing.md }]}>
        <View style={styles.iconRow}>
          <MaterialCommunityIcons
            name={levelConfig.icon}
            size={36}
            color={levelConfig.foregroundColor}
            accessibilityLabel={`${level} triage level icon`}
          />
        </View>
        {intro ? (
          <Text variant="bodySmall" style={[styles.introText, { color: levelConfig.contentColor }]}>
            Based on your symptoms, we recommend:
          </Text>
        ) : null}
        <Text
          variant="headlineMedium"
          style={[
            styles.primaryLabel,
            { color: levelConfig.foregroundColor, lineHeight: 34, letterSpacing: 0.5 },
          ]}
          accessibilityRole="header"
        >
          {levelLabel}
        </Text>
        {instruction ? (
          <Text
            variant="bodyMedium"
            style={[styles.justificationText, { color: levelConfig.contentColor }]}
          >
            {instruction.trim()}
          </Text>
        ) : null}
        {showEmergencyButton ? (
          <View style={[styles.actionContainer, { marginTop: spacing.sm }]}>
            <Button
              title="Call Emergency Services"
              variant="danger"
              onPress={onEmergencyAction || (() => {})}
              icon="phone"
              accessibilityHint="Calls emergency services."
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    elevation: 2,
  },
  content: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontWeight: '800',
    textAlign: 'center',
  },
  introText: {
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  justificationText: {
    textAlign: 'justify',
    lineHeight: 22,
  },
  actionContainer: {
    width: '100%',
  },
});

const getLevelConfig = (
  level: TriageLevel,
  colors: ThemeColors,
): {
  icon: keyof (typeof MaterialCommunityIcons)['glyphMap'];
  backgroundColor: string;
  foregroundColor: string;
  contentColor: string;
} => {
  const levelMap: Record<TriageLevel, LevelConfig> = {
    emergency: {
      icon: 'alert-decagram',
      foregroundColor: colors.error,
      backgroundColor: colors.errorContainer,
      contentColor: colors.onSurface,
    },
    hospital: {
      icon: 'hospital-building',
      foregroundColor: colors.onSurface,
      backgroundColor: colors.secondaryContainer,
      contentColor: colors.onSurface,
    },
    'health-center': {
      icon: 'medical-bag',
      foregroundColor: colors.primary,
      backgroundColor: colors.primaryContainer,
      contentColor: colors.onSurface,
    },
    'self-care': {
      icon: 'home-heart',
      foregroundColor: colors.primary,
      backgroundColor: colors.primaryContainer,
      contentColor: colors.primary,
    },
  };

  return levelMap[level];
};

type LevelConfig = {
  icon: keyof (typeof MaterialCommunityIcons)['glyphMap'];
  backgroundColor: string;
  foregroundColor: string;
  contentColor: string;
};
