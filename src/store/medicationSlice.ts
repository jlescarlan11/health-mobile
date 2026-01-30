import { createSlice, createAsyncThunk, PayloadAction, createSelector } from '@reduxjs/toolkit';
import * as DB from '../services/database';
import { Medication } from '../types';
import { scheduleMedicationReminders, removeMedicationReminders } from '../services/calendarService';

interface MedicationState {
  items: Medication[];
  todaysLogs: Record<string, boolean>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MedicationState = {
  items: [],
  todaysLogs: {},
  status: 'idle',
  error: null,
};

// Helper to map DB record to Medication type
const mapRecordToMedication = (record: DB.MedicationRecord): Medication => ({
  id: record.id,
  name: record.name,
  dosage: record.dosage,
  scheduled_time: record.scheduled_time,
  is_active: Boolean(record.is_active),
  days_of_week: JSON.parse(record.days_of_week || '[]'),
});

// Helper to map Medication to DB record type
const mapMedicationToRecord = (medication: Medication): DB.MedicationRecord => ({
  id: medication.id,
  name: medication.name,
  dosage: medication.dosage,
  scheduled_time: medication.scheduled_time,
  is_active: medication.is_active ? 1 : 0,
  days_of_week: JSON.stringify(medication.days_of_week),
});

export const fetchMedications = createAsyncThunk(
  'medication/fetchMedications',
  async (_, { rejectWithValue }) => {
    try {
      const records = await DB.getMedications();
      return records.map(mapRecordToMedication);
    } catch (error: unknown) {
      return rejectWithValue((error as Error).message || 'Failed to fetch medications');
    }
  },
);

export const fetchTodaysLogs = createAsyncThunk(
  'medication/fetchTodaysLogs',
  async (_, { rejectWithValue }) => {
    try {
      const logs = await DB.getMedicationLogs();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      // Filter logs for today
      const todaysRecords = (logs || []).filter(log => log.timestamp >= todayTimestamp);

      // Group by medication_id and find latest
      const latestStatus: Record<string, { timestamp: number; status: string }> = {};
      
      todaysRecords.forEach(log => {
        if (!latestStatus[log.medication_id] || log.timestamp > latestStatus[log.medication_id].timestamp) {
          latestStatus[log.medication_id] = { timestamp: log.timestamp, status: log.status };
        }
      });

      const todaysLogs: Record<string, boolean> = {};
      Object.keys(latestStatus).forEach(id => {
        todaysLogs[id] = latestStatus[id].status === 'taken';
      });

      return todaysLogs;
    } catch (error: unknown) {
      return rejectWithValue((error as Error).message || 'Failed to fetch medication logs');
    }
  },
);

export const logMedicationTaken = createAsyncThunk(
  'medication/logMedicationTaken',
  async ({ medicationId, isTaken }: { medicationId: string; isTaken: boolean }, { rejectWithValue }) => {
    try {
      const timestamp = Date.now();
      const id = `${medicationId}_${timestamp}`; // Simple unique ID
      
      if (isTaken) {
         await DB.saveMedicationLog({
          id,
          medication_id: medicationId,
          timestamp,
          status: 'taken',
        });
      } else {
        await DB.saveMedicationLog({
          id,
          medication_id: medicationId,
          timestamp,
          status: 'not_taken', // distinct status
        });
      }

      return { medicationId, isTaken };
    } catch (error: unknown) {
      return rejectWithValue((error as Error).message || 'Failed to log medication');
    }
  },
);

export const addMedication = createAsyncThunk(
  'medication/addMedication',
  async (medication: Medication, { rejectWithValue }) => {
    try {
      const record = mapMedicationToRecord(medication);
      await DB.saveMedication(record);

      // Sync with Calendar
      try {
        await scheduleMedicationReminders(medication);
      } catch (calError) {
        console.warn('[MedicationSlice] Calendar sync failed:', calError);
        // We continue even if calendar fails
      }

      return medication;
    } catch (error: unknown) {
      return rejectWithValue((error as Error).message || 'Failed to add medication');
    }
  },
);

export const deleteMedication = createAsyncThunk(
  'medication/deleteMedication',
  async (id: string, { rejectWithValue }) => {
    try {
      await DB.deleteMedication(id);

      // Clean up Calendar
      try {
        await removeMedicationReminders(id);
      } catch (calError) {
        console.warn('[MedicationSlice] Calendar cleanup failed:', calError);
      }

      return id;
    } catch (error: unknown) {
      return rejectWithValue((error as Error).message || 'Failed to delete medication');
    }
  },
);

const medicationSlice = createSlice({
  name: 'medication',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch Medications
      .addCase(fetchMedications.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMedications.fulfilled, (state, action: PayloadAction<Medication[]>) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchMedications.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Add Medication
      .addCase(addMedication.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(addMedication.fulfilled, (state, action: PayloadAction<Medication>) => {
        state.status = 'succeeded';
        // Use OR REPLACE logic: if it exists, update it; otherwise add it
        const index = state.items.findIndex((m) => m.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        } else {
          state.items.push(action.payload);
        }
      })
      .addCase(addMedication.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Delete Medication
      .addCase(deleteMedication.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(deleteMedication.fulfilled, (state, action: PayloadAction<string>) => {
        state.status = 'succeeded';
        state.items = state.items.filter((m) => m.id !== action.payload);
      })
      .addCase(deleteMedication.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Fetch Todays Logs
      .addCase(fetchTodaysLogs.fulfilled, (state, action) => {
         state.todaysLogs = action.payload;
      })
      // Log Medication Taken
      .addCase(logMedicationTaken.fulfilled, (state, action) => {
        state.todaysLogs[action.payload.medicationId] = action.payload.isTaken;
      });
  },
});

export const selectAllMedications = (state: { medication: MedicationState }) =>
  state.medication?.items || [];
export const selectMedicationById = (state: { medication: MedicationState }, id: string) =>
  state.medication?.items?.find((m) => m.id === id);
export const selectMedicationStatus = (state: { medication: MedicationState }) =>
  state.medication?.status || 'idle';
export const selectMedicationError = (state: { medication: MedicationState }) =>
  state.medication?.error;

const selectMedicationState = (state: { medication: MedicationState }) => state.medication;

export const selectTodaysLogs = createSelector(
  [selectMedicationState],
  (medication) => medication?.todaysLogs || {}
);

export default medicationSlice.reducer;