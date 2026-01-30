import React from 'react';
import { View, StyleSheet, ScrollView, Linking, Alert } from 'react-native';
import { Text, Card, useTheme, IconButton, Surface } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MENTAL_HEALTH_RESOURCES, MentalHealthResource } from '../services/mentalHealthDetector';
import { Button } from '../components/common/Button';
import { ScreenSafeArea } from '../components/common';
import { theme as appTheme } from '../theme';

const CrisisSupportScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const spacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const contentBottomPadding = spacing.lg * 2;

  const handleCall = (number: string) => {
    // Clean number for tel: link (remove non-digits except +)
    const phoneNumber = number.replace(/[^0-9+]/g, '');
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (!supported) {
          Alert.alert('Error', 'Phone calls are not supported on this device');
        } else {
          return Linking.openURL(url);
        }
      })
      .catch((err) => console.error('An error occurred', err));
  };

  const ResourceCard = ({ resource }: { resource: MentalHealthResource }) => (
    <Card mode="outlined" style={styles.card}>
      <Card.Content>
        <Text variant="titleLarge" style={[styles.resourceName, { color: theme.colors.primary }]}>
          {resource.name}
        </Text>
        <Text variant="bodyMedium" style={styles.resourceDesc}>
          {resource.description}
        </Text>
        <Button
          variant="danger"
          icon="phone"
          onPress={() => handleCall(resource.number)}
          style={styles.callButton}
          title={`Call ${resource.number}`}
        />
      </Card.Content>
    </Card>
  );

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton
            icon="close"
            size={24}
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          />
          <View style={styles.titleSection}>
            <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
              You Are Not Alone
            </Text>
            <Text
              variant="bodyLarge"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Confidential support is available 24/7. Please reach out to these services.
            </Text>
          </View>
        </View>

        <Surface
          style={[styles.alertBox, { backgroundColor: theme.colors.errorContainer }]}
          elevation={0}
        >
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onErrorContainer, textAlign: 'center', lineHeight: 20 }}
          >
            If you are in immediate danger or have a medical emergency, please go to the nearest
            hospital immediately.
          </Text>
        </Surface>

        <Text variant="titleMedium" style={styles.sectionTitle}>
          CRISIS HOTLINES
        </Text>

        {MENTAL_HEALTH_RESOURCES.map((resource, index) => (
          <ResourceCard key={index} resource={resource} />
        ))}

        <View style={styles.footer}>
          <Button
            variant="outline"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            title="I'm okay, go back"
          />
        </View>
      </ScrollView>
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 32,
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginRight: -8,
    marginTop: -8,
  },
  titleSection: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 24,
  },
  alertBox: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    letterSpacing: 1,
    color: '#666',
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  resourceName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resourceDesc: {
    marginBottom: 16,
    color: '#555',
    lineHeight: 20,
  },
  callButton: {
    borderRadius: 12,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButton: {
    width: '100%',
    borderRadius: 12,
  },
});

export default CrisisSupportScreen;
