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

const REQUIRED_MIN_PASSWORD_LENGTH = 8;
const DATE_PLACEHOLDER = 'YYYY-MM-DD';

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

  const trimmedPhoneNumber = phoneNumber.trim();
  const hasValidName = firstName.trim().length > 0 && lastName.trim().length > 0;
  const hasValidPhone = trimmedPhoneNumber.length >= 7;
  const parsedDob = useMemo(() => {
    if (!dateOfBirth.trim()) {
      return null;
    }
    const parsed = Date.parse(dateOfBirth.trim());
    return Number.isNaN(parsed) ? null : parsed;
  }, [dateOfBirth]);
  const isDobValid = parsedDob !== null;
  const isPasswordValid = password.length >= REQUIRED_MIN_PASSWORD_LENGTH;
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isFormValid =
    hasValidName &&
    hasValidPhone &&
    isDobValid &&
    isPasswordValid &&
    doPasswordsMatch;

  const integrationWarning = useMemo(
    () =>
      'Signing up requires the backend /auth/signup endpoint. If it still enforces fields such as sex at birth, the request will fail until the contract is relaxed.',
    [],
  );

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) {
      return;
    }
    dispatch(setAuthLoading());
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const payload: SignUpFormPayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: trimmedPhoneNumber,
        dateOfBirth: dateOfBirth.trim(),
        password,
      };
      const result = await signUp(payload);
      await storeAuthToken(result.token);
      dispatch(setAuthToken(result.token));
      dispatch(setAuthUser(result.user));
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create an account.';
      dispatch(setAuthError(message));
      setErrorMessage(message);
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
          {!firstName.trim() && <HelperText type="error">First name is required.</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            mode="outlined"
            autoCapitalize="words"
          />
          {!lastName.trim() && <HelperText type="error">Last name is required.</HelperText>}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Phone number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            mode="outlined"
          />
          {!hasValidPhone && phoneNumber.length > 0 && (
            <HelperText type="error">Phone number must contain at least 7 digits.</HelperText>
          )}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Date of birth"
            placeholder={DATE_PLACEHOLDER}
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            mode="outlined"
          />
          {dateOfBirth.trim().length > 0 && !isDobValid && (
            <HelperText type="error">Enter a valid date (e.g. {DATE_PLACEHOLDER}).</HelperText>
          )}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            mode="outlined"
          />
          {!isPasswordValid && password.length > 0 && (
            <HelperText type="error">Password must be at least {REQUIRED_MIN_PASSWORD_LENGTH} characters.</HelperText>
          )}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            mode="outlined"
          />
          {confirmPassword.length > 0 && !doPasswordsMatch && (
            <HelperText type="error">Passwords must match.</HelperText>
          )}
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
