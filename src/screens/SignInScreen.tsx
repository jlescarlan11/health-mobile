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
import { SignInFormPayload, signIn } from '../services/authApi';

const MIN_PHONE_LENGTH = 7;
const MIN_PASSWORD_LENGTH = 8;

export const SignInScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, unknown>>>();
  const dispatch = useAppDispatch();
  const { scaleFactor } = useAdaptiveUI();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedPhoneNumber = phoneNumber.trim();
  const isPhoneValid = trimmedPhoneNumber.length >= MIN_PHONE_LENGTH;
  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;
  const isFormValid = isPhoneValid && isPasswordValid;

  const integrationNotice = useMemo(
    () =>
      'Enter your phone number and password to sign in. The app sends your credentials to /auth/login once the backend is available.',
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
      const payload: SignInFormPayload = { phoneNumber: trimmedPhoneNumber, password };
      const result = await signIn(payload);
      await storeAuthToken(result.token);
      dispatch(setAuthToken(result.token));
      dispatch(setAuthUser(result.user));
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in at the moment.';
      dispatch(setAuthError(message));
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenSafeArea style={styles.safeArea}>
      <StandardHeader title="Sign In" showBackButton />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { fontSize: 18 * scaleFactor }]}>Welcome back</Text>
        <Text style={[styles.description, { fontSize: 14 * scaleFactor }]}>{integrationNotice}</Text>

        {!!errorMessage && (
          <View style={styles.errorPill}>
            <Text style={{ color: theme.colors.error }}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.formField}>
          <TextInput
            label="Phone number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            returnKeyType="next"
            mode="outlined"
          />
          {!isPhoneValid && phoneNumber.length > 0 && (
            <HelperText type="error">
              Phone number must contain at least {MIN_PHONE_LENGTH} characters.
            </HelperText>
          )}
        </View>

        <View style={styles.formField}>
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            mode="outlined"
          />
          {!isPasswordValid && password.length > 0 && (
            <HelperText type="error">Password must be at least {MIN_PASSWORD_LENGTH} characters.</HelperText>
          )}
        </View>

        <Button
          title="Sign In"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!isFormValid || isSubmitting}
          style={styles.submitButton}
          accessibilityHint="Attempts to sign in with the provided phone number and password"
        />

        <View style={styles.linkRow}>
          <Text style={{ fontSize: 14 * scaleFactor, marginRight: 8 }}>Don’t have an account?</Text>
          <Button
            title="Create Account"
            variant="ghost"
            onPress={() => navigation.navigate('SignUp')}
          />
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
