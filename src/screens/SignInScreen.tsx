import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { TextInput, HelperText, useTheme } from 'react-native-paper';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StandardHeader } from '../components/common/StandardHeader';
import { ScreenSafeArea } from '../components/common/ScreenSafeArea';
import { Button } from '../components/common/Button';
import { Text } from '../components/common/Text';
import { useAdaptiveUI } from '../hooks/useAdaptiveUI';
import { useAppDispatch } from '../hooks/reduxHooks';
import { setAuthError, setAuthLoading, setAuthToken, setAuthUser } from '../store/authSlice';
import { storeAuthSession } from '../services/authSession';
import { SignInFormPayload, signIn } from '../services/authApi';
import {
  formatPhilippinesPhoneNumber,
  sanitizePhilippinesPhoneInput,
  MAX_PHILIPPINES_PHONE_DIGITS,
  PHILIPPINES_COUNTRY_CODE,
  PHILIPPINES_PHONE_PLACEHOLDER,
} from '../utils/phoneNumberUtils';

const MIN_PASSWORD_LENGTH = 8;

export const SignInScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, unknown>>>();
  const dispatch = useAppDispatch();
  const { scaleFactor } = useAdaptiveUI();
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedPhoneNumber = formatPhilippinesPhoneNumber(phoneNumber);
  const isPhoneValid = phoneNumber.length === MAX_PHILIPPINES_PHONE_DIGITS;
  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;
  const isFormValid = isPhoneValid && isPasswordValid;

  const handlePhoneNumberChange = (value: string) => {
    setPhoneNumber(sanitizePhilippinesPhoneInput(value));
  };

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) {
      return;
    }
    dispatch(setAuthLoading());
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const payload: SignInFormPayload = { phoneNumber, password };
      const result = await signIn(payload);
      await storeAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      dispatch(setAuthToken(result.accessToken));
      dispatch(setAuthUser(result.user));
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace('/');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in at the moment.';
      dispatch(setAuthError(message));
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenSafeArea style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <StandardHeader title="Sign In" showBackButton />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!!errorMessage && (
              <View style={styles.errorPill}>
                <Text style={{ color: theme.colors.error }}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.formField}>
              <TextInput
                label="Phone number"
                placeholder={PHILIPPINES_PHONE_PLACEHOLDER}
                value={formattedPhoneNumber}
                onChangeText={handlePhoneNumberChange}
                keyboardType="phone-pad"
                returnKeyType="next"
                mode="outlined"
                left={<TextInput.Affix text={PHILIPPINES_COUNTRY_CODE} />}
              />
              {!isPhoneValid && phoneNumber.length > 0 && (
                <HelperText type="error">
                  Phone number must contain {MAX_PHILIPPINES_PHONE_DIGITS} digits.
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

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
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
  bottomSpacer: {
    height: 120,
  },
});
