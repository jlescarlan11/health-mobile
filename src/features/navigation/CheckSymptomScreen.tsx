import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ScrollView,
  Pressable,
  Animated,
  Keyboard,
  KeyboardEvent,
} from 'react-native';
import { useTheme, Card } from 'react-native-paper';
import { Text } from '../../components/common/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { CheckStackScreenProps } from '../../types/navigation';
import { RootState } from '../../store';
import {
  InputCard,
  EmergencyActions,
  FeatureChip,
  ScreenSafeArea,
  SignInRequired,
  LoadingScreen,
} from '../../components/common';
import { chipLayoutStyles } from '../../components/common/chipLayout';
import { detectEmergency } from '../../services/emergencyDetector';
import { detectMentalHealthCrisis } from '../../services/mentalHealthDetector';
import { setHighRisk, clearAssessmentState, setSymptomDraft } from '../../store/navigationSlice';
import { useKeyboard, useAuthStatus } from '../../hooks';

type NavigationProp = CheckStackScreenProps<'CheckSymptom'>['navigation'];

const QUICK_SYMPTOMS = ['Fever', 'Cough', 'Headache', 'Stomach Pain', 'Prenatal Care', 'Injury'];

const CheckSymptomContent = () => {
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch();
  const savedDraft = useSelector((state: RootState) => state.navigation.symptomDraft);
  const assessmentState = useSelector((state: RootState) => state.navigation.assessmentState);
  const theme = useTheme();

  const { isKeyboardVisible } = useKeyboard();

  const [symptom, setSymptom] = useState(savedDraft || '');
  const [isProcessing, setIsProcessing] = useState(false);

  const keyboardHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = (e: KeyboardEvent) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };

    const onKeyboardHide = (e: KeyboardEvent) => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };

    const showSubscription = Keyboard.addListener(showEvent, onKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, onKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardHeight]);

  // Persist draft to Redux
  useEffect(() => {
    dispatch(setSymptomDraft(symptom));
  }, [symptom, dispatch]);

  // Handle Assessment Redirection
  useEffect(() => {
    if (assessmentState && !isProcessing) {
      // If there is an ongoing assessment, we might want to redirect
    }
  }, [assessmentState, isProcessing]);

  const toggleSymptom = (currentSymptom: string) => {
    setSymptom((prev) => {
      // Normalize string: split by comma, trim whitespace, filter empty
      const symptoms = prev
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const index = symptoms.indexOf(currentSymptom);

      if (index > -1) {
        // Remove symptom
        symptoms.splice(index, 1);
      } else {
        // Add symptom
        symptoms.push(currentSymptom);
      }

      const newSymptom = symptoms.join(', ');
      if (newSymptom.length > 500) return prev; // Length check
      return newSymptom;
    });
  };

  const handleSubmit = () => {
    if (!symptom.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      // 1. Check for immediate Emergency
      const emergencyCheck = detectEmergency(symptom, {
        isUserInput: true,
        historyContext: `Initial report: ${symptom}`,
        questionId: 'initial_symptom',
      });
      if (emergencyCheck.isEmergency) {
        dispatch(setHighRisk(true));
        navigation.navigate('Recommendation', {
          assessmentData: {
            symptoms: symptom,
            affectedSystems: emergencyCheck.affectedSystems,
            answers: [],
            extractedProfile: {
              age: null,
              duration: null,
              severity: 'Critical',
              progression: 'Sudden',
              red_flag_denials: null,
              summary: `Immediate emergency detected: ${symptom}. Matched keywords: ${emergencyCheck.matchedKeywords.join(', ')}`,
              red_flags_resolved: false,
              triage_readiness_score: 1.0,
            },
          },
          guestMode: false,
        });
        return;
      }

      // 2. Check for mental health crisis
      const crisisCheck = detectMentalHealthCrisis(symptom);
      if (crisisCheck.isCrisis) {
        dispatch(setHighRisk(true));
        navigation.navigate('CrisisSupport');
        return;
      }

      dispatch(clearAssessmentState());
      navigation.navigate('SymptomAssessment', { initialSymptom: symptom });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainContent}>
          <View style={styles.emergencyLayoutContainer}>
            <Card
              mode="elevated"
              style={[
                styles.emergencyCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderWidth: 0.5,
                  borderColor: theme.colors.surface,
                  shadowColor: theme.colors.shadow,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 2,
                },
              ]}
            >
              <Card.Content style={styles.emergencyCardContent}>
                <View style={styles.emergencyTextContent}>
                  <Text
                    variant="titleLarge"
                    style={[styles.emergencyTitle, { color: theme.colors.error }]}
                  >
                    Emergency?
                  </Text>

                  <Text
                    variant="bodyMedium"
                    style={[styles.emergencySubtitle, { color: theme.colors.onSurfaceVariant }]}
                  >
                    Contact emergency services immediately if you need urgent care.
                  </Text>
                </View>

                <EmergencyActions
                  onCallInitiated={() => dispatch(setHighRisk(true))}
                  variant="light"
                />
              </Card.Content>
            </Card>
          </View>

          <View style={styles.heroSection}>
            <Text
              variant="headlineSmall"
              style={[styles.welcomeText, { color: theme.colors.onBackground }]}
            >
              How are you feeling today?
            </Text>

            <Text
              variant="bodyMedium"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Describe your symptoms and our AI will guide you to the right care.
            </Text>
          </View>

          {assessmentState && (
            <View>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Ongoing Assessment
              </Text>
              <Pressable
                onPress={() =>
                  navigation.navigate('SymptomAssessment', {
                    initialSymptom: assessmentState.initialSymptom,
                  })
                }
                style={({ pressed }) => [
                  styles.resumeBanner,
                  {
                    backgroundColor: theme.colors.surface,
                    opacity: pressed ? 0.95 : 1,
                  },
                ]}
              >
                <View style={styles.resumeContent}>
                  <View style={styles.resumeTextContainer}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                    >
                      {`Continue your assessment for: "${assessmentState.initialSymptom}"`}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={theme.colors.onSurface}
                  />
                </View>
              </Pressable>
            </View>
          )}

          <View style={styles.quickActions}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Common Symptoms
            </Text>

            <View style={chipLayoutStyles.chipContainer}>
              {QUICK_SYMPTOMS.map((s) => {
                const isSelected = symptom
                  .split(',')
                  .map((item) => item.trim())
                  .includes(s);

                return (
                  <FeatureChip
                    key={s}
                    label={s}
                    selected={isSelected}
                    onPress={() => toggleSymptom(s)}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <Animated.View
        style={[
          styles.anchoredInputContainer,
          {
            marginBottom: keyboardHeight,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: isKeyboardVisible ? 8 : 8,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <InputCard
          value={symptom}
          onChangeText={setSymptom}
          onSubmit={handleSubmit}
          label="Type your symptoms here"
          placeholder=""
          maxLength={500}
        />
      </Animated.View>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  mainContent: {},
  emergencyLayoutContainer: { marginBottom: 24 },
  emergencyCard: { borderRadius: 16, elevation: 0 },
  emergencyCardContent: { padding: 16 },
  emergencyTextContent: { marginBottom: 12 },
  emergencyTitle: { fontWeight: 'bold' },
  emergencySubtitle: { marginTop: 4 },
  heroSection: { marginBottom: 24 },
  welcomeText: { fontWeight: 'bold', textAlign: 'left' },
  subtitle: { marginTop: 8, lineHeight: 20 },
  resumeBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  resumeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resumeTextContainer: {
    flex: 1,
  },
  anchoredInputContainer: {
    width: '100%',
  },
  quickActions: { marginBottom: 24 },
  sectionTitle: { marginBottom: 12, fontWeight: '700', letterSpacing: 0.5, fontSize: 16 },
  gatingWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
});

const CheckSymptomScreen = () => {
  const { isSignedIn, isSessionLoaded } = useAuthStatus();
  const theme = useTheme();

  if (!isSessionLoaded) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <View style={styles.gatingWrapper}>
          <LoadingScreen />
        </View>
      </ScreenSafeArea>
    );
  }

  if (!isSignedIn) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <View style={styles.gatingWrapper}>
          <SignInRequired
            title="Sign in to check symptoms"
            description="Symptom guidance is tied to authenticated care. Sign in or create an account to continue."
          />
        </View>
      </ScreenSafeArea>
    );
  }

  return <CheckSymptomContent />;
};

export default CheckSymptomScreen;
