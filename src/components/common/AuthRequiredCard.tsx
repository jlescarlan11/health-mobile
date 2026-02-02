import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';
import { Text } from './Text';
import { useRouter } from 'expo-router';

type AuthRequiredCardProps = {
  containerStyle?: StyleProp<ViewStyle>;
  title?: string;
  description?: string;
};

export const AuthRequiredCard: React.FC<AuthRequiredCardProps> = ({
  containerStyle,
  title = 'Get the FULL Experience',
  description = 'Sign in to access full features and services.',
}) => {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Surface
      style={[styles.wrapper, { backgroundColor: theme.colors.surface }, containerStyle]}
      elevation={2}
    >
      <MaterialCommunityIcons
        name="shield-lock-outline"
        size={44}
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
        <Button title="Create Account" variant="ghost" onPress={() => router.push('/SignUp')} />
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginVertical: 16,
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
