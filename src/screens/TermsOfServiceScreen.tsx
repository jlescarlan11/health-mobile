import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Text, ScreenSafeArea } from '../components/common';

const TermsOfServiceScreen = () => {
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
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Terms of Service</Text>
        <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant }]}>
          This is a placeholder for the Terms of Service. The full text will be available in a
          future version.
        </Text>
        <Text style={[styles.paragraph, { color: theme.colors.onSurfaceVariant }]}>
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
          commodo consequat.
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

export default TermsOfServiceScreen;
