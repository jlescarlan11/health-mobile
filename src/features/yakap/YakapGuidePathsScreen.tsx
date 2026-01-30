import React, { useState } from 'react';
import { StyleSheet, ScrollView, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Button, ScreenSafeArea } from '../../components/common';
import { RootStackParamList } from '../../types/navigation';
import { theme as appTheme } from '../../theme';
import { YAKAP_GUIDE_PATHWAYS, YakapGuidePathway as Pathway } from './yakapContent';

import { StandardHeader } from '../../components/common/StandardHeader';

type YakapGuidePathsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'YakapGuidePaths'
>;

const YakapGuidePathsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<YakapGuidePathsScreenNavigationProp>();
  const [selectedPathway, setSelectedPathway] = useState<Pathway | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const scrollContentPaddingBottom = (themeSpacing.lg ?? 16) * 2;

  const handlePathwaySelect = (pathway: Pathway) => {
    setSelectedPathway(pathway);
    setModalVisible(true);
  };

  const handleProceed = () => {
    if (selectedPathway) {
      setModalVisible(false);
      navigation.navigate('YakapGuideSteps', { pathwayId: selectedPathway.id });
    }
  };

  const renderDetailItem = (
    label: string,
    items: string[],
    color: string,
    icon: keyof typeof MaterialCommunityIcons.glyphMap,
  ) => (
    <View style={styles.detailSection}>
      <Text variant="labelMedium" style={[styles.detailLabel, { color }]}>
        {label}
      </Text>
      {items.map((item, index) => (
        <View key={index} style={styles.itemRow}>
          <MaterialCommunityIcons name={icon} size={14} color={color} style={styles.itemIcon} />
          <Text variant="bodySmall" style={[styles.detailText, { color: theme.colors.onSurface }]}>
            {item}
          </Text>
        </View>
      ))}
    </View>
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
        <View style={styles.headerContainer}>
          <Text variant="bodyLarge" style={[styles.headerText, { color: theme.colors.onSurface }]}>
            Choose the guide path that works best for you.
          </Text>
        </View>

        {YAKAP_GUIDE_PATHWAYS.map((pathway) => (
          <Card
            key={pathway.id}
            onPress={() => handlePathwaySelect(pathway)}
            mode="contained"
            rippleColor={theme.colors.primary + '15'}
            accessibilityLabel={`${pathway.name} pathway`}
            accessibilityHint={`Double tap to select the ${pathway.name} guide path`}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                // Using shadow instead of border for a cleaner "Washi" look
                shadowColor: theme.colors.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: pathway.recommended ? 0.12 : 0.08,
                shadowRadius: pathway.recommended ? 16 : 12,
                elevation: pathway.recommended ? 6 : 4,
                // Subtle border only for recommended or very light for others
                borderWidth: pathway.recommended ? 1.5 : 0,
                borderColor: pathway.recommended ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderTitle}>
                <View style={styles.titleWithChip}>
                  <Text
                    variant="titleLarge"
                    style={[styles.cardTitle, { color: theme.colors.onSurface }]}
                  >
                    {pathway.name}
                  </Text>
                  {pathway.recommended && (
                    <View
                      style={[
                        styles.recommendedBadge,
                        { backgroundColor: theme.colors.primaryContainer },
                      ]}
                    >
                      <Text style={[styles.recommendedBadgeText, { color: theme.colors.primary }]}>
                        BEST CHOICE
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={14}
                    color={theme.colors.primary}
                  />
                  <Text
                    variant="labelMedium"
                    style={[
                      styles.metaText,
                      { color: theme.colors.onSurfaceVariant, marginLeft: 6 },
                    ]}
                  >
                    {pathway.estimatedDuration}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: theme.colors.outlineVariant }]} />
                <View style={styles.metaItem}>
                  <Text
                    variant="labelMedium"
                    style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {pathway.difficulty.toUpperCase()} EFFORT
                  </Text>
                </View>
              </View>
            </View>

            {/* Subtle Divider (Ma) */}
            <View
              style={[
                styles.subtleDivider,
                { backgroundColor: theme.colors.outlineVariant, opacity: 0.1 },
              ]}
            />

            <View style={styles.cardContent}>
              <Text
                variant="bodyMedium"
                style={[styles.pathwayDescription, { color: theme.colors.onSurfaceVariant }]}
              >
                {pathway.description}
              </Text>

              <View style={styles.requirementsContainer}>
                <Text
                  variant="labelSmall"
                  style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
                >
                  REQUIRED:
                </Text>
                <View style={styles.requirementChips}>
                  {pathway.requirements.map((req, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.reqChip,
                        {
                          backgroundColor: theme.colors.background,
                          borderColor: theme.colors.outlineVariant + '40',
                        },
                      ]}
                    >
                      <Text
                        variant="labelSmall"
                        style={{ color: theme.colors.onSurface, opacity: 0.8 }}
                      >
                        {req}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.detailsList}>
                {renderDetailItem(
                  'BENEFITS',
                  pathway.pros,
                  theme.colors.primary,
                  'check-circle-outline',
                )}
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
      >
        <Text
          variant="headlineSmall"
          style={[styles.modalTitle, { color: theme.colors.onSurface }]}
        >
          Confirm Pathway
        </Text>
          <Text
            variant="bodyMedium"
            style={[styles.modalText, { color: theme.colors.onSurfaceVariant }]}
          >
            You have chosen{' '}
            <Text style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {selectedPathway?.name}
            </Text>
            . Do you want to proceed with this guide path?
        </Text>

        <View style={styles.modalButtons}>
          <Button
            variant="text"
            title="Cancel"
            onPress={() => setModalVisible(false)}
            style={styles.modalButton}
          />
          <Button
            variant="primary"
            title="Proceed"
            onPress={handleProceed}
            style={styles.modalButton}
          />
        </View>
      </Modal>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerContainer: {
    marginBottom: 32,
    marginTop: 12,
  },
  headerText: {
    textAlign: 'left',
    lineHeight: 26,
    letterSpacing: 0.3,
    opacity: 0.8,
  },
  card: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 16,
    paddingBottom: 12,
  },
  cardHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleWithChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontWeight: '600',
    letterSpacing: 0.8,
    fontSize: 11,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 12,
    opacity: 0.5,
  },
  subtleDivider: {
    height: 1,
    marginHorizontal: 16,
    opacity: 0.1,
  },
  cardContent: {
    padding: 16,
    paddingTop: 12,
  },
  pathwayDescription: {
    marginBottom: 16,
    lineHeight: 20,
    opacity: 0.9,
  },
  requirementsContainer: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 1.2,
    fontSize: 10,
    opacity: 0.6,
  },
  requirementChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reqChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  detailsList: {
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  itemIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  detailSection: {
    marginRight: 0,
  },
  detailLabel: {
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 1.2,
    fontSize: 10,
    opacity: 0.6,
  },
  detailText: {
    lineHeight: 20,
    flex: 1,
    fontWeight: '500',
  },
  modalContent: {
    padding: 24,
    margin: 24,
    borderRadius: 20,
  },
  modalTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalText: {
    marginBottom: 24,
    lineHeight: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    minWidth: 100,
  },
});

export default YakapGuidePathsScreen;
