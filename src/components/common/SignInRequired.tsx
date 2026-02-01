import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';
import { Text } from './Text';
import { useRouter } from 'expo-router';

type SignInRequiredProps = {
  title?: string;
  description?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const SignInRequired: React.FC<SignInRequiredProps> = ({
  title = 'Sign in required',
  description = 'This feature requires an authenticated account to keep your data private.',
  containerStyle,
}) => {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <MaterialCommunityIcons
        name="account-lock-outline"
        size={48}
        color={theme.colors.primary}
        style={styles.icon}
      />
      <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {description}
      </Text>
      <View style={styles.actions}>
        <Button
          title="Sign In"
          variant="primary"
          onPress={() => router.push('/SignIn')}
          style={styles.primaryButton}
        />
        <Button
          title="Create Account"
          variant="ghost"
          onPress={() => router.push('/SignUp')}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    textAlign: 'center',
    marginBottom: 16,
  },
  actions: {
    width: '100%',
  },
  primaryButton: {
    width: '100%',
    marginBottom: 8,
  },
});
