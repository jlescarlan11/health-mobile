import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Text } from '../common';
import HeroSection from './HeroSection';
import { useAppSelector } from '../../hooks/reduxHooks';

interface HomeHeroProps {
  hasClinicalReport?: boolean;
  onClinicalReportPress?: () => void;
  isSignedIn?: boolean;
  onSignInPress?: () => void;
}

const HomeHero: React.FC<HomeHeroProps> = ({
  hasClinicalReport,
  onClinicalReportPress,
  isSignedIn = false,
  onSignInPress,
}) => {
  const theme = useTheme();
  const authFirstName = useAppSelector((state) => state.auth.user?.firstName);

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const greeting = isSignedIn && authFirstName ? `Kamusta, ${authFirstName}!` : 'Kamusta!';

  const renderSubtitle = () => {
    const subtitleStyle = [styles.subtitle, { color: theme.colors.onSurface }];

    if (!isSignedIn) {
      return (
        <Text style={subtitleStyle}>
          <Text
            style={[
              styles.subtitleLink,
              { color: theme.colors.primary },
            ]}
            onPress={onSignInPress}
            accessibilityRole="link"
          >
            Sign in
          </Text>{' '}
          to access full features and services
        </Text>
      );
    }

    if (hasClinicalReport && onClinicalReportPress) {
      return (
        <Text style={subtitleStyle}>
          Your{' '}
          <Text
            style={{
              textDecorationLine: 'underline',
              color: theme.colors.primary,
              fontWeight: '700',
            }}
            onPress={onClinicalReportPress}
            role="link"
          >
            clinical report
          </Text>{' '}
          is ready
        </Text>
      );
    }

    return (
      <Text style={subtitleStyle}>How can we help you today?</Text>
    );
  };

  return (
    <HeroSection colors={[theme.colors.primaryContainer, theme.colors.background]} height={280}>
      <View style={styles.container}>
        <View style={styles.contentContainer}>
          <Text style={[styles.date, { color: theme.colors.onSurfaceVariant }]}>
            {formattedDate}
          </Text>
          <Text style={[styles.greeting, { color: theme.colors.primary }]}>{greeting}</Text>
          {renderSubtitle()}
        </View>
      </View>
    </HeroSection>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end', // Push content to the bottom of the hero area
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  contentContainer: {
    gap: 8,
  },
  date: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.8,
  },
  greeting: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: 30,
    opacity: 0.9,
  },
  subtitleLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

export default HomeHero;
