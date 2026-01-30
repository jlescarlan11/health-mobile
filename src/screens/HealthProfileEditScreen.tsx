import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, Alert, BackHandler } from 'react-native';
import { TextInput, HelperText, useTheme, Snackbar, SegmentedButtons } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { StandardHeader } from '../components/common/StandardHeader';
import { useAppSelector, useAppDispatch } from '../hooks/reduxHooks';
import { updateProfile } from '../store/profileSlice';
import { Button } from '../components/common/Button';
import { Text } from '../components';
import { ScreenSafeArea } from '../components/common';
import { theme as appTheme } from '../theme';

export const HealthProfileEditScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.profile);
  const insets = useSafeAreaInsets();
  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const baseBottomPadding = themeSpacing.lg ?? 16;
  const scrollBottomPadding = baseBottomPadding * 4;
  const snackbarBottomSpacing = insets.bottom + (themeSpacing.sm ?? 8);

  const initialDobDigits = useMemo(() => convertIsoDateToDigits(profile.dob), [profile.dob]);
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [dobDigits, setDobDigits] = useState(initialDobDigits);
  const displayDob = useMemo(() => formatMmDisplay(dobDigits), [dobDigits]);
  const [sex, setSex] = useState(profile.sex || '');
  const [bloodType, setBloodType] = useState(profile.bloodType || '');
  const [philHealthId, setPhilHealthId] = useState(profile.philHealthId || '');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [dobError, setDobError] = useState('');
  const [sexError, setSexError] = useState('');
  const [dobTouched, setDobTouched] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const statusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chronicConditionsInput, setChronicConditionsInput] = useState(
    joinList(profile.chronicConditions),
  );
  const [allergiesInput, setAllergiesInput] = useState(joinList(profile.allergies));
  const [surgicalHistoryInput, setSurgicalHistoryInput] = useState(profile.surgicalHistory || '');
  const [familyHistoryInput, setFamilyHistoryInput] = useState(profile.familyHistory || '');

  const hasUnsavedChanges = useMemo(() => {
    const currentDob = normalizeDigitsToIso(dobDigits) || null;
    const initialDob = profile.dob || null;

    return (
      fullName !== (profile.fullName || '') ||
      currentDob !== initialDob ||
      sex !== (profile.sex || '') ||
      bloodType !== (profile.bloodType || '') ||
      philHealthId !== (profile.philHealthId || '') ||
      chronicConditionsInput !== joinList(profile.chronicConditions) ||
      allergiesInput !== joinList(profile.allergies) ||
      surgicalHistoryInput !== (profile.surgicalHistory || '') ||
      familyHistoryInput !== (profile.familyHistory || '')
    );
  }, [
    fullName,
    dobDigits,
    sex,
    bloodType,
    philHealthId,
    chronicConditionsInput,
    allergiesInput,
    surgicalHistoryInput,
    familyHistoryInput,
    profile,
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
    setFullName(profile.fullName || '');
    const digitsFromProfile = convertIsoDateToDigits(profile.dob);
    setDobDigits(digitsFromProfile);
    setSex(profile.sex || '');
    setBloodType(profile.bloodType || '');
    setPhilHealthId(profile.philHealthId || '');
    setDobError('');
    setDobTouched(false);
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
    setDobTouched(true);
    const dobErr = getDobError(dobDigits);
    setDobError(dobErr);

    if (!sex) {
      setSexError('Please select your sex.');
    } else {
      setSexError('');
    }

    if (dobErr || !sex) {
      return;
    }

    if (dobDigits.length === 8 && !normalizeDigitsToIso(dobDigits)) {
      setDobError('Enter a valid past date (MM/DD/YYYY).');
      return;
    }

    setSaveState('saving');
    dispatch(
      updateProfile({
        fullName: fullName.trim() || null,
        dob: (dobDigits.length === 8 ? normalizeDigitsToIso(dobDigits) : '') || null,
        sex: sex || null,
        bloodType: bloodType.trim() || null,
        philHealthId: philHealthId.trim() || null,
        chronicConditions: parseList(chronicConditionsInput),
        allergies: parseList(allergiesInput),
        surgicalHistory: surgicalHistoryInput.trim() || null,
        familyHistory: familyHistoryInput.trim() || null,
      }),
    );
    setSaveState('saved');
    setSnackbarVisible(true);

    // Navigate back to settings after a short delay to allow the user to see the success message
    statusResetRef.current = setTimeout(() => {
      navigation.goBack();
    }, 1500);
  };

  const handleDobBlur = () => {
    setDobTouched(true);
    setDobError(getDobError(dobDigits));
  };

  const handleDobChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 8);
    setDobDigits(digitsOnly);

    if (digitsOnly.length === 8) {
      setDobError(getDobError(digitsOnly));
    } else if (dobTouched && digitsOnly.length > 0) {
      setDobError('Complete the date as MM/DD/YYYY.');
    } else if (dobError) {
      setDobError('');
    }
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
              placeholder="e.g. Juan Dela Cruz"
              value={fullName}
              onChangeText={setFullName}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              accessibilityHint="Use the name that appears on your IDs so clinics can recognize you"
            />
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label="Date of birth"
              placeholder="MM/DD/YYYY"
              value={displayDob}
              onChangeText={handleDobChange}
              style={styles.input}
              outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
              cursorColor={theme.colors.primary}
              selectionColor={theme.colors.primary + '40'}
              dense
              error={!!dobError}
              keyboardType="number-pad"
              maxLength={10}
              onBlur={handleDobBlur}
              accessibilityHint="Provide the month, day, and year of your birth to match your profile"
            />
            <HelperText type="error" visible={!!dobError} style={styles.helperText}>
              {dobError}
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
            disabled={isSaving}
            accessibilityHint="Save your updated health record details"
            style={styles.saveButton}
          />
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

function formatMmDisplay(digits: string): string {
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  let formatted = '';

  if (month) {
    formatted += month;
    if (digits.length > 2) {
      formatted += '/';
    }
  }

  if (day) {
    formatted += day;
    if (digits.length > 4) {
      formatted += '/';
    }
  }

  if (year) {
    formatted += year;
  }

  return formatted;
}

function normalizeDigitsToIso(digits: string): string | null {
  if (digits.length !== 8) {
    return null;
  }

  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const candidate = new Date(year, month - 1, day);

  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() + 1 !== month ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  if (candidate > new Date()) {
    return null;
  }

  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');

  return `${year}-${paddedMonth}-${paddedDay}`;
}

function convertIsoDateToDigits(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }

  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }

  return `${match[2]}${match[3]}${match[1]}`;
}

function getDobError(digits: string): string {
  if (!digits) {
    return '';
  }

  if (digits.length !== 8) {
    return 'Complete the date as MM/DD/YYYY.';
  }

  if (!normalizeDigitsToIso(digits)) {
    return 'Enter a valid past date (MM/DD/YYYY).';
  }

  return '';
}

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
