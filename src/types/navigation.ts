import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import { StackScreenProps } from '@react-navigation/stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { AssessmentData } from './triage';

// Define the parameters for each screen in the stack navigators
export type CheckStackParamList = {
  CheckSymptom: undefined;
};

export type FacilitiesStackParamList = {
  FacilityDirectory: { filter?: 'yakap' };
};

export type YakapStackParamList = {
  YakapHome: undefined;
};

// Define the parameters for the main tab navigator
export type MainTabParamList = {
  HomeFeed: undefined;
  HealthHub: undefined;
  Settings: undefined;
};

// Define the parameters for the root stack
export type RootStackParamList = {
  Home: NavigatorScreenParams<MainTabParamList>;
  Check: NavigatorScreenParams<CheckStackParamList>;
  Find: NavigatorScreenParams<FacilitiesStackParamList>;
  YAKAP: NavigatorScreenParams<YakapStackParamList>;
  SymptomAssessment: { initialSymptom?: string };
  Recommendation: {
    assessmentData: AssessmentData;
    isRecentResolved?: boolean;
    resolvedKeyword?: string;
    guestMode?: boolean;
  };
  ClinicalNote: { recordId?: string };
  ClinicalHistory: undefined;
  HealthProfileEdit: undefined;
  FacilityDetails: { facilityId: string };
  CrisisSupport: undefined;
  YakapFaq: undefined;
  YakapGuidePaths: undefined;
  YakapGuideSteps: { pathwayId: string };
  NotFound: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  MedicationTracker: undefined;
};

// Define the props for each screen in the navigators
export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<
  RootStackParamList,
  T
>;

// Props for screens within the nested stack navigators
export type CheckStackScreenProps<T extends keyof CheckStackParamList> = CompositeScreenProps<
  StackScreenProps<CheckStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type FacilitiesStackScreenProps<T extends keyof FacilitiesStackParamList> =
  CompositeScreenProps<
    StackScreenProps<FacilitiesStackParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

export type YakapStackScreenProps<T extends keyof YakapStackParamList> = CompositeScreenProps<
  StackScreenProps<YakapStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;
