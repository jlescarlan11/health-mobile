import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { View, StyleSheet, ScrollView, Alert, BackHandler } from "react-native";
import {
  useTheme,
  Surface,
  Divider,
  ActivityIndicator,
  TextInput,
  Snackbar,
  MD3Theme,
} from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useRoute,
  useNavigation,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import { router } from "expo-router";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { RootStackParamList, RootStackScreenProps } from "../types/navigation";
import {
  setHighRisk,
  setRecommendation as setReduxRecommendation,
  clearAssessmentState,
} from "../store/navigationSlice";
import { saveClinicalNote } from "../store/offlineSlice";
import { geminiClient } from "../api/geminiClient";
import {
  detectEmergency,
  COMBINATION_RISKS,
} from "../services/emergencyDetector";
import type { EmergencyDetectionResult } from "../services/emergencyDetector";
import { FacilityCard } from "../components/common/FacilityCard";
import { FacilityCardSkeleton } from "../components/features/facilities/FacilityCardSkeleton";
import {
  Button,
  SafetyRecheckModal,
  Text,
  ScreenSafeArea,
} from "../components/common";
import { Facility, AssessmentResponse } from "../types";
import { useUserLocation } from "../hooks";
import { fetchFacilities } from "../store/facilitiesSlice";
import { StandardHeader } from "../components/common/StandardHeader";
import {
  calculateDistance,
  scoreFacility,
  getFacilityServiceMatches,
} from "../utils";
import {
  DATE_PLACEHOLDER,
  formatDateOfBirthInput,
  validateIsoDateValue,
} from "../utils/dobUtils";
import {
  AssessmentProfile,
  TriageLevel,
  TriageAdjustmentRule,
  TriageLogic,
} from "../types/triage";
import { formatEmpatheticResponse } from "../utils/empatheticResponses";

import { TriageStatusCard } from "../components/features/triage/TriageStatusCard";
import { OFFLINE_SELF_CARE_THRESHOLD } from "../constants/clinical";
import { theme as appTheme } from "../theme";

type ScreenProps = RootStackScreenProps<"Recommendation">;

const TRIAGE_RULE_LABELS: Record<TriageAdjustmentRule, string> = {
  RED_FLAG_UPGRADE: "Red flag escalation",
  READINESS_UPGRADE: "Readiness/ambiguity upgrade",
  RECENT_RESOLVED_FLOOR: "Recently resolved safety floor",
  AUTHORITY_DOWNGRADE: "Authority downgrade",
  SYSTEM_BASED_LOCK_CARDIAC: "Cardiac system lock",
  SYSTEM_BASED_LOCK_RESPIRATORY: "Respiratory system lock",
  SYSTEM_BASED_LOCK_NEUROLOGICAL: "Neurological system lock",
  SYSTEM_BASED_LOCK_TRAUMA: "Trauma system lock",
  SYSTEM_BASED_LOCK_ABDOMEN: "Abdominal system lock",
  CONSENSUS_CHECK: "Consensus-based adjustment",
  AGE_ESCALATION: "Age-based escalation",
  MENTAL_HEALTH_OVERRIDE: "Mental health override",
  OFFLINE_FALLBACK: "Offline fallback",
  MANUAL_OVERRIDE: "Manual override",
};

const humanizeTriageRule = (rule: TriageAdjustmentRule) =>
  TRIAGE_RULE_LABELS[rule] || rule.replace(/_/g, " ").toLowerCase();

const isFallbackProfile = (profile?: AssessmentProfile) => {
  if (!profile || !profile.summary) return false;
  // If age/duration etc are all null and summary contains dialogue tags, it's a fallback
  const isDataEmpty =
    !profile.age &&
    !profile.duration &&
    !profile.severity &&
    !profile.progression;
  const hasDialogueTags =
    profile.summary.includes("USER:") || profile.summary.includes("ASSISTANT:");
  return isDataEmpty && hasDialogueTags;
};

const formatClinicalSummary = (profile?: AssessmentProfile) => {
  if (!profile) return "";

  if (isFallbackProfile(profile)) {
    return profile.summary; // Return raw history for direct analysis
  }

  const parts = [];
  if (profile.age) parts.push(`Age: ${profile.age}`);
  if (profile.duration) parts.push(`Duration: ${profile.duration}`);
  if (profile.severity) parts.push(`Severity: ${profile.severity}`);
  if (profile.progression) parts.push(`Progression: ${profile.progression}`);
  if (profile.red_flag_denials)
    parts.push(`Red Flag Status: ${profile.red_flag_denials}`);
  if (profile.summary) parts.push(`Summary: ${profile.summary}`);

  return parts.join(". ");
};

const mapCareLevelToTriageLevel = (
  level: AssessmentResponse["recommended_level"],
): TriageLevel => {
  if (level === "self_care") return "self-care";
  if (level === "health_center") return "health-center";
  return level;
};

const getNextActionForLevel = (
  level: AssessmentResponse["recommended_level"],
) => {
  switch (level) {
    case "emergency":
      return "Please go to the nearest Emergency Room immediately and share this assessment with the staff.";
    case "hospital":
      return "Call or visit a hospital for further evaluation within the next few hours.";
    case "health_center":
      return "Schedule a visit at your health center soon and bring this information with you.";
    case "self_care":
      return "Monitor yourself closely and reach out if any concerning changes occur.";
    default:
      return "Follow the recommended care level above and contact the appropriate service if things worsen.";
  }
};

const applyOpacity = (hex: string, alpha: number) => {
  const sanitized = hex.replace("#", "");
  const parsed = parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const MAX_SYMPTOM_SUMMARY_LENGTH = 120;

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

// Prefer ending summaries at a natural word break instead of cutting mid-word.
const truncateToWordBoundary = (value: string, limit: number) => {
  if (value.length <= limit) return value;
  const truncated = value.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  const safeSlice =
    lastSpace > Math.floor(limit / 2)
      ? truncated.slice(0, lastSpace)
      : truncated;
  return safeSlice.trim().replace(/[.,;:!?]+$/, "");
};

const appendEllipsisIfNeeded = (text: string, wasTruncated: boolean) => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!wasTruncated) return trimmed;
  const withoutPunctuation = trimmed.replace(/[.,;:!?]+$/, "").trim();
  return withoutPunctuation ? `${withoutPunctuation}...` : "...";
};

const normalizeCacheSegment = (value: string) =>
  collapseWhitespace(value).toLowerCase().trim();

const buildStableCaseKey = (
  initialSymptom?: string,
  profileSummary?: string,
  resolvedTag?: string,
) => {
  return [initialSymptom, profileSummary, resolvedTag]
    .map((segment) => (segment ? normalizeCacheSegment(segment) : ""))
    .filter(Boolean)
    .join("|");
};

// Create a short, human-readable view of the initial report for safety UI.
const summarizeInitialSymptom = (symptom?: string) => {
  const normalized = collapseWhitespace(symptom ?? "");
  if (!normalized) return "";
  if (normalized.length <= MAX_SYMPTOM_SUMMARY_LENGTH) {
    return normalized;
  }

  const sentences =
    normalized
      .match(/[^.!?]+[.!?]*/g)
      ?.map((segment) => segment.trim())
      .filter(Boolean) || [];
  const candidate = sentences.length
    ? sentences[0].length <= MAX_SYMPTOM_SUMMARY_LENGTH
      ? sentences[0]
      : truncateToWordBoundary(sentences[0], MAX_SYMPTOM_SUMMARY_LENGTH)
    : truncateToWordBoundary(normalized, MAX_SYMPTOM_SUMMARY_LENGTH);

  const wasTruncated = normalized.length > candidate.length;
  return appendEllipsisIfNeeded(candidate, wasTruncated);
};

const LOCAL_EMERGENCY_RULE: TriageAdjustmentRule = "RED_FLAG_UPGRADE";

const buildLocalEmergencyAssessment = (
  detection: EmergencyDetectionResult,
): AssessmentResponse => {
  const matchedKeywords = detection.matchedKeywords || [];
  const affectedSystems = detection.affectedSystems || [];
  const systemsLabel =
    affectedSystems.length > 0 ? affectedSystems.join(", ") : "specified systems";

  let advice =
    "CRITICAL: Potential life-threatening condition detected based on your symptoms. Go to the nearest emergency room or call emergency services immediately.";

  if (affectedSystems.includes("Trauma")) {
    advice =
      "CRITICAL: Severe injury detected. Please go to the nearest emergency room immediately for urgent trauma care.";
  } else if (
    affectedSystems.includes("Cardiac") ||
    affectedSystems.includes("Respiratory")
  ) {
    advice =
      "CRITICAL: Potential life-threatening cardiovascular or respiratory distress detected. Seek emergency medical care immediately.";
  } else if (affectedSystems.includes("Neurological")) {
    advice =
      "CRITICAL: Potential neurological emergency detected. Please go to the nearest emergency room immediately.";
  }

  const matchedList = matchedKeywords.length
    ? matchedKeywords.join(", ")
    : "unspecified emergency keywords";
  const reason =
    detection.medical_justification ||
    `Emergency keywords detected: ${matchedList}. Systems: ${systemsLabel}.`;

  const triageLogic: TriageLogic = {
    original_level: "emergency",
    final_level: "emergency",
    adjustments: [
      {
        from: "emergency",
        to: "emergency",
        rule: LOCAL_EMERGENCY_RULE,
        reason,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const concernItems =
    matchedKeywords.length > 0
      ? matchedKeywords.map((k) => `Urgent: ${k}`)
      : ["Critical symptoms detected"];

  return {
    recommended_level: "emergency",
    follow_up_questions: [],
    user_advice: advice,
    clinical_soap: `S: Emergency keywords detected (${matchedList}). O: Local detector flagged ${systemsLabel}. A: Potential life-threatening condition. P: Immediate emergency referral.`,
    key_concerns: concernItems,
    critical_warnings: [
      "Immediate medical attention required",
      "Do not delay care",
    ],
    relevant_services: ["Emergency"],
    red_flags: matchedKeywords,
    triage_readiness_score: 1.0,
    medical_justification: reason,
    triage_logic: triageLogic,
  };
};

const RecommendationScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, "Recommendation">>();
  const navigation = useNavigation<ScreenProps["navigation"]>();
  const theme = useTheme() as MD3Theme & { spacing: Record<string, number> };
  const dispatch = useDispatch<AppDispatch>();
  const spacing = theme.spacing ?? appTheme.spacing;
  const recommendationBottomPadding = spacing.lg * 2;

  // Try to get location to improve sorting
  useUserLocation({ watch: false });

  const { assessmentData, guestMode = false } = route.params;
  const {
    facilities,
    isLoading: isFacilitiesLoading,
    userLocation,
  } = useSelector((state: RootState) => state.facilities);

  const [transferFullName, setTransferFullName] = useState("");
  const [transferDob, setTransferDob] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [dobTouched, setDobTouched] = useState(false);

  const transferDobIsValid = !validateIsoDateValue(transferDob);
  const canSubmitTransfer =
    transferFullName.trim().length > 0 && transferDobIsValid && !transferLoading;

  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] =
    useState<AssessmentResponse | null>(null);
  const [recommendedFacilities, setRecommendedFacilities] = useState<
    Facility[]
  >([]);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [narratives, setNarratives] = useState<{
    recommendationNarrative: string;
    handoverNarrative: string;
  } | null>(null);

  // Request versioning and deduplication refs
  const assessmentRunIdRef = useRef(0);
  const isAnalysisInProgressRef = useRef(false);
  const hasTriggeredInitialAnalysisRef = useRef(false);

  const level = recommendation
    ? mapCareLevelToTriageLevel(recommendation.recommended_level)
    : "self-care";
  const [showFacilities, setShowFacilities] = useState<boolean>(
    level !== "self-care",
  );
  const handleEmergencyAction = useCallback(
    () => setSafetyModalVisible(true),
    [setSafetyModalVisible],
  );

  const handleTransferAssessment = useCallback(async () => {
    const name = transferFullName.trim();
    if (!name) {
      setTransferError("Please provide the patient full name.");
      return;
    }

    const dobError = validateIsoDateValue(transferDob);
    if (dobError) {
      setTransferError(dobError);
      setDobTouched(true);
      return;
    }

    setTransferLoading(true);
    setTransferError(null);

    try {
      // Mock handover logic: Simulate a delay then show success
      // In the future, this will link with Health ID based on Full Name and DOB
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTransferFullName("");
      setTransferDob("");
      setDobTouched(false);

      const successMessage = `Result transferred for ${name} (mock)`;
      setSnackbarMessage(successMessage);
      setSnackbarVisible(true);
    } catch (error) {
      console.error("Transfer failure:", error);
      setTransferError("Unable to transfer the assessment. Please try again.");
    } finally {
      setTransferLoading(false);
    }
  }, [transferFullName, transferDob]);

  const initialSymptomSummary = useMemo(
    () => summarizeInitialSymptom(assessmentData.symptoms),
    [assessmentData.symptoms],
  );

  const answersLog = useMemo(() => {
    const lines = assessmentData.answers
      .map((entry) => `${entry.question}: ${entry.answer}`)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length ? lines.join("\n") : "No answers recorded.";
  }, [assessmentData.answers]);

  const selectedOptionsSummary = useMemo(() => {
    const options = assessmentData.answers
      .map((entry) => entry.answer?.trim())
      .filter((value): value is string => Boolean(value));
    const unique = Array.from(new Set(options));
    return unique.length ? unique.join("; ") : "No selected options recorded.";
  }, [assessmentData.answers]);

  // Refs for stabilizing analyzeSymptoms dependencies
  const symptomsRef = useRef(assessmentData.symptoms);
  const answersRef = useRef(assessmentData.answers);
  const profileRef = useRef(assessmentData.extractedProfile);

  // Update refs when data changes
  useEffect(() => {
    symptomsRef.current = assessmentData.symptoms;
    answersRef.current = assessmentData.answers;
    profileRef.current = assessmentData.extractedProfile;
  }, [assessmentData]);

  const handleBack = useCallback(() => {
    Alert.alert(
      "Exit Recommendation",
      "Are you sure you want to exit? You will be returned to the Check Symptom start screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          onPress: () => router.replace("/Check/CheckSymptom"),
          style: "destructive",
        },
      ],
    );
    return true; // Prevent default behavior
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return handleBack();
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, [handleBack]),
  );

  useEffect(() => {
    // Clear assessment state when reaching this screen to ensure "Ongoing Assessment" is removed
    dispatch(clearAssessmentState());
    setShowFacilities(level !== "self-care");
  }, [level, dispatch]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <StandardHeader
          title="Recommendation"
          showBackButton
          onBackPress={handleBack}
        />
      ),
    });
  }, [navigation, handleBack]);

  // Ensure all facilities have distances calculated once
  const facilitiesWithDistance = useMemo(() => {
    if (!userLocation) return facilities;

    return facilities.map((f) => ({
      ...f,
      distance:
        f.distance ??
        calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          f.latitude,
          f.longitude,
        ),
    }));
  }, [facilities, userLocation]);

  // Memoize nearest distances calculation
  const nearestDistances = useMemo(() => {
    let nearestHealthCenterDist = Infinity;
    let nearestHospitalDist = Infinity;

    facilitiesWithDistance.forEach((f) => {
      const type = f.type?.toLowerCase() || "";
      const dist = f.distance ?? Infinity;

      if (dist === Infinity) return;

      if (
        type.includes("health") ||
        type.includes("unit") ||
        type.includes("center")
      ) {
        if (dist < nearestHealthCenterDist) nearestHealthCenterDist = dist;
      }

      if (
        type.includes("hospital") ||
        type.includes("infirmary") ||
        type.includes("emergency")
      ) {
        if (dist < nearestHospitalDist) nearestHospitalDist = dist;
      }
    });

    return { nearestHealthCenterDist, nearestHospitalDist };
  }, [facilitiesWithDistance]);

  const analyzeSymptoms = useCallback(async () => {
    // Increment run ID and capture it for this execution
    const currentRunId = ++assessmentRunIdRef.current;

    // Prevent concurrent runs
    if (isAnalysisInProgressRef.current) {
      console.log(`[Recommendation] Analysis already in progress. Ignoring run ${currentRunId}.`);
      return;
    }

    try {
      setLoading(true);
      isAnalysisInProgressRef.current = true;
      console.log(`[Recommendation] Starting assessment run ${currentRunId}.`);

      const hcDistStr =
        nearestDistances.nearestHealthCenterDist !== Infinity
          ? `${nearestDistances.nearestHealthCenterDist.toFixed(1)}km`
          : "Unknown";
      const hospDistStr =
        nearestDistances.nearestHospitalDist !== Infinity
          ? `${nearestDistances.nearestHospitalDist.toFixed(1)}km`
          : "Unknown";
      const distanceContext = `Nearest Health Center: ${hcDistStr}, Nearest Hospital: ${hospDistStr}`;

      const profile = profileRef.current;
      const isFallback = isFallbackProfile(profile);
      const profileSummary = formatClinicalSummary(profile);

      // Add Recent Resolved tag if applicable
      const resolvedTag = profile?.is_recent_resolved
        ? `[RECENT_RESOLVED: ${profile.resolved_keyword || "Unknown symptom"}]`
        : "";

      // Extract user answers once for reuse
      const userAnswersOnly = answersRef.current
        .map((a) => a.answer)
        .filter(
          (a) =>
            a &&
            !["denied", "none", "wala", "hindi", "not answered"].includes(
              a.toLowerCase(),
            ),
        )
        .join(". ");

      // Clinical Context for LLM - Optimized to use summary as primary source
      const triageContextParts = [
        resolvedTag,
        `Initial Symptom: ${symptomsRef.current}.`,
        `Clinical Profile Summary: ${profileSummary}.`,
        `\nContext: ${distanceContext}`,
      ].filter(Boolean);

      // Only include full answers if profile is missing, fallback, or readiness is low
      if (
        !profile ||
        isFallback ||
        (profile?.triage_readiness_score !== undefined &&
          profile.triage_readiness_score < 0.7)
      ) {
        triageContextParts.push(
          `\nRaw History for analysis: ${JSON.stringify(answersRef.current)}`,
        );
      }

      const triageContext = triageContextParts.join("\n");

      // **Safety Context for local scan (User-only content)**
      const safetyContext = `Initial Symptom: ${symptomsRef.current}. Answers: ${userAnswersOnly}.`;

      const emergencyCheck = detectEmergency(safetyContext, {
        isUserInput: true,
        profile,
      });

      if (emergencyCheck.isEmergency && !profile?.is_recent_resolved) {
        console.warn(
          `[Recommendation] Local emergency detected for run ${currentRunId}. Bypassing backend analysis.`,
        );
        const emergencyResponse = buildLocalEmergencyAssessment(emergencyCheck);
        setRecommendation(emergencyResponse);
        setNarratives(null);
        dispatch(
          setReduxRecommendation({
            level: emergencyResponse.recommended_level,
            user_advice: emergencyResponse.user_advice,
            clinical_soap: emergencyResponse.clinical_soap,
            isFallbackApplied: true,
            clinicalFrictionDetails: emergencyResponse.clinical_friction_details,
            medical_justification: emergencyResponse.medical_justification,
          }),
        );
        dispatch(setHighRisk(true));
        isAnalysisInProgressRef.current = false;
        setLoading(false);
        return;
      }

      const caseCacheKey = buildStableCaseKey(
        symptomsRef.current,
        profileSummary,
        resolvedTag,
      );

      const response = await geminiClient.assessSymptoms(
        triageContext,
        [],
        safetyContext,
        profile,
        caseCacheKey,
      );

      // Versioning check: ignore if a newer run has started
      if (currentRunId !== assessmentRunIdRef.current) {
        console.warn(`[Recommendation] Run ${currentRunId} superseded by ${assessmentRunIdRef.current}. Aborting commit.`);
        return;
      }

      // STABLE UI: Fetch narrative BEFORE committing state and stopping loading
      console.log(`[Recommendation] Run ${currentRunId} fetching polished narrative...`);
      let narrative = null;
      try {
        narrative = await geminiClient.generateRecommendationNarratives({
          initialSymptom: symptomsRef.current,
          profileSummary,
          answers: answersLog,
          selectedOptions: selectedOptionsSummary,
          recommendedLevel: response.recommended_level,
          keyConcerns: response.key_concerns ?? [],
          relevantServices: response.relevant_services,
          redFlags: response.red_flags,
          clinicalSoap: response.clinical_soap,
        });
      } catch (narrativeErr) {
        console.error(`[Recommendation] Narrative generation failed for run ${currentRunId}:`, narrativeErr);
      }

      // Double check versioning after narrative call
      if (currentRunId !== assessmentRunIdRef.current) {
        console.warn(`[Recommendation] Run ${currentRunId} superseded by ${assessmentRunIdRef.current} after narrative. Aborting commit.`);
        return;
      }

      setRecommendation(response);
      setNarratives(narrative);

      // Save to Redux for persistence and offline access
      dispatch(
        setReduxRecommendation({
          level: response.recommended_level,
          user_advice: response.user_advice,
          clinical_soap: response.clinical_soap,
          isFallbackApplied: response.is_conservative_fallback,
          clinicalFrictionDetails: response.clinical_friction_details,
          medical_justification: response.medical_justification,
        }),
      );

      // Save clinical note (persistence logic handled in the thunk based on isGuest)
      if (response.clinical_soap) {
        dispatch(
          saveClinicalNote({
            clinical_soap: response.clinical_soap,
            recommended_level: response.recommended_level,
            medical_justification: response.medical_justification,
            initial_symptoms: symptomsRef.current,
            isGuest: guestMode,
          }),
        );
      }

      // SECURITY GUARD: Only set high-risk status for personal assessments.
      if (!guestMode && response.recommended_level === "emergency") {
        dispatch(setHighRisk(true));
      }
    } catch (error) {
      // Versioning check in catch block too
      if (currentRunId !== assessmentRunIdRef.current) return;

      console.error(`[Recommendation] Analysis Error for run ${currentRunId}:`, error);

      // Context-aware Fallback using local emergencyDetector
      const userAnswersOnly = answersRef.current
        .map((a) => a.answer)
        .filter(
          (a) =>
            a &&
            !["denied", "none", "wala", "hindi", "not answered"].includes(
              a.toLowerCase(),
            ),
        )
        .join(". ");

      const localAnalysisContext = `Initial Symptom: ${symptomsRef.current}. Answers: ${userAnswersOnly}.`;
      const localResult = detectEmergency(localAnalysisContext, {
        isUserInput: true,
        profile: profileRef.current,
      });

      // Strengthened Fallback: Check for specific high-risk combinations
      let specificRiskMatch = null;
      for (const risk of COMBINATION_RISKS) {
        if (
          risk.symptoms.every((s) => localResult.matchedKeywords.includes(s))
        ) {
          specificRiskMatch = risk;
          break;
        }
      }

      const isHighRiskFallback = localResult.score >= 5 || !!specificRiskMatch;

      // Safety Guards for Self-Care eligibility
      const profile = profileRef.current;
      const isVulnerable = profile?.is_vulnerable === true;
      const hasMatchedKeywords = localResult.matchedKeywords.length > 0;

      // Determine fallback level based on score and safety constraints
      let fallbackLevel: TriageLevel;

      if (specificRiskMatch) {
        fallbackLevel = "emergency";
      } else if (isHighRiskFallback) {
        fallbackLevel = "hospital";
      } else if (
        localResult.score !== null &&
        localResult.score <= OFFLINE_SELF_CARE_THRESHOLD &&
        !isVulnerable &&
        !hasMatchedKeywords
      ) {
        // Only allow self-care if score is low, not vulnerable, and NO keywords matched at all
        fallbackLevel = "self-care";
      } else {
        // Default to health center for ambiguous or mild cases that don't meet strict self-care criteria
        fallbackLevel = "health-center";
      }

      let fallbackAdvice = "";

      if (specificRiskMatch) {
        fallbackAdvice = `CRITICAL: ${specificRiskMatch.reason} suspected based on symptoms (${specificRiskMatch.symptoms.join(" + ")}). Proceed to the nearest hospital emergency room immediately. (Note: Fallback care level determined by local safety analysis).`;
      } else if (isHighRiskFallback) {
        fallbackAdvice =
          "Based on the complexity or potential severity of your symptoms, we recommend a medical check-up at a Hospital. While no immediate life-threatening signs were definitively confirmed, professional diagnostics are advised. (Note: Fallback care level determined by local safety analysis).";
      } else if (fallbackLevel === "self-care") {
        fallbackAdvice =
          "Based on your reported symptoms and current offline status, your condition appears manageable at home. Please monitor for any worsening signs and consult a doctor if symptoms persist. (Note: Fallback care level determined by local safety analysis).";
      } else {
        fallbackAdvice =
          "Based on your reported symptoms, we suggest a professional evaluation at your local Health Center. This is the appropriate next step for non-emergency medical consultation and routine screening. (Note: Fallback care level determined by local safety analysis).";
      }

      const normalizedFallbackLevel = fallbackLevel.replace(
        /-/g,
        "_",
      ) as AssessmentResponse["recommended_level"];

      const fallbackResponse: AssessmentResponse = {
        recommended_level: normalizedFallbackLevel,
        user_advice: fallbackAdvice,
        clinical_soap: `S: ${localAnalysisContext}. O: N/A. A: Fallback triage (Score: ${localResult.score}).${specificRiskMatch ? ` Risk: ${specificRiskMatch.reason}` : ""} P: Refer to ${fallbackLevel === "emergency" ? "Emergency Room" : fallbackLevel === "hospital" ? "Hospital" : fallbackLevel === "health-center" ? "Health Center" : "Home Management"}.`,
        key_concerns: [
          "Need for professional evaluation",
          ...localResult.matchedKeywords.map((k) => `Monitored: ${k}`),
        ],
        critical_warnings: [
          "Go to the Emergency Room IMMEDIATELY if you develop a stiff neck, confusion, or difficulty breathing.",
        ],
        relevant_services:
          fallbackLevel === "emergency"
            ? ["Emergency", "Laboratory"]
            : isHighRiskFallback
              ? ["Laboratory", "Consultation"]
              : ["Consultation"],
        red_flags: localResult.matchedKeywords,
        follow_up_questions: [],
        triage_readiness_score: 0.5,
        is_conservative_fallback: true,
        triage_logic: {
          original_level: normalizedFallbackLevel,
          final_level: normalizedFallbackLevel,
          adjustments: [
            {
              from: normalizedFallbackLevel,
              to: normalizedFallbackLevel,
              rule: "OFFLINE_FALLBACK",
              reason:
                specificRiskMatch?.reason ||
                "Offline emergency detector determined fallback level.",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };

      setRecommendation(fallbackResponse);
      setNarratives(null); // Clear narratives for fallback to use fallback advice

      // Save fallback to Redux
      dispatch(
        setReduxRecommendation({
          level: fallbackResponse.recommended_level,
          user_advice: fallbackResponse.user_advice,
          clinical_soap: fallbackResponse.clinical_soap,
          isFallbackApplied: fallbackResponse.is_conservative_fallback,
        }),
      );
    } finally {
      // Versioning check before ending loading
      if (currentRunId === assessmentRunIdRef.current) {
        setLoading(false);
        isAnalysisInProgressRef.current = false;
        console.log(`[Recommendation] Run ${currentRunId} finished.`);
      }
    }
  }, [nearestDistances, dispatch, guestMode, answersLog, selectedOptionsSummary]);

  useEffect(() => {
    // Load facilities if they aren't in the store
    if (facilities.length === 0) {
      dispatch(fetchFacilities());
    }
  }, [dispatch, facilities.length]);

  useEffect(() => {
    // Start analysis once facilities are loaded (or if they were already available)
    if (!hasTriggeredInitialAnalysisRef.current && (!isFacilitiesLoading || facilities.length > 0)) {
      hasTriggeredInitialAnalysisRef.current = true;
      analyzeSymptoms();
    }
  }, [
    facilities.length,
    isFacilitiesLoading,
    analyzeSymptoms,
  ]);

  // Removed separate narratives effect as it is now integrated into analyzeSymptoms

  const filterFacilities = useCallback(() => {
    if (!recommendation) return;

    const targetLevel = recommendation.recommended_level;
    const requiredServices = recommendation.relevant_services || [];

    const scored = facilitiesWithDistance.map((facility) => ({
      facility,
      score: scoreFacility(facility, targetLevel, requiredServices),
    }));

    // Sort all facilities by the combined score formula
    scored.sort((a, b) => b.score - a.score);

    // Take the top 3 recommendations
    setRecommendedFacilities(scored.slice(0, 3).map((s) => s.facility));
  }, [recommendation, facilitiesWithDistance]);

  useEffect(() => {
    if (
      recommendation &&
      (facilitiesWithDistance.length > 0 || !isFacilitiesLoading)
    ) {
      filterFacilities();
    }
  }, [
    recommendation,
    facilitiesWithDistance,
    isFacilitiesLoading,
    filterFacilities,
  ]);

  const handleViewDetails = (facilityId: string) => {
    router.push({ pathname: "/FacilityDetails", params: { facilityId } });
  };

  const getCareLevelInfo = useCallback(
    (level: string) => {
      // Normalize level string to handle both hyphenated and underscored versions
      const normalizedLevel = level.toLowerCase().replace("-", "_");

      switch (normalizedLevel) {
        case "emergency":
          return {
            label: "EMERGENCY (LIFE-THREATENING)",
            color: theme.colors.error,
            icon: "alert-decagram",
            bgColor: theme.colors.errorContainer,
            borderColor: theme.colors.error,
          };
        case "hospital":
          return {
            label: "HOSPITAL (SPECIALIZED CARE)",
            color: theme.colors.secondary,
            icon: "hospital-building",
            bgColor: theme.colors.secondaryContainer,
            borderColor: theme.colors.secondary,
          };
        case "health_center":
          return {
            label: "HEALTH CENTER (PRIMARY CARE)",
            color: theme.colors.primary,
            icon: "hospital-marker",
            bgColor: theme.colors.primaryContainer,
            borderColor: theme.colors.primary,
          };
        case "self_care":
          return {
            label: "SELF CARE (HOME)",
            color: theme.colors.primary,
            icon: "home-heart",
            bgColor: theme.colors.secondaryContainer,
            borderColor: theme.colors.primary,
          };
        default:
          return {
            label: level.toUpperCase().replace("_", " "),
            color: theme.colors.primary,
            icon: "hospital-building",
            bgColor: theme.colors.primaryContainer,
            borderColor: theme.colors.primary,
          };
      }
    },
    [theme],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Analyzing symptoms...</Text>
      </View>
    );
  }

  if (!recommendation) return null;

  const isEmergency = recommendation.recommended_level === "emergency";
  const triageLevel = mapCareLevelToTriageLevel(
    recommendation.recommended_level,
  );
  const careInfo = getCareLevelInfo(recommendation.recommended_level);
  const recommendationNarrative =
    narratives?.recommendationNarrative ?? recommendation.user_advice ?? "";
  const cardIntro = recommendationNarrative.trim() || undefined;

  const guardAdjustments = recommendation.triage_logic?.adjustments ?? [];

  const reasonForAdvice = (() => {
    if (isEmergency && recommendation.medical_justification) {
      return recommendation.medical_justification.replace(
        /^Potential concerns: /i,
        "",
      );
    }

    if (guardAdjustments.length > 0) {
      return guardAdjustments
        .map(
          (adjustment) =>
            `${humanizeTriageRule(adjustment.rule)}: ${adjustment.reason}`,
        )
        .join(" | ");
    }

    return "";
  })();

  const reasonSource =
    isEmergency && recommendation.medical_justification
      ? "medical-justification"
      : guardAdjustments.length > 0
        ? "triage-logic"
        : undefined;

  const empatheticAdvice = formatEmpatheticResponse({
    body: recommendationNarrative,
    reason: reasonForAdvice,
    reasonSource,
    nextAction: getNextActionForLevel(recommendation.recommended_level),
    tone: "neutral",
  }).text;

  const handoverNarrativeText =
    narratives?.handoverNarrative ||
    recommendation.medical_justification ||
    "Share this clinical note with the facility team for a smooth handover.";

  const instructionWithGuardrail = empatheticAdvice;

  const outlinedButtonBorderRadius = Math.min(
    Math.max(theme.roundness ?? 10, 8),
    12,
  );
  const handoverBorderRadius =
    (theme as { borderRadius?: { medium?: number } }).borderRadius?.medium ??
    outlinedButtonBorderRadius;
  const handoverButtonStyle = [
    styles.handoverButton,
    {
      marginVertical: theme.spacing?.sm ?? 8,
      borderRadius: handoverBorderRadius,
      alignSelf: "stretch" as const,
    },
  ];
  const handoverButtonLabelText = "View Handover Report";
  const restartButtonStyle = [
    styles.restartButton,
    {
      marginVertical: theme.spacing?.sm ?? 8,
      borderRadius: handoverBorderRadius,
      alignSelf: "stretch" as const,
    },
  ];
  const selfCareToggleStyle = {
    marginTop: theme.spacing?.md ?? 12,
    marginBottom: theme.spacing?.md ?? 12,
  };

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["left", "right", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: recommendationBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusCardWrapper}>
          <TriageStatusCard
            level={triageLevel}
            intro={cardIntro}
            instruction={instructionWithGuardrail}
            onEmergencyAction={isEmergency ? handleEmergencyAction : undefined}
          />
        </View>

        {/* Key Observations Section - Neutral/Informational */}
        {recommendation.key_concerns &&
          recommendation.key_concerns.length > 0 && (
            <View style={styles.observationsSection}>
              <Divider style={styles.restartDivider} />
              <View style={styles.sectionHeaderRow}>
                <Text variant="titleLarge" style={styles.sectionTitle}>
                  Key Observation
                </Text>
              </View>
              <View style={styles.concernsList}>
                {recommendation.key_concerns.map((concern, idx) => (
                  <View key={`concern-${idx}`} style={styles.concernRow}>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={18}
                      color={theme.colors.primary}
                      style={{ marginTop: 2 }}
                    />
                    <Text variant="bodyMedium" style={styles.concernText}>
                      {concern}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        {guestMode && (
          <View style={styles.transferSection}>
            <Divider style={styles.restartDivider} />
            <Surface
              style={[
                styles.transferCard,
                { backgroundColor: applyOpacity(theme.colors.primary, 0.05) },
              ]}
              elevation={0}
            >
              <View style={styles.badgeRow}>
                <Surface
                  style={[
                    styles.handoverBadge,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text variant="labelSmall" style={styles.badgeText}>
                    GUEST HANDOVER
                  </Text>
                </Surface>
              </View>
              <View style={styles.handoverHeader}>
                <Text variant="titleLarge" style={styles.handoverTitle}>
                  Transfer to Patient Record
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.transferSubtitle}>
                Transfer this guest assessment to a patient record using their
                Full Name and Date of Birth.
              </Text>
              <TextInput
                mode="outlined"
                label="Full Name"
                placeholder="e.g., Juan Dela Cruz"
                value={transferFullName}
                onChangeText={(value) => {
                  setTransferFullName(value);
                  setTransferError(null);
                }}
                style={[
                  styles.transferInput,
                  { backgroundColor: theme.colors.surface },
                ]}
                dense
                autoCapitalize="words"
                disabled={transferLoading}
                outlineStyle={{ borderRadius: 8 }}
              />
              <TextInput
                mode="outlined"
                label="Date of Birth"
                placeholder={DATE_PLACEHOLDER}
                value={transferDob}
                onChangeText={(value) => {
                  setTransferDob(formatDateOfBirthInput(value));
                  setTransferError(null);
                }}
                onBlur={() => setDobTouched(true)}
                style={[
                  styles.transferInput,
                  { backgroundColor: theme.colors.surface },
                ]}
                dense
                keyboardType="number-pad"
                disabled={transferLoading}
                outlineStyle={{ borderRadius: 8 }}
                error={dobTouched && Boolean(validateIsoDateValue(transferDob))}
              />
              {transferError && (
                <Text
                  variant="bodySmall"
                  style={[
                    styles.transferMessage,
                    { color: theme.colors.error },
                  ]}
                >
                  {transferError}
                </Text>
              )}
              <Button
                title="Transfer Assessment"
                variant="primary"
                loading={transferLoading}
                onPress={handleTransferAssessment}
                disabled={!canSubmitTransfer}
                accessibilityHint="Transfer this assessment to the patient record"
                style={handoverButtonStyle}
              />
            </Surface>
          </View>
        )}

        {!!recommendation.clinical_soap && (
          <View style={styles.handoverSection}>
            <Divider style={styles.restartDivider} />
            <View style={styles.handoverHeader}>
              <Text variant="titleLarge" style={styles.handoverTitle}>
                For Healthcare Professionals
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.handoverSubtitle}>
              {handoverNarrativeText}
            </Text>
            <Button
              title={handoverButtonLabelText}
              onPress={() => router.push("/ClinicalNote")}
              variant="primary"
              style={handoverButtonStyle}
              accessibilityLabel="View clinical handover report"
              accessibilityHint="Opens detailed medical information for healthcare providers"
              accessibilityRole="button"
            />
          </View>
        )}

        {level === "self-care" && !showFacilities && (
          <Button
            title="Find Nearby Clinics (Optional)"
            variant="outline"
            onPress={() => setShowFacilities(true)}
            icon="map-marker-outline"
            accessibilityLabel="Find nearby clinics"
            accessibilityHint="Shows optional list of nearby healthcare facilities"
            style={selfCareToggleStyle}
          />
        )}

        {/* Facilities Section */}
        {showFacilities && (
          <View style={styles.facilitiesSection}>
            <Divider style={styles.restartDivider} />
            <View style={styles.sectionHeader}>
              <Text variant="titleLarge" style={styles.sectionHeading}>
                {isEmergency
                  ? "Nearest Emergency Care"
                  : "Recommended Facilities"}
              </Text>
              <Text variant="bodySmall" style={styles.sectionSubtitle}>
                Filtered for {careInfo.label.toLowerCase()} services
              </Text>
            </View>

            {recommendedFacilities.map((facility) => {
              const matchedServices = getFacilityServiceMatches(
                facility,
                recommendation.relevant_services || [],
              );

              return (
                <View key={facility.id} style={styles.facilityEntry}>
                  <FacilityCard
                    facility={facility}
                    showDistance={true}
                    distance={facility.distance}
                    onPress={() => handleViewDetails(facility.id)}
                    matchedServices={matchedServices}
                  />
                </View>
              );
            })}

            {recommendedFacilities.length === 0 && !isFacilitiesLoading && (
              <Surface style={styles.emptyState} elevation={0}>
                <MaterialCommunityIcons
                  name="map-marker-off"
                  size={48}
                  color={theme.colors.outline}
                />
                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginTop: 12,
                  }}
                >
                  No facilities found nearby.
                </Text>
                <Button
                  variant="text"
                  onPress={() => dispatch(fetchFacilities())}
                  title="Retry Loading"
                />
              </Surface>
            )}

            {isFacilitiesLoading && recommendedFacilities.length === 0 && (
              <View>
                {[1, 2].map((i) => (
                  <FacilityCardSkeleton key={i} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Restart Section */}
        <View style={styles.restartSection}>
          <Divider style={styles.restartDivider} />
          <Text
            variant="bodyMedium"
            style={[
              styles.restartText,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Need to check other symptoms?
          </Text>
          <Button
            title="Start New Assessment"
            onPress={() => {
              dispatch(clearAssessmentState());
              router.replace("/Check/CheckSymptom");
            }}
            variant="outline"
            style={restartButtonStyle}
          />
        </View>
      </ScrollView>

      <SafetyRecheckModal
        visible={safetyModalVisible}
        onDismiss={() => setSafetyModalVisible(false)}
        initialSymptomSummary={initialSymptomSummary}
      />
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
      >
        {snackbarMessage}
      </Snackbar>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 16, fontWeight: "500" },
  content: { padding: 16, paddingVertical: 12 },
  statusCardWrapper: {
    marginBottom: 24,
  },
  guardrailCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  guardrailTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },
  guardrailText: {
    fontWeight: "400",
    lineHeight: 18,
  },

  observationsSection: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: "800",
    fontSize: 22,
    color: "#333",
    letterSpacing: 0.5,
  },

  concernsList: { paddingLeft: 0, marginTop: 4 },
  concernRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  concernText: {
    flex: 1,
    color: "#45474B",
    lineHeight: 20,
    marginLeft: 10,
    fontWeight: "400",
  },

  facilitiesSection: { marginBottom: 24 },
  facilityEntry: {
    marginBottom: 4,
  },
  sectionHeader: { marginBottom: 16, marginTop: 8 },
  sectionHeading: { fontWeight: "800", fontSize: 22, color: "#333" },
  sectionSubtitle: { color: "#666", marginTop: 2, fontSize: 13 },

  handoverSection: {
    marginBottom: 24,
  },
  handoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 8,
  },
  handoverTitle: {
    fontWeight: "800",
    fontSize: 22,
    color: "#333",
  },
  handoverSubtitle: {
    color: "#666",
    marginBottom: 16,
    lineHeight: 18,
  },
  handoverButton: {},
  transferSection: {
    marginBottom: 24,
    paddingHorizontal: 2,
  },
  transferSubtitle: {
    color: "#666",
    marginBottom: 12,
    lineHeight: 18,
  },
  transferInput: {
    marginBottom: 8,
    borderRadius: 10,
  },
  transferMessage: {
    marginBottom: 8,
    fontWeight: "500",
  },
  transferCard: {
    padding: 16,
    borderRadius: 16,
    elevation: 0,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(55, 151, 119, 0.15)", // primary with low opacity
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  handoverBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 10,
  },

  emptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "transparent",
  },

  restartSection: {
    alignItems: "center",
  },
  restartDivider: {
    width: "100%",
    marginBottom: 24,
  },
  restartText: {
    marginBottom: 16,
    marginTop: 8,
    fontWeight: "600",
  },
  restartButton: {},
});

export default RecommendationScreen;
