import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TextInput, HelperText, useTheme } from 'react-native-paper';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { StandardHeader } from '../components/common/StandardHeader';
import { ScreenSafeArea } from '../components/common/ScreenSafeArea';
import { Button } from '../components/common/Button';
import { Text } from '../components/common/Text';
import { useAdaptiveUI } from '../hooks/useAdaptiveUI';
import { useAppDispatch } from '../hooks/reduxHooks';
import { setAuthError, setAuthLoading, setAuthToken, setAuthUser } from '../store/authSlice';
import { storeAuthToken } from '../services/authSession';
import { SignUpFormPayload, signUp } from '../services/authApi';
import type { AuthApiError, BackendValidationIssue } from '../services/authApi';

const REQUIRED_MIN_PASSWORD_LENGTH = 8;
const DATE_PLACEHOLDER = '____-__-__';
const DATE_FORMAT_EXAMPLE = 'YYYY-MM-DD';
const DOB_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const FALLBACK_SIGNUP_ERROR = 'Could not create account. Please try again.';

const mapValidationDetailsToFieldErrors = (details: BackendValidationIssue[]): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};
  details.forEach((issue) => {
    const [field] = issue.path;
    if (typeof field === 'string') {
      fieldErrors[field] = issue.message;
    }
  });
  return fieldErrors;
};

const formatDateOfBirthInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (!digits) {
    return '';
  }
  const parts: string[] = [];
  parts.push(digits.slice(0, Math.min(4, digits.length)));
  if (digits.length > 4) {
    parts.push(digits.slice(4, Math.min(6, digits.length)));
  }
  if (digits.length > 6) {
    parts.push(digits.slice(6));
  }
  return parts.filter(Boolean).join('-');
};

export const SignUpScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, unknown>>>();
  const dispatch = useAppDispatch();
  const { scaleFactor } = useAdaptiveUI();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const trimmedPhoneNumber = phoneNumber.trim();
  const trimmedDateOfBirth = dateOfBirth.trim();
  const hasValidName = firstName.trim().length > 0 && lastName.trim().length > 0;
  const hasValidPhone = trimmedPhoneNumber.length >= 7;
  const parsedDob = useMemo(() => {
    if (!trimmedDateOfBirth) {
      return null;
    }
    const parsed = Date.parse(trimmedDateOfBirth);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }, [trimmedDateOfBirth]);
  const hasValidDobFormat = trimmedDateOfBirth.length > 0 && DOB_FORMAT.test(trimmedDateOfBirth);
  const isDobValid = Boolean(parsedDob) && hasValidDobFormat;
  const isPasswordValid = password.length >= REQUIRED_MIN_PASSWORD_LENGTH;
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isFormValid =
    hasValidName &&
    hasValidPhone &&
    isDobValid &&
    isPasswordValid &&
    doPasswordsMatch;
  const firstNameHelperText = fieldErrors.firstName ?? (!firstName.trim() ? 'First name is required.' : undefined);
  const lastNameHelperText = fieldErrors.lastName ?? (!lastName.trim() ? 'Last name is required.' : undefined);
  const phoneHelperText =
    fieldErrors.phoneNumber ?? (!hasValidPhone && phoneNumber.length > 0 ? 'Phone number must contain at least 7 digits.' : undefined);
  const dateOfBirthHelperText =
    fieldErrors.dateOfBirth ?? (trimmedDateOfBirth.length > 0 && !isDobValid ? `Enter a valid date (e.g. ${DATE_FORMAT_EXAMPLE}).` : undefined);
  const passwordHelperText =
    fieldErrors.password ?? (!isPasswordValid && password.length > 0 ? `Password must be at least ${REQUIRED_MIN_PASSWORD_LENGTH} characters.` : undefined);
  const confirmPasswordHelperText =
    fieldErrors.confirmPassword ?? (confirmPassword.length > 0 && !doPasswordsMatch ? 'Passwords must match.' : undefined);

  const integrationWarning = useMemo(
    () =>
      'Signing up requires the backend /auth/signup endpoint. Any invalid fields will render inline messages so you can correct them before submitting again.',
    [],
  );

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) {
      return;
    }
    dispatch(setAuthLoading());
    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const payload: SignUpFormPayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: trimmedPhoneNumber,
        dateOfBirth: parsedDob ? parsedDob.toISOString() : trimmedDateOfBirth,
        password,
        confirmPassword,
      };
      const result = await signUp(payload);
      await storeAuthToken(result.token);
      dispatch(setAuthToken(result.token));
      dispatch(setAuthUser(result.user));
      navigation.goBack();
    } catch (error) {
      const apiError = error as AuthApiError;
      if (apiError.details && apiError.details.length > 0) {
        setFieldErrors(mapValidationDetailsToFieldErrors(apiError.details));
      } else {
        setFieldErrors({});
        dispatch(setAuthError(FALLBACK_SIGNUP_ERROR));
        setErrorMessage(FALLBACK_SIGNUP_ERROR);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenSafeArea style={styles.safeArea}>
      <StandardHeader title="Create Account" showBackButton />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { fontSize: 18 * scaleFactor }]}>Create your profile</Text>
        <Text style={[styles.description, { fontSize: 14 * scaleFactor }]}>
          {integrationWarning}
        </Text>

        {!!errorMessage && (
          <View style={styles.errorPill}>
            <Text style={{ color: theme.colors.error }}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.formField}>
          <TextInput
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            mode="outlined"
            autoCapitalize="words"
          />
          {firstNameHelperText && <HelperText type="error">{firstNameHelperText}</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            mode="outlined"
            autoCapitalize="words"
          />
          {lastNameHelperText && <HelperText type="error">{lastNameHelperText}</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Phone number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            mode="outlined"
          />
          {phoneHelperText && <HelperText type="error">{phoneHelperText}</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Date of birth"
            placeholder={DATE_PLACEHOLDER}
            value={dateOfBirth}
            onChangeText={(value) => setDateOfBirth(formatDateOfBirthInput(value))}
            mode="outlined"
          />
          {dateOfBirthHelperText && <HelperText type="error">{dateOfBirthHelperText}</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            mode="outlined"
          />
          {passwordHelperText && <HelperText type="error">{passwordHelperText}</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            mode="outlined"
          />
          {confirmPasswordHelperText && <HelperText type="error">{confirmPasswordHelperText}</HelperText>}
        </View>

        <Button
          title="Create Account"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!isFormValid || isSubmitting}
          style={styles.submitButton}
        />

        <View style={styles.linkRow}>
          <Text style={{ fontSize: 14 * scaleFactor, marginRight: 8 }}>Already have an account?</Text>
          <Button title="Sign In" variant="ghost" onPress={() => navigation.navigate('SignIn')} />
        </View>
      </ScrollView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: '#4C566A',
    marginBottom: 16,
  },
  formField: {
    marginBottom: 16,
  },
  errorPill: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  submitButton: {
    marginTop: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
});
