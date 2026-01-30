import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Surface, Text, IconButton, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Medication } from '../../../types';

interface MedicationCardProps {
  medication: Medication;
  isTaken: boolean;
  onToggleTaken: (id: string) => void;
  onDelete: (id: string) => void;
}

export const MedicationCard: React.FC<MedicationCardProps> = ({
  medication,
  isTaken,
  onToggleTaken,
  onDelete,
}) => {
  const theme = useTheme();

  return (
    <Surface
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      elevation={1}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <Text style={[styles.name, { color: theme.colors.onSurface }]}>
            {medication.name}
          </Text>
          <Text style={[styles.details, { color: theme.colors.onSurfaceVariant }]}>
            {medication.dosage} • {medication.scheduled_time}
          </Text>
        </View>

        <View style={styles.rightSection}>
          <TouchableOpacity
            style={styles.takenButton}
            onPress={() => onToggleTaken(medication.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isTaken }}
            accessibilityLabel={`Mark ${medication.name} as taken`}
          >
            <MaterialCommunityIcons
              name={isTaken ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={24}
              color={isTaken ? theme.colors.primary : theme.colors.outline}
            />
            <Text
              style={[
                styles.takenText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {isTaken ? 'Taken' : 'Mark'}
            </Text>
          </TouchableOpacity>

          <IconButton
            icon="delete-outline"
            iconColor={theme.colors.error}
            size={20}
            onPress={() => onDelete(medication.id)}
            accessibilityLabel={`Delete ${medication.name}`}
          />
        </View>
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftSection: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  details: {
    fontSize: 13,
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  takenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    borderRadius: 16,
  },
  takenText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});
