import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  Keyboard,
} from 'react-native';
import { ActivityIndicator, useTheme, Surface, TextInput } from 'react-native-paper';
import { Text } from '../components/common/Text';
import { useDispatch, useSelector } from 'react-redux';
import {
  addMedication,
  deleteMedication,
  fetchMedications,
  fetchTodaysLogs,
  logMedicationTaken,
  selectAllMedications,
  selectMedicationStatus,
  selectMedicationError,
  selectTodaysLogs,
} from '../store/medicationSlice';
import { AppDispatch } from '../store';
import { Medication } from '../types';
import { MedicationCard } from '../components/features/medication/MedicationCard';
import { ScreenSafeArea, Button, SignInRequired, LoadingScreen } from '../components/common';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme as appTheme } from '../theme';
import { useAuthStatus } from '../hooks';

// Simple Time Input Component since we can't add libraries
interface TimeInputProps {
  value: string;
  onChangeText: (time: string) => void;
  error?: boolean;
}

const TimeInput = ({ value, onChangeText, error }: TimeInputProps) => {
  const theme = useTheme();

  // Format: HH:MM
  const handleChange = (text: string) => {
    // Remove non-numeric characters
    const cleaned = text.replace(/[^0-9]/g, '');

    let formatted = cleaned;
    if (cleaned.length > 2) {
      formatted = `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
    }

    // Validate bounds
    if (formatted.length === 5) {
      const hours = parseInt(formatted.split(':')[0], 10);
      const minutes = parseInt(formatted.split(':')[1], 10);

      if (hours > 23) formatted = `23:${formatted.split(':')[1]}`;
      if (minutes > 59) formatted = `${formatted.split(':')[0]}:59`;
    }

    onChangeText(formatted);
  };

  return (
    <View style={styles.timeInputContainer}>
      <TextInput
        mode="outlined"
        label="Time (24h)"
        value={value}
        onChangeText={handleChange}
        placeholder="08:00"
        placeholderTextColor={theme.colors.onSurfaceVariant}
        keyboardType="number-pad"
        maxLength={5}
        error={error}
        style={styles.input}
        outlineStyle={[styles.inputOutline, { borderColor: error ? theme.colors.error : theme.colors.outline }]}
        dense
      />
    </View>
  );
};

interface MedicationFormHeaderProps {
  name: string;
  dosage: string;
  time: string;
  validationError: string | null;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  onDosageChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onSubmit: () => void;
}

const MedicationFormHeader: React.FC<MedicationFormHeaderProps> = ({
  name,
  dosage,
  time,
  validationError,
  isSaving,
  onNameChange,
  onDosageChange,
  onTimeChange,
  onSubmit,
}) => {
  const theme = useTheme();

  return (
    <View style={styles.formContainer}>
      <Text variant="titleMedium" style={styles.headerTitle}>
        Add Medication
      </Text>

      <TextInput
        mode="outlined"
        label="Medication Name"
        placeholder="e.g. Aspirin"
        placeholderTextColor={theme.colors.onSurfaceVariant}
        value={name}
        onChangeText={onNameChange}
        style={styles.input}
        outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
        dense
      />

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <TextInput
            mode="outlined"
            label="Dosage"
            placeholder="e.g. 100mg"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={dosage}
            onChangeText={onDosageChange}
            style={styles.input}
            outlineStyle={[styles.inputOutline, { borderColor: theme.colors.outline }]}
            dense
          />
        </View>
        <View style={{ width: 120 }}>
          <TimeInput value={time} onChangeText={onTimeChange} error={!!validationError && !time} />
        </View>
      </View>

      {validationError && (
        <Text style={{ color: theme.colors.error, marginBottom: 8, fontSize: 12, marginLeft: 4 }}>{validationError}</Text>
      )}

      <Button
        variant="primary"
        onPress={onSubmit}
        style={styles.addButton}
        loading={isSaving}
        disabled={isSaving}
        title="Save Medication"
      />
    </View>
  );
};

const MemoizedMedicationFormHeader = React.memo(MedicationFormHeader);

const MedicationTrackerContent = () => {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const spacing = (theme as any)?.spacing || (appTheme as any)?.spacing || { lg: 16 };
  const listBottomPadding = spacing.lg * 2;
  const medications = useSelector(selectAllMedications);
  const todaysLogs = useSelector(selectTodaysLogs);
  const status = useSelector(selectMedicationStatus);
  const error = useSelector(selectMedicationError);

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [time, setTime] = useState('');
  // Removed local takenState
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAddMedication = useCallback(async () => {
    if (!name.trim() || !dosage.trim() || !time.trim()) {
      setValidationError('Please fill in all fields.');
      return;
    }

    if (time.length !== 5 || !time.includes(':')) {
      setValidationError('Please enter a valid time (HH:MM).');
      return;
    }

    setValidationError(null);
    Keyboard.dismiss();

    const newMedication: Medication = {
      id: Date.now().toString(),
      name: name.trim(),
      dosage: dosage.trim(),
      scheduled_time: time,
      is_active: true,
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    };

    try {
      await dispatch(addMedication(newMedication)).unwrap();
      setName('');
      setDosage('');
      setTime('');
    } catch (err) {
      console.error('Failed to add medication:', err);
      Alert.alert('Error', 'Failed to save medication. Please try again.');
    }
  }, [name, dosage, time, dispatch]);

  useEffect(() => {
    // Always fetch logs on mount/focus to ensure we have the latest status
    dispatch(fetchTodaysLogs());

    if (status === 'idle') {
      dispatch(fetchMedications());
    }
  }, [status, dispatch]);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Medication', 'Are you sure you want to delete this medication?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          dispatch(deleteMedication(id));
        },
      },
    ]);
  };

  const handleToggleTaken = (id: string) => {
    const currentStatus = !!todaysLogs[id];
    dispatch(logMedicationTaken({ medicationId: id, isTaken: !currentStatus }));
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {status === 'loading' ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : (
        <>
          <MaterialCommunityIcons name="pill" size={64} color={theme.colors.surfaceVariant} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
            No medications tracked yet.
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Add one above to get started!
          </Text>
        </>
      )}
    </View>
  );

  const headerProps: MedicationFormHeaderProps = useMemo(
    () => ({
      name,
      dosage,
      time,
      validationError,
      isSaving: status === 'loading',
      onNameChange: setName,
      onDosageChange: setDosage,
      onTimeChange: setTime,
      onSubmit: handleAddMedication,
    }),
    [name, dosage, time, validationError, status, handleAddMedication],
  );

  const headerElement = useMemo(
    () => <MemoizedMedicationFormHeader {...headerProps} />,
    [headerProps],
  );

  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <FlatList
        data={medications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MedicationCard
            medication={item}
            isTaken={!!todaysLogs[item.id]}
            onToggleTaken={handleToggleTaken}
            onDelete={handleDelete}
          />
        )}
        ListHeaderComponent={headerElement}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        keyboardShouldPersistTaps="handled"
      />
      {error && (
        <Surface style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer }]}>
          <Text style={{ color: theme.colors.onErrorContainer }}>{error}</Text>
          <Button variant="text" compact onPress={() => dispatch(fetchMedications())} title="Retry" />
        </Surface>
      )}
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  formContainer: {
    margin: 16,
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  headerTitle: {
    marginBottom: 16,
    fontWeight: '700',
  },
  input: {
    backgroundColor: 'transparent',
    fontSize: 15,
    marginBottom: 4,
  },
  inputOutline: {
    borderRadius: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  timeInputContainer: {
    // 
  },
  addButton: {
    marginTop: 12,
    borderRadius: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gatingWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
});

const MedicationTrackerScreen = () => {
  const { isSignedIn, isSessionLoaded } = useAuthStatus();
  const theme = useTheme();

  if (!isSessionLoaded) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <View style={styles.gatingWrapper}>
          <LoadingScreen />
        </View>
      </ScreenSafeArea>
    );
  }

  if (!isSignedIn) {
    return (
      <ScreenSafeArea
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <View style={styles.gatingWrapper}>
          <SignInRequired
            title="Sign in to use Medication Tracker"
            description="Log and track your medications after signing in to keep everything in one place."
          />
        </View>
      </ScreenSafeArea>
    );
  }

  return <MedicationTrackerContent />;
};

export default MedicationTrackerScreen;
