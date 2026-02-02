import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { Card, useTheme, TextInput } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RootStackScreenProps } from "../types/navigation";
import { selectLatestClinicalNote } from "../store/offlineSlice";
import { RootState } from "../store";
import {
  Button,
  YakapLogo,
  CheckSymptomsLogo,
  FacilityDirectoryLogo,
  Text,
  ScreenSafeArea,
  Modal,
} from "../components/common";
import { theme as appTheme } from "../theme";
import { FeedItem, FeedItemData } from "../components/features/feed/FeedItem";
import { useAuthStatus } from "../hooks/useAuthStatus";

// Import the new components
import HomeHero from "../components/heroes/HomeHero";
import { submitFeedbackReport } from "../services/apiConfig";

type FeedbackReportStatus = {
  type: "success" | "error";
  message: string;
};

type MainHomeNavigationProp = RootStackScreenProps<"Home">["navigation"];

export const MainHomeScreen = () => {
  const navigation = useNavigation<MainHomeNavigationProp>();
  const theme = useTheme();
  const lastNote = useSelector(selectLatestClinicalNote);
  const { items } = useSelector((state: RootState) => state.feed);
  const { isSignedIn } = useAuthStatus();
  const spacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const homeBottomPadding = spacing.lg * 2;
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [reportSubject, setReportSubject] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportEmail, setReportEmail] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportStatus, setReportStatus] = useState<FeedbackReportStatus | null>(
    null,
  );
  const openReportModal = () => {
    setReportStatus(null);
    setReportModalVisible(true);
  };

  const closeReportModal = () => {
    if (!reportSubmitting) {
      setReportModalVisible(false);
    }
  };

  const handleSubmitReport = async () => {
    const trimmedMessage = reportDetails.trim();
    if (!trimmedMessage) {
      setReportStatus({
        type: "error",
        message: "Please describe the issue so we can help.",
      });
      return;
    }

    setReportSubmitting(true);
    setReportStatus(null);

    try {
      await submitFeedbackReport({
        subject: reportSubject.trim() || "Main home feedback",
        message: trimmedMessage,
        contactEmail: reportEmail.trim() || undefined,
        context: { screen: "MainHome" },
      });

      setReportStatus({
        type: "success",
        message: "Thank you! Your mock report is captured.",
      });

      setReportSubject("");
      setReportDetails("");
      setReportEmail("");
    } catch {
      setReportStatus({
        type: "error",
        message: "Something went wrong. Please try again in a moment.",
      });
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleViewReports = () => {
    Alert.alert(
      "Reports coming soon",
      "The admin reporting dashboard is not live yet, but this action will open it once available.",
    );
  };

  const navigateToSignIn = () => {
    navigation.navigate("SignIn");
  };

  const navigateToSignUp = () => {
    navigation.navigate("SignUp");
  };

  const FeatureCard = ({
    title,
    subtitle,
    customIcon,
    color,
    onPress,
    testID,
  }: {
    title: string;
    subtitle?: string;
    customIcon: React.ReactNode;
    color: string;
    onPress: () => void;
    testID?: string;
  }) => {
    return (
      <Card
        style={[
          styles.card,
          styles.cardWide,
          {
            backgroundColor: theme.colors.surface,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.04,
            shadowRadius: 24,
            elevation: 3,
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.6)",
          },
        ]}
        onPress={onPress}
        testID={testID}
        accessible={true}
        accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ""}`}
        accessibilityRole="button"
        accessibilityHint={`Double tap to navigate to ${title}`}
      >
        <Card.Content style={styles.cardContent}>
          <View style={[styles.iconContainer, { backgroundColor: color }]}>
            {customIcon}
          </View>

          <View style={styles.textContainer}>
            <Text
              variant="titleLarge"
              numberOfLines={2}
              style={[
                styles.cardTitle,
                { color: theme.colors.onSurface },
                subtitle ? { marginBottom: 2 } : { marginBottom: 0 },
              ]}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                variant="bodyMedium"
                numberOfLines={2}
                style={[
                  styles.cardSubtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {subtitle}
              </Text>
            )}
          </View>

          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={theme.colors.primary}
            style={{ opacity: 0.8 }}
          />
        </Card.Content>
      </Card>
    );
  };

  const FeedbackCard = ({
    onReportIssuePress,
    onViewReportsPress,
    isSignedIn,
    onSignInPress = () => {},
    onCreateAccountPress = () => {},
  }: {
    onReportIssuePress: () => void;
    onViewReportsPress: () => void;
    isSignedIn: boolean;
    onSignInPress?: () => void;
    onCreateAccountPress?: () => void;
  }) => {
    return (
      <Card
        style={[
          styles.card,
          styles.cardWide,
          styles.feedbackCard,
          {
            backgroundColor: theme.colors.surface,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.04,
            shadowRadius: 24,
            elevation: 3,
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.6)",
          },
        ]}
        accessible
        accessibilityLabel="Help us improve our app card"
      >
        <Card.Content style={styles.feedbackCardContent}>
          <View style={styles.feedbackCardText}>
            <Text
              variant="titleLarge"
              numberOfLines={2}
              style={[
                styles.feedbackCardTitle,
                { color: theme.colors.onSurface },
              ]}
            >
              Help us improve our app
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.feedbackCardDescription,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Share feedback, request improvements, or report bugs so we can
              prioritize fixes for you.
            </Text>
          </View>
          <View style={styles.feedbackCardActions}>
            {isSignedIn ? (
              <>
                <Button
                  variant="outline"
                  title="View reports"
                  onPress={onViewReportsPress}
                  accessibilityLabel="View reports"
                  style={styles.feedbackCardButton}
                />
                <Button
                  title="Report an issue"
                  onPress={onReportIssuePress}
                  accessibilityLabel="Report an issue"
                  style={styles.feedbackCardButton}
                />
              </>
            ) : (
              <>
                <Button
                  title="Sign In"
                  variant="primary"
                  onPress={onSignInPress}
                  accessibilityLabel="Sign in"
                  style={styles.feedbackCardButton}
                />
                <Button
                  title="Create Account"
                  variant="primary"
                  onPress={onCreateAccountPress}
                  accessibilityLabel="Create an account"
                  style={styles.feedbackCardButton}
                />
              </>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  const MOCK_PREVIEW: FeedItemData[] = [
    {
      id: "1",
      title: "Naga City Health Tips",
      category: "Prevention",
      description:
        "Protect yourself from seasonal illnesses with these local health guidelines.",
      icon: "shield-check-outline",
      timestamp: "2 hours ago",
    },
    {
      id: "2",
      title: "Upcoming Vaccination Drive",
      category: "Community",
      description:
        "Free vaccinations available at the Naga City People's Hall this Friday.",
      icon: "needle",
      timestamp: "5 hours ago",
    },
  ];

  const previewData =
    items && items.length > 0 ? items.slice(0, 2) : MOCK_PREVIEW;

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "left", "right", "bottom"]}
      disableBottomInset
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: homeBottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        <HomeHero
          hasClinicalReport={!!lastNote}
          onClinicalReportPress={() => navigation.navigate("ClinicalNote", {})}
          isSignedIn={isSignedIn}
          onSignInPress={navigateToSignIn}
        />

        <View style={styles.cardsContainer}>
          <View style={styles.bottomStack}>
            <View style={styles.bottomStackItem}>
              <FeatureCard
                title="Check Symptoms"
                subtitle="AI-powered health assessment"
                customIcon={<CheckSymptomsLogo width={44} height={44} />}
                color={theme.colors.primary}
                onPress={() =>
                  navigation.navigate("Check", { screen: "CheckSymptom" })
                }
              />
            </View>
            <View style={styles.bottomStackItem}>
              <FeatureCard
                title="Facility Directory"
                subtitle="Find hospitals & health centers nearby"
                customIcon={<FacilityDirectoryLogo width={44} height={44} />}
                color={theme.colors.secondary}
                onPress={() =>
                  navigation.navigate("Find", {
                    screen: "FacilityDirectory",
                    params: {},
                  })
                }
              />
            </View>
            <View style={styles.bottomStackItem}>
              <FeatureCard
                title="YAKAP Guide"
                subtitle="Guided steps for free healthcare"
                customIcon={<YakapLogo width={44} height={44} />}
                color={theme.colors.primary}
                onPress={() =>
                  navigation.navigate("YAKAP", { screen: "YakapHome" })
                }
              />
            </View>
          </View>

          <View style={styles.feedbackCardWrapper}>
            <FeedbackCard
              onReportIssuePress={openReportModal}
              onViewReportsPress={handleViewReports}
              isSignedIn={isSignedIn}
              onSignInPress={navigateToSignIn}
              onCreateAccountPress={navigateToSignUp}
            />
          </View>

          <View style={styles.feedSection}>
            <View style={styles.sectionHeader}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Discover Latest News
              </Text>
            </View>

            <View style={styles.feedList}>
              {previewData.map((item) => (
                <FeedItem
                  key={item.id}
                  item={item}
                  onPress={() =>
                    navigation.navigate("Home", { screen: "HealthHub" })
                  }
                />
              ))}
            </View>
            <View style={styles.seeMoreButtonContainer}>
              <Button
                title="See More"
                onPress={() =>
                  navigation.navigate("Home", { screen: "HealthHub" })
                }
                style={styles.seeMoreButton}
                accessibilityLabel="See more news"
              />
            </View>
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={isReportModalVisible}
        onDismiss={closeReportModal}
        contentContainerStyle={styles.reportModalContainer}
      >
        <View style={styles.reportModalBody}>
          <Text variant="titleLarge" style={styles.reportModalTitle}>
            Report an issue
          </Text>
          <Text
            variant="bodyMedium"
            style={[
              styles.reportModalDescription,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Share details about bugs, confusing flows, or missing content so we
            can improve faster.
          </Text>
          <TextInput
            mode="outlined"
            label="Subject (optional)"
            value={reportSubject}
            onChangeText={setReportSubject}
            style={styles.reportModalField}
            outlineStyle={[
              styles.reportModalFieldOutline,
              { borderColor: theme.colors.outline },
            ]}
            dense
          />
          <TextInput
            mode="outlined"
            label="Email (optional)"
            value={reportEmail}
            onChangeText={setReportEmail}
            style={styles.reportModalField}
            outlineStyle={[
              styles.reportModalFieldOutline,
              { borderColor: theme.colors.outline },
            ]}
            dense
          />
          <TextInput
            mode="outlined"
            label="Describe the issue"
            value={reportDetails}
            onChangeText={setReportDetails}
            style={[styles.reportModalField, styles.reportModalDetails]}
            outlineStyle={[
              styles.reportModalFieldOutline,
              { borderColor: theme.colors.outline },
            ]}
            multiline
            numberOfLines={5}
            dense
          />
          {reportStatus && (
            <Text
              variant="bodySmall"
              style={[
                styles.reportModalStatus,
                reportStatus.type === "success"
                  ? styles.reportModalStatusSuccess
                  : styles.reportModalStatusError,
              ]}
            >
              {reportStatus.message}
            </Text>
          )}
          <Button
            title="Submit report"
            onPress={handleSubmitReport}
            loading={reportSubmitting}
            disabled={reportSubmitting}
            style={styles.reportModalSubmit}
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
  cardsContainer: {
    marginTop: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1F2937",
    letterSpacing: -0.5,
  },
  bottomStack: {
    flexDirection: "column",
    gap: 16,
  },
  authCTAWrapper: {
    marginTop: 8,
  },
  bottomStackItem: {
    width: "100%",
  },
  feedSection: {
    marginTop: 24,
  },
  feedList: {
    marginTop: 0,
    gap: 16,
  },
  seeMoreButtonContainer: {
    marginTop: 16,
  },
  seeMoreButton: {
    alignSelf: "flex-start",
  },
  card: {
    borderRadius: 24,
    borderWidth: 0,
    overflow: "hidden",
  },
  cardWide: {
    width: "100%",
  },
  cardContent: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 22,
  },
  cardSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 0,
  },
  feedbackCardWrapper: {
    marginTop: 24,
  },
  homeAuthCard: {
    marginVertical: 0,
  },
  feedbackCard: {
    paddingVertical: 8,
  },
  feedbackAuthCard: {
    marginVertical: 0,
  },
  feedbackCardContent: {
    gap: 12,
  },
  feedbackCardText: {
    gap: 6,
  },
  feedbackCardTitle: {
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  feedbackCardDescription: {
    lineHeight: 20,
  },
  feedbackCardActions: {
    flexDirection: "column",
    gap: 12,
    marginTop: 8,
  },
  feedbackCardButton: {
    width: "100%",
  },
  reportModalContainer: {
    width: "100%",
    maxWidth: 520,
    paddingHorizontal: 24,
  },
  reportModalBody: {
    gap: 12,
  },
  reportModalTitle: {
    fontWeight: "800",
  },
  reportModalDescription: {
    color: "#4B5563",
  },
  reportModalField: {
    width: "100%",
  },
  reportModalDetails: {
    minHeight: 120,
  },
  reportModalFieldOutline: {
    borderRadius: 12,
    borderWidth: 1,
  },
  reportModalStatus: {
    fontSize: 14,
  },
  reportModalStatusSuccess: {
    color: "#047857",
  },
  reportModalStatusError: {
    color: "#B91C1C",
  },
  reportModalSubmit: {
    marginTop: 4,
  },
});
