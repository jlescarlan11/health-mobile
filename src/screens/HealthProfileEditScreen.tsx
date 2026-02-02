import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, Alert, BackHandler } from 'react-native';
import { TextInput, HelperText, useTheme, Snackbar, SegmentedButtons } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { StandardHeader } from '../components/common/StandardHeader';
import { useAppSelector, useAppDispatch } from '../hooks/reduxHooks';
import { fetchProfileFromServer, updateProfile } from '../store/profileSlice';
import { Button } from '../components/common/Button';
import { LoadingScreen, ScreenSafeArea } from '../components/common';
import { Text } from '../components';
import { useAuthStatus, useRedirectToSettingsIfSignedOut } from '../hooks';
import { theme as appTheme } from '../theme';
import { formatIsoDateForDisplay } from '../utils/dobUtils';
import { buildProfilePayload, saveUserProfile } from '../services/profileService';

const HealthProfileEditContent = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.profile);
  const { derivedFullName, authDob, hasAuthName, hasAuthDob, authUser } = useAuthStatus();
  const insets = useSafeAreaInsets();
  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const baseBottomPadding = themeSpacing.lg ?? 16;
  const scrollBottomPadding = baseBottomPadding * 4;
  const snackbarBottomSpacing = insets.bottom + (themeSpacing.sm ?? 8);

  const displayFullName = derivedFullName ?? '—';
  const displayDob = hasAuthDob ? formatIsoDateForDisplay(authDob) : '—';
  const canSaveAuthFields = hasAuthName && hasAuthDob;
  const fullNameHelperText = hasAuthName
    ? 'Full name is managed by your signed-in account.'
    : 'Provide both first and last names in your account to proceed.';
  const dobHelperText = hasAuthDob
    ? 'Date of birth is pulled from your account details.'
    : 'Add your date of birth to your account before saving.';
  const [sex, setSex] = useState(profile.sex || '');
  const [bloodType, setBloodType] = useState(profile.bloodType || '');
  const [philHealthId, setPhilHealthId] = useState(profile.philHealthId || '');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [sexError, setSexError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const statusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chronicConditionsInput, setChronicConditionsInput] = useState(
    joinList(profile.chronicConditions),
  );
  const [allergiesInput, setAllergiesInput] = useState(joinList(profile.allergies));
  const [surgicalHistoryInput, setSurgicalHistoryInput] = useState(profile.surgicalHistory || '');
  const [familyHistoryInput, setFamilyHistoryInput] = useState(profile.familyHistory || '');

  const hasUnsavedChanges = useMemo(() => {
    return (
      sex !== (profile.sex || '') ||
      bloodType !== (profile.bloodType || '') ||
      philHealthId !== (profile.philHealthId || '') ||
      chronicConditionsInput !== joinList(profile.chronicConditions) ||
      allergiesInput !== joinList(profile.allergies) ||
      surgicalHistoryInput !== (profile.surgicalHistory || '') ||
      familyHistoryInput !== (profile.familyHistory || '')
    );
  }, [
    sex,
    bloodType,
    philHealthId,
    chronicConditionsInput,
    allergiesInput,
    surgicalHistoryInput,
    familyHistoryInput,
    profile.sex,
    profile.bloodType,
    profile.philHealthId,
    profile.chronicConditions,
    profile.allergies,
    profile.surgicalHistory,
    profile.familyHistory,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges || saveState === 'saved') {
        return;
      }

      e.preventDefault();

      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave and discard them?',
        [
          { text: "Don't leave", style: 'cancel', onPress: () => {} },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });

    return unsubscribe;
  }, [navigation, hasUnsavedChanges, saveState]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hasUnsavedChanges && saveState !== 'saved') {
          Alert.alert(
            'Discard changes?',
            'You have unsaved changes. Are you sure you want to leave and discard them?',
            [
              { text: "Don't leave", style: 'cancel', onPress: () => {} },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => navigation.goBack(),
              },
            ],
          );
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [hasUnsavedChanges, saveState, navigation]),
  );

  useEffect(() => {
    setSex(profile.sex || '');
    setBloodType(profile.bloodType || '');
    setPhilHealthId(profile.philHealthId || '');
    setChronicConditionsInput(joinList(profile.chronicConditions));
    setAllergiesInput(joinList(profile.allergies));
    setSurgicalHistoryInput(profile.surgicalHistory || '');
    setFamilyHistoryInput(profile.familyHistory || '');
  }, [profile]);

  useEffect(() => {
    return () => {
      if (statusResetRef.current) {
        clearTimeout(statusResetRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    if (!canSaveAuthFields) {
      Alert.alert(
        'Incomplete account data',
        'Your account needs a first name, last name, and date of birth before you can save your profile.',
      );
      return;
    }

    if (!sex) {
      setSexError('Please select your sex.');
      return;
    }

    setSexError('');
    setSaveState('saving');
    const parsedChronic = parseList(chronicConditionsInput);
    const parsedAllergies = parseList(allergiesInput);
    const parsedSurgicalHistory = surgicalHistoryInput.trim() || null;
    const parsedFamilyHistory = familyHistoryInput.trim() || null;

    dispatch(
      updateProfile({
        fullName: derivedFullName ?? null,
        dob: authDob ?? null,
        sex: sex || null,
        bloodType: bloodType.trim() || null,
        philHealthId: philHealthId.trim() || null,
        chronicConditions: parsedChronic,
        allergies: parsedAllergies,
        surgicalHistory: parsedSurgicalHistory,
        familyHistory: parsedFamilyHistory,
      }),
    );
    const syncPayload = buildProfilePayload({
      profile: {
        fullName: derivedFullName ?? null,
        dob: authDob ?? null,
        sex: sex || null,
        chronicConditions: parsedChronic,
        allergies: parsedAllergies,
        surgicalHistory: parsedSurgicalHistory,
        familyHistory: parsedFamilyHistory,
      },
      authUser,
    });

    void saveUserProfile(syncPayload)
      .then(() => {
        dispatch(fetchProfileFromServer());
      })
      .catch((error) => {
        console.warn('[Profile Sync] Failed to sync profile after save:', error);
      });
    setSaveState('saved');
    setSnackbarVisible(true);

    // Navigate back to settings after a short delay to allow the user to see the success message
    statusResetRef.current = setTimeout(() => {
      navigation.goBack();
    }, 1500);
  };

  const onDismissSnackbar = () => setSnackbarVisible(false);
  const isSaving = saveState === 'saving';

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <StandardHeader title="Edit Health Profile" showBackButton />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        enableOnAndroid={true}
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sectionCard}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Personal details
          </Text>
          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Full name"
              value={displayFullName}
              editable={false}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              accessibilityHint="Use the name that appears on your IDs so clinics can recognize you"
            />
            <HelperText type={hasAuthName ? 'info' : 'error'} visible style={styles.helperText}>
              {fullNameHelperText}
            </HelperText>
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Date of birth"
              value={displayDob}
              editable={false}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              accessibilityHint="Your date of birth is synced from your account and cannot be changed here"
            />
            <HelperText type={hasAuthDob ? 'info' : 'error'} visible style={styles.helperText}>
              {dobHelperText}
            </HelperText>
          </View>

          <View style={styles.field}>
            <Text
              variant="bodyMedium"
              style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              Sex
            </Text>
            <SegmentedButtons
              value={sex}
              onValueChange={(val) => {
                setSex(val);
                if (val) setSexError('');
              }}
              buttons={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' },
              ]}
              style={styles.segmentedButton}
              density="medium"
            />
            {!!sexError && (
              <HelperText type="error" visible={!!sexError} style={styles.helperText}>
                {sexError}
              </HelperText>
            )}
          </View>
        </View>

        <View style={[styles.sectionCard, styles.sectionCardSpacing]}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Health essentials
          </Text>
          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Blood type"
              placeholder="e.g. O+"
              value={bloodType}
              onChangeText={setBloodType}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              accessibilityHint="Share your blood type so emergency teams can act quickly"
            />
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="PhilHealth ID"
              placeholder="12-digit number"
              value={philHealthId}
              onChangeText={setPhilHealthId}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              keyboardType="numeric"
              dense
              accessibilityHint="Keep this number accurate for faster claims and eligibility checks"
            />
          </View>
        </View>

        <View style={[styles.sectionCard, styles.sectionCardSpacing]}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Medical context
          </Text>
          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Chronic conditions"
              placeholder="e.g. asthma, hypertension"
              value={chronicConditionsInput}
              onChangeText={setChronicConditionsInput}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              multiline
              numberOfLines={2}
              accessibilityHint="Share long-term conditions so the AI tailors follow-up questions"
            />
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Allergies"
              placeholder="e.g. penicillin, shellfish"
              value={allergiesInput}
              onChangeText={setAllergiesInput}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              multiline
              numberOfLines={2}
              accessibilityHint="List known allergies so the AI avoids unsafe recommendations"
            />
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Surgical history"
              placeholder="Add relevant surgeries, dates, and notes"
              value={surgicalHistoryInput}
              onChangeText={setSurgicalHistoryInput}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              multiline
              numberOfLines={3}
              accessibilityHint="Capture past surgeries so the AI can factor healing history into its advice"
            />
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Family history"
              placeholder="e.g. diabetes, heart disease"
              value={familyHistoryInput}
              onChangeText={setFamilyHistoryInput}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              multiline
              numberOfLines={3}
              accessibilityHint="Let the AI know your family patterns so it can watch for similar risks"
            />
          </View>
        </View>

        <View style={styles.buttonArea}>
          <Button
            title="Save changes"
            variant="primary"
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving || !canSaveAuthFields}
            accessibilityHint="Save your updated health record details"
            style={styles.saveButton}
          />
          {!canSaveAuthFields && (
            <Text style={[styles.dependencyHint, { color: theme.colors.error }]}>
              Full name and date of birth must come from your account before you can save.
            </Text>
          )}
        </View>
      </KeyboardAwareScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={onDismissSnackbar}
        duration={2000}
        style={[styles.snackbar, { backgroundColor: theme.colors.surface }]}
        wrapperStyle={[styles.snackbarWrapper, { bottom: snackbarBottomSpacing }]}
      >
        <Text style={[styles.snackbarText, { color: theme.colors.onSurface }]}>
          Profile saved successfully
        </Text>
      </Snackbar>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
  },
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  sectionCardSpacing: {
    marginTop: 20,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  field: {
    marginTop: 18,
  },
  fieldLabel: {
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '600',
  },
  segmentedButton: {
    marginTop: 4,
  },
  input: {
    backgroundColor: 'transparent',
    fontSize: 15,
  },
  inputOutline: {
    borderRadius: 18,
  },
  helperText: {
    marginTop: 4,
    marginLeft: 8,
  },
  dependencyHint: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
  },
  signInRequiredWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  buttonArea: {
    marginTop: 30,
    marginBottom: 20,
  },
  saveButton: {
    borderRadius: 16,
  },
  snackbarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  snackbar: {
    borderRadius: 24,
    elevation: 4,
  },
  snackbarText: {
    fontWeight: '600',
  },
});

export const HealthProfileEditScreen = () => {
  const { isSignedIn, isSessionLoaded } = useAuthStatus();
  const theme = useTheme();

  useRedirectToSettingsIfSignedOut(isSignedIn, isSessionLoaded);

  if (!isSessionLoaded || !isSignedIn) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        <StandardHeader title="Edit Health Profile" showBackButton />
        <View style={styles.loadingWrapper}>
          <LoadingScreen />
        </View>
      </ScreenSafeArea>
    );
  }

  return <HealthProfileEditContent />;
};

function joinList(list?: string[] | null): string {
  if (!list || list.length === 0) {
    return '';
  }

  return list.filter(Boolean).join(', ');
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
