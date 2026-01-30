import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  Dimensions,
  Alert,
  StyleProp,
  TextStyle,
} from "react-native";
import {
  useNavigation,
  useRoute,
  NavigationProp,
} from "@react-navigation/native";
import { useSelector } from "react-redux";
import { ScreenSafeArea, FeatureChip } from "../components/common";
import { Ionicons } from "@expo/vector-icons";
import ImageViewing from "react-native-image-viewing";
import { useTheme, Surface, IconButton } from "react-native-paper";

import { Text } from "../components/common/Text";
import { Button } from "../components/common/Button";
import { FacilityActionButtons } from "../components/common/FacilityActionButtons";
import { StandardHeader } from "../components/common/StandardHeader";
import { FacilityStatusIndicator } from "../components/common/FacilityStatusIndicator";
import { useUserLocation } from "../hooks";
import { useAdaptiveUI } from "../hooks/useAdaptiveUI";
import { openExternalMaps } from "../utils/linkingUtils";
import { chipLayoutStyles } from "../components/common/chipLayout";
import { sharingUtils } from "../utils/sharingUtils";
import { calculateDistance, formatDistance } from "../utils/locationUtils";
import { formatOperatingHours } from "../utils/facilityUtils";
import { formatFacilityType } from "../utils/stringUtils";
import { RootState } from "../store";
import { RootStackScreenProps } from "../types/navigation";
import { theme as appTheme } from "../theme";
import { FacilityService } from "../types";

type FacilityDetailsRouteProp =
  RootStackScreenProps<"FacilityDetails">["route"];

const { width } = Dimensions.get("window");
const IMAGE_HEIGHT = 250;

const CATEGORIES: Record<string, FacilityService[]> = {
  "Primary Care": [
    "Consultation",
    "General Medicine",
    "Pediatrics",
    "Internal Medicine",
    "Family Planning",
    "Immunization",
    "Nutrition Services",
    "Maternal Care",
    "Adolescent Health",
    "Dental",
    "Primary Care",
  ],
  "Emergency & Urgent Care": ["Emergency", "Trauma Care", "Animal Bite Clinic"],
  "Specialized Services": [
    "OB-GYN",
    "ENT",
    "Dermatology",
    "Surgery",
    "Mental Health",
    "Dialysis",
    "Eye Center",
    "Stroke Unit",
    "HIV Treatment",
  ],
  "Diagnostics & Support": [
    "Laboratory",
    "Radiology",
    "X-ray",
    "Clinical Chemistry",
    "Clinical Microscopy",
    "Hematology",
    "Blood Bank",
    "ECG",
  ],
};

export const FacilityDetailsScreen = () => {
  const theme = useTheme();
  const { scaleFactor } = useAdaptiveUI();
  const route = useRoute<FacilityDetailsRouteProp>();
  const navigation =
    useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { facilityId } = route.params || { facilityId: "" };

  const facility = useSelector((state: RootState) =>
    state.facilities.facilities.find((f) => f.id === facilityId),
  );

  const { location } = useUserLocation();
  const reduxLocation = useSelector(
    (state: RootState) => state.facilities.userLocation,
  );

  const userLat = location?.coords.latitude || reduxLocation?.latitude;
  const userLon = location?.coords.longitude || reduxLocation?.longitude;

  const [isImageViewerVisible, setImageViewerVisible] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});

  const distance = useMemo(() => {
    if (!facility || !userLat || !userLon) return null;
    return calculateDistance(
      userLat,
      userLon,
      facility.latitude,
      facility.longitude,
    );
  }, [facility, userLat, userLon]);

  const groupedServices = useMemo(() => {
    if (!facility) return {};

    const grouped: Record<string, FacilityService[]> = {};
    const allServices: FacilityService[] = [...(facility.services || [])];

    // Add specialized_services to Specialized Services category if they exist
    if (facility.specialized_services) {
      facility.specialized_services.forEach((s) => {
        const service = s as any as FacilityService;
        if (!allServices.includes(service)) {
          allServices.push(service);
        }
      });
    }

    Object.entries(CATEGORIES).forEach(([category, services]) => {
      const found = allServices.filter((s) => services.includes(s));
      if (found.length > 0) {
        grouped[category] = found;
      }
    });

    // Catch any remaining services
    const categorizedServices = Object.values(CATEGORIES).flat();
    const uncategorized = allServices.filter(
      (s) => !categorizedServices.includes(s),
    );

    if (uncategorized.length > 0) {
      grouped["Other Services"] = uncategorized;
    }

    return grouped;
  }, [facility]);

  const hasServiceGroups = Object.keys(groupedServices).length > 0;

  const infoLabelStyle: StyleProp<TextStyle> = [
    styles.sectionLabel,
    {
      color: theme.colors.onSurface,
      fontSize: 12 * scaleFactor,
      fontWeight: "700",
    },
  ];

  const infoValueTypography = {
    fontSize: 16 * scaleFactor,
    lineHeight: 24 * scaleFactor,
  };

  const infoValueTextStyle: StyleProp<TextStyle> = [
    styles.infoText,
    infoValueTypography,
    { color: theme.colors.onSurfaceVariant },
  ];

  if (!facility) {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <StandardHeader title="Details" showBackButton />
        <View style={styles.errorContainer}>
          <Text
            style={[styles.errorText, { color: theme.colors.onSurfaceVariant }]}
          >
            Facility not found.
          </Text>
          <Button title="Go Back" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const images = facility.photoUrl ? [{ uri: facility.photoUrl }] : [];

  const handleShare = async () => {
    if (facility) {
      await sharingUtils.shareFacilityInfo(facility);
    }
  };

  const handleDirections = async () => {
    const opened = await openExternalMaps({
      latitude: facility.latitude,
      longitude: facility.longitude,
      label: facility.name,
      address: facility.address,
    });

    if (!opened) {
      Alert.alert("Error", "Failed to open maps for directions.");
    }
  };

  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const baseBottomPadding = themeSpacing.lg ?? 16;
  const scrollBottomPadding = baseBottomPadding;

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["left", "right"]}
    >
      <StandardHeader
        title={facility.name}
        showBackButton
        rightActions={
          <TouchableOpacity
            onPress={handleShare}
            style={styles.headerShareButton}
            testID="header-share-button"
          >
            <Ionicons
              name="share-outline"
              size={24}
              color={theme.colors.onSurface}
            />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo Gallery */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => images.length > 0 && setImageViewerVisible(true)}
        >
          <Image
            source={
              images.length > 0
                ? { uri: images[0].uri }
                : require("../../assets/images/icon.png")
            }
            style={[
              styles.headerImage,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
            resizeMode="cover"
          />
          {images.length > 0 && (
            <View style={styles.galleryIndicator}>
              <Ionicons
                name="images-outline"
                size={16 * scaleFactor}
                color="#fff"
              />
              <Text style={styles.galleryText}>View Photos</Text>
            </View>
          )}
        </TouchableOpacity>

        {images.length > 0 && (
          <ImageViewing
            images={images}
            imageIndex={0}
            visible={isImageViewerVisible}
            onRequestClose={() => setImageViewerVisible(false)}
          />
        )}

        <View style={styles.contentContainer}>
          {/* Header Info */}
          <View style={styles.headerSection}>
            <Text
              style={[
                styles.facilityName,
                { color: theme.colors.onSurface, fontSize: 24 * scaleFactor },
              ]}
            >
              {facility.name}
            </Text>

            <View style={styles.metaRow}>
              {[
                formatFacilityType(facility.type),
                facility.yakapAccredited ? "YAKAP Accredited" : null,
                typeof distance === "number" && !isNaN(distance)
                  ? `${formatDistance(distance)}`
                  : null,
              ]
                .filter(Boolean)
                .map((item, index, array) => (
                  <React.Fragment key={index}>
                    <Text style={styles.metaItem}>{item}</Text>
                    {index < array.length - 1 && (
                      <Text style={styles.metaSeparator}>•</Text>
                    )}
                  </React.Fragment>
                ))}
            </View>

            <FacilityStatusIndicator facility={facility} />
          </View>

          {/* Quick Actions */}
          <FacilityActionButtons
            contacts={facility.contacts}
            primaryPhone={facility.phone}
            onDirectionsPress={handleDirections}
            containerStyle={styles.actionButtons}
          />

          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />

          {/* Location */}
          <View style={styles.infoSection}>
            <View style={styles.infoTextContainer}>
              <Text style={infoLabelStyle}>Address</Text>
              <Text style={infoValueTextStyle}>{facility.address}</Text>
            </View>
          </View>

          {/* Hours */}
          <View style={styles.infoSection}>
            <View style={styles.infoTextContainer}>
              <Text style={infoLabelStyle}>Operating Hours</Text>

              {formatOperatingHours(facility).map((line, idx) => (
                <Text key={idx} style={infoValueTextStyle}>
                  {line}
                </Text>
              ))}
            </View>
          </View>

          {/* Contacts */}
          <View style={styles.infoSection}>
            <View style={styles.infoTextContainer}>
              <Text style={infoLabelStyle}>Contacts</Text>

              {facility.contacts && facility.contacts.length > 0 ? (
                facility.contacts
                  .filter(
                    (c) => c.platform === "phone" || c.platform === "email",
                  )
                  .map((contact, index) => (
                    <Surface
                      key={contact.id || index}
                      style={[
                        styles.contactOptionSurface,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.outlineVariant,
                        },
                      ]}
                      elevation={1}
                    >
                      <View style={styles.contactOptionContent}>
                        <View style={styles.contactInfo}>
                          <Text
                            style={[styles.contactName, { color: "#000000" }]}
                          >
                            {contact.contactName ||
                              (contact.platform === "email"
                                ? "Email"
                                : "Phone")}
                          </Text>
                          <Text
                            style={[
                              styles.contactNumber,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {contact.phoneNumber}
                          </Text>
                        </View>
                        <IconButton
                          icon={
                            contact.platform === "email" ? "email" : "phone"
                          }
                          mode="contained"
                          containerColor={theme.colors.primary}
                          iconColor={theme.colors.onPrimary}
                          size={24}
                          onPress={() => {
                            const url =
                              contact.platform === "email"
                                ? `mailto:${contact.phoneNumber}`
                                : `tel:${contact.phoneNumber}`;
                            Linking.openURL(url);
                          }}
                        />
                      </View>
                    </Surface>
                  ))
              ) : (
                <Surface
                  style={[
                    styles.contactOptionSurface,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.outlineVariant,
                    },
                  ]}
                  elevation={1}
                >
                  <View style={styles.contactOptionContent}>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: "#000000" }]}>
                        Phone
                      </Text>
                      <Text
                        style={[
                          styles.contactNumber,
                          {
                            color: facility.phone
                              ? theme.colors.onSurfaceVariant
                              : theme.colors.outline,
                          },
                        ]}
                      >
                        {facility.phone || "Not available"}
                      </Text>
                    </View>
                    <IconButton
                      icon="phone"
                      mode="contained"
                      containerColor={
                        facility.phone
                          ? theme.colors.primary
                          : theme.colors.surfaceVariant
                      }
                      iconColor={
                        facility.phone
                          ? theme.colors.onPrimary
                          : theme.colors.outline
                      }
                      size={24}
                      disabled={!facility.phone}
                      onPress={() =>
                        facility.phone &&
                        Linking.openURL(`tel:${facility.phone}`)
                      }
                    />
                  </View>
                </Surface>
              )}
            </View>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />

          {/* Grouped Services */}
          <View style={styles.servicesSection}>
            <View style={styles.servicesHeaderRow}>
              <Text
                style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
              >
                Services
              </Text>
            </View>

            {hasServiceGroups ? (
              Object.entries(groupedServices).map(([category, services]) => {
                const isExpanded = expandedCategories[category];
                const visibleServices = isExpanded
                  ? services
                  : services.slice(0, 6);
                const hasMore = services.length > 6;

                return (
                  <View key={category} style={styles.categoryContainer}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                    <View style={chipLayoutStyles.chipContainer}>
                      {visibleServices.map((service, index) => (
                        <FeatureChip
                          key={`${category}-${index}`}
                          label={service}
                        />
                      ))}
                    </View>
                    {hasMore && (
                      <TouchableOpacity
                        onPress={() =>
                          setExpandedCategories((prev) => ({
                            ...prev,
                            [category]: !prev[category],
                          }))
                        }
                        style={styles.seeAllButton}
                      >
                        <Text
                          style={[
                            styles.seeAllText,
                            { color: theme.colors.primary },
                          ]}
                        >
                          {isExpanded
                            ? "Show Less"
                            : `See All (${services.length})`}
                        </Text>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16 * scaleFactor}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            ) : (
              <Text
                style={[
                  styles.servicesHint,
                  { color: theme.colors.onSurfaceVariant, fontWeight: "500" },
                ]}
              >
                Services information is not available.
              </Text>
            )}
          </View>

          {facility.lastUpdated && (
            <View style={styles.verificationContainer}>
              <Text
                style={[
                  styles.verificationText,
                  { color: theme.colors.outline },
                ]}
              >
                Data verified as of{" "}
                {new Date(facility.lastUpdated).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    marginBottom: 20,
    fontSize: 16,
  },
  container: {
    flex: 1,
  },
  headerShareButton: {
    padding: 8,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  headerImage: {
    width: width,
    height: IMAGE_HEIGHT,
  },
  galleryIndicator: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  galleryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600" as const,
    marginLeft: 6,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerSection: {
    marginBottom: 24,
  },
  facilityName: {
    fontSize: 24,
    fontWeight: "bold" as const,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  metaItem: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#64748B",
  },
  metaSeparator: {
    marginHorizontal: 6,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  actionButtons: {
    marginBottom: 24,
  },
  divider: {
    height: 1,
    marginBottom: 24,
  },
  infoSection: {
    marginBottom: 32,
  },
  infoTextContainer: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    fontWeight: "700" as const,
  },
  infoText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  linkText: {
    fontWeight: "500" as const,
  },
  servicesSection: {
    marginBottom: 0,
  },
  servicesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  servicesToggleButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  servicesToggleText: {
    fontWeight: "600" as const,
    marginRight: 4,
  },
  servicesHint: {
    fontSize: 14,
    fontWeight: "600" as const,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    marginBottom: 16,
  },
  categoryContainer: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "800" as const,
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#164032",
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "600" as const,
    marginRight: 4,
  },
  verificationContainer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
  },
  verificationText: {
    fontSize: 12,
    fontStyle: "italic",
    letterSpacing: 0.2,
  },
  contactOptionSurface: {
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 0.5,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
  },
  contactOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: "bold" as const,
  },
  contactNumber: {
    fontSize: 13,
    marginTop: 2,
  },
});

export default FacilityDetailsScreen;