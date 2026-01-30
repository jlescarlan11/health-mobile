import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Text, ScreenSafeArea } from '../components/common';

const PrivacyPolicyScreen = () => {
  const theme = useTheme();

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Privacy Policy</Text>
        <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant }]}>
          This is a placeholder for the Privacy Policy. The full text will be available in a future
          version.
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant }]}>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
          ut labore et dolore magna aliqua.
        </Text>
      </ScrollView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10,
  },
});

export default PrivacyPolicyScreen;
