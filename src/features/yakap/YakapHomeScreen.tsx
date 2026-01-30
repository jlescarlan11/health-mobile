import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { Button, Card, Text, ScreenSafeArea } from '../../components/common';
import { StandardHeader } from '../../components/common/StandardHeader';
import { YAKAP_BENEFITS, YakapBenefit } from './yakapContent';
import { YakapStackScreenProps } from '../../types/navigation';
import { theme as appTheme } from '../../theme';

const YakapHomeScreen = () => {
  const theme = useTheme();
  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const scrollContentPaddingBottom = (themeSpacing.lg ?? 16) * 2;
  const benefitCardPadding = themeSpacing.lg ?? 16;
  const navigation = useNavigation<YakapStackScreenProps<'YakapHome'>['navigation']>();

  const navigateToGuidePaths = () => {
    navigation.navigate('YakapGuidePaths');
  };

  const navigateToFacilities = () => {
    navigation.navigate('Find', {
      screen: 'FacilityDirectory',
      params: { filter: 'yakap' },
    });
  };

  const navigateToFaq = () => {
    navigation.navigate('YakapFaq');
  };

  const renderBenefitItem = (benefit: YakapBenefit) => (
      <Card
        key={benefit.id}
        mode="contained"
        rippleColor={theme.colors.primary + '15'}
        accessibilityLabel={`Benefit: ${benefit.category}`}
        style={[
          styles.benefitCard,
          {
            backgroundColor: '#ffffff',
            borderColor: theme.colors.outline,
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 14,
            elevation: 4,
          },
        ]}
        contentStyle={[styles.benefitCardContent, { padding: benefitCardPadding }]}
      >
      <Text style={[styles.benefitTitle, { color: theme.colors.onSurface }]}>
        {benefit.category}
      </Text>
      <Text style={[styles.benefitDesc, { color: theme.colors.onSurfaceVariant }]}>
        {benefit.description}
      </Text>
    </Card>
  );

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <StandardHeader title="YAKAP Guide" showBackButton />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollContentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View
          style={[styles.heroSection, { backgroundColor: theme.colors.primaryContainer + '30' }]}
        >
          <View style={styles.heroContent}>
            <Text
              variant="headlineMedium"
              style={[styles.heroTitle, { color: theme.colors.onSurface }]}
            >
              YAKAP Program
            </Text>
            <Text
              variant="titleMedium"
              style={[styles.heroSubtitle, { color: theme.colors.primary }]}
            >
              Yaman ng Kalusugan Program
            </Text>
            <View style={[styles.heroAccent, { backgroundColor: theme.colors.secondary }]} />
            <Text style={[styles.heroDesc, { color: theme.colors.onSurfaceVariant }]}>
              Every Filipino is eligible. Follow our step-by-step guide to learn how you can enroll
              in the YAKAP program and start accessing free healthcare benefits.
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <Button variant="primary" onPress={navigateToGuidePaths} title="Open YAKAP Guide" />
          <Button variant="text" onPress={navigateToFacilities} title="Find YAKAP Clinics" />
        </View>

        {/* Benefits Summary */}
        <View style={styles.section}>
          <Text
            variant="labelLarge"
            style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}
          >
            KEY BENEFITS
          </Text>
          <View style={styles.benefitsList}>
            {YAKAP_BENEFITS.map((benefit) => renderBenefitItem(benefit))}
          </View>
        </View>

        {/* FAQ Link */}
        <View style={[styles.footer, { marginBottom: themeSpacing.lg ?? 16 }]}>
          <TouchableOpacity
            onPress={navigateToFaq}
            activeOpacity={0.7}
            style={styles.faqLinkContainer}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color={theme.colors.onSurfaceVariant}
              style={styles.faqIcon}
            />
            <Text style={[styles.faqText, { color: theme.colors.onSurfaceVariant }]}>
              Frequently Asked Questions
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {},
  heroSection: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  heroContent: {
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 16,
    textTransform: 'uppercase',
    fontSize: 14,
  },
  heroAccent: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  heroDesc: {
    textAlign: 'left',
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.9,
    letterSpacing: 0.2,
  },
  actionButtonsContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 12,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    marginBottom: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontSize: 12,
    opacity: 0.6,
  },
  benefitsList: {
    flexDirection: 'column',
    paddingBottom: 8,
  },
  benefitCard: {
    marginVertical: 6,
    marginBottom: 0,
    borderRadius: 20,
    borderWidth: 1,
  },
  benefitCardContent: {},
  benefitTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  benefitDesc: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'left',
    lineHeight: 24,
    opacity: 0.85,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  faqLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    opacity: 0.6,
  },
  faqIcon: {
    marginRight: 8,
  },
  faqText: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
    letterSpacing: 0.3,
  },
});

export default YakapHomeScreen;
