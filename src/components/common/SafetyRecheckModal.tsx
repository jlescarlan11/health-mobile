import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal } from './Modal';
import { Button } from './Button';
import { EmergencyActions } from './EmergencyActions';

interface SafetyRecheckModalProps {
  visible: boolean;
  onDismiss: () => void;
  onCallInitiated?: (number: string) => void;
  initialSymptomSummary?: string;
}

export const SafetyRecheckModal: React.FC<SafetyRecheckModalProps> = ({
  visible,
  onDismiss,
  onCallInitiated,
  initialSymptomSummary,
}) => {
  const theme = useTheme();

  return (
    <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modalContent}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.errorContainer }]}>
          <MaterialCommunityIcons name="alert-decagram" size={32} color={theme.colors.error} />
        </View>
        <Text style={[styles.title, { color: theme.colors.error }]}>Safety Check</Text>
      </View>

      <Text style={styles.description}>
        If you or someone else is in immediate danger or experiencing a life-threatening emergency,
        please contact emergency services right away.
      </Text>

      {initialSymptomSummary ? (
        <View style={styles.summaryContainer}>
          <Text style={[styles.summaryLabel, { color: theme.colors.primary }]} variant="labelSmall">
            Reported symptom (summary)
          </Text>
          <Text style={[styles.summaryText, { color: theme.colors.onSurface }]} variant="bodySmall">
            {initialSymptomSummary}
          </Text>
        </View>
      ) : null}

      <View style={styles.emergencySection}>
        <EmergencyActions onCallInitiated={onCallInitiated} variant="light" />
      </View>

      <Button
        title="I AM SAFE, CONTINUE"
        onPress={onDismiss}
        variant="primary"
        style={styles.closeButton}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContent: {
    padding: 24,
    borderRadius: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.8,
  },
  emergencySection: {
    marginBottom: 24,
  },
  summaryContainer: {
    marginBottom: 16,
  },
  summaryLabel: {
    marginBottom: 4,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 20,
  },
  closeButton: {
    marginTop: 8,
  },
});
