import * as SQLite from 'expo-sqlite';
import { Facility } from '../types';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

let dbMutex: Promise<void> = Promise.resolve();

let dbCallCounter = 0;

const snapshotStack = (): string => {
  const stack = new Error().stack ?? '';
  return stack
    .split('\n')
    .slice(3, 8)
    .map((line) => line.trim())
    .join(' | ');
};

const runExclusive = async <T>(fn: () => Promise<T>): Promise<T> => {
  const previous = dbMutex;
  let release!: () => void;
  dbMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const callId = ++dbCallCounter;
  const startedAt = Date.now();
  console.log(
    `[Database] [${callId}] acquired lock (${new Date(startedAt).toISOString()}); stack=${snapshotStack()}`,
  );
  try {
    return await fn();
  } finally {
    const finishedAt = Date.now();
    console.log(
      `[Database] [${callId}] released lock (${new Date(finishedAt).toISOString()}); duration=${finishedAt - startedAt}ms`,
    );
    release();
  }
};

// Migration function to add missing columns
const migrateTableSchema = async (
  tableName: string,
  requiredColumns: { name: string; type: string }[],
) => {
  if (!db) return;

  try {
    // Get existing columns
    const tableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
    const existingColumnNames = tableInfo.map((col) => col.name);

    // Check and add missing columns
    for (const requiredColumn of requiredColumns) {
      if (!existingColumnNames.includes(requiredColumn.name)) {
        await execWithRetry(
          db,
          `ALTER TABLE ${tableName} ADD COLUMN ${requiredColumn.name} ${requiredColumn.type}`,
        );
      }
    }
  } catch (error: unknown) {
    console.error(`Error migrating ${tableName} schema:`, error);
    throw error;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DB_LOCK_MAX_RETRIES = 5;
const DB_LOCK_RETRY_DELAY_MS = 75;

const isDatabaseLockedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybeMessage = (error as Error).message;
  return typeof maybeMessage === 'string' && maybeMessage.includes('database is locked');
};

const retryOnDatabaseLock = async <T>(
  fn: () => Promise<T>,
  attemptsLeft = DB_LOCK_MAX_RETRIES,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (attemptsLeft <= 0 || !isDatabaseLockedError(error)) {
      throw error;
    }
    console.warn('[Database] Locked; retrying operation');
    await sleep(DB_LOCK_RETRY_DELAY_MS);
    return retryOnDatabaseLock(fn, attemptsLeft - 1);
  }
};

const execWithRetry = (database: SQLite.SQLiteDatabase, sql: string) =>
  retryOnDatabaseLock(() => database.execAsync(sql));

const runWithRetry = (database: SQLite.SQLiteDatabase, sql: string, args?: unknown[]) =>
  retryOnDatabaseLock(() => database.runAsync(sql, args));

const executeStatementWithRetry = async (
  statement: { executeAsync: (params?: Record<string, unknown> | unknown[]) => Promise<void> },
  params?: Record<string, unknown> | unknown[],
) => retryOnDatabaseLock(() => statement.executeAsync(params));

export interface ClinicalHistoryRecord {
  id: string;
  timestamp: number;
  initial_symptoms: string;
  recommended_level: string;
  final_disposition?: string;
  clinical_soap: string;
  medical_justification: string;
  profile_snapshot?: string;
  isGuest?: boolean;
  synced?: number; // 0 for false, 1 for true
  synced_at?: number;
}

export const initDatabase = async () => {
  if (initPromise) return initPromise;

  initPromise = runExclusive(async () => {
    try {
      db = await SQLite.openDatabaseAsync('health_app.db', { useNewConnection: true });
      try {
        await execWithRetry(db, 'PRAGMA busy_timeout = 5000');
      } catch (error) {
        if (isDatabaseLockedError(error)) {
          console.warn('[Database] Skipping busy_timeout pragma due to lock; continuing init.');
        } else {
          throw error;
        }
      }
      try {
        await execWithRetry(db, 'PRAGMA journal_mode = WAL');
      } catch (error) {
        if (isDatabaseLockedError(error)) {
          console.warn('[Database] Skipping WAL pragma due to lock; continuing init.');
        } else {
          throw error;
        }
      }

      // Create Facilities Table
      await execWithRetry(
        db,
        `
        CREATE TABLE IF NOT EXISTS facilities (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT,
          services TEXT,
          address TEXT,
          latitude REAL,
          longitude REAL,
          phone TEXT,
          yakapAccredited INTEGER,
          hours TEXT,
          photoUrl TEXT,
          lastUpdated INTEGER,
          data TEXT
        );
      `);

      // Migrate facilities table schema (add missing columns if table already existed)
      await migrateTableSchema('facilities', [
        { name: 'lastUpdated', type: 'INTEGER' },
        { name: 'specialized_services', type: 'TEXT' },
        { name: 'is_24_7', type: 'INTEGER' },
      ]);

      // Create Emergency Contacts Table
      await execWithRetry(
        db,
        `
        CREATE TABLE IF NOT EXISTS emergency_contacts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT,
          phone TEXT,
          available24x7 INTEGER,
          description TEXT,
          lastUpdated INTEGER,
          data TEXT
        );
      `);

      // Migrate emergency_contacts table schema (add missing columns if table already existed)
      await migrateTableSchema('emergency_contacts', [{ name: 'lastUpdated', type: 'INTEGER' }]);

      // Create Clinical History Table
      await execWithRetry(
        db,
        `
      CREATE TABLE IF NOT EXISTS clinical_history (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        initial_symptoms TEXT,
        recommended_level TEXT,
        final_disposition TEXT,
        clinical_soap TEXT,
        medical_justification TEXT,
        profile_snapshot TEXT,
          synced INTEGER DEFAULT 0,
          synced_at INTEGER
        );
      `);

      // Migrate clinical_history table schema
      await migrateTableSchema('clinical_history', [
        { name: 'timestamp', type: 'INTEGER' },
        { name: 'initial_symptoms', type: 'TEXT' },
        { name: 'recommended_level', type: 'TEXT' },
        { name: 'final_disposition', type: 'TEXT' },
        { name: 'clinical_soap', type: 'TEXT' },
        { name: 'medical_justification', type: 'TEXT' },
        { name: 'profile_snapshot', type: 'TEXT' },
        { name: 'synced', type: 'INTEGER' },
        { name: 'synced_at', type: 'INTEGER' },
      ]);

      // Create Medications Table
      await execWithRetry(
        db,
        `
        CREATE TABLE IF NOT EXISTS medications (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          dosage TEXT,
          scheduled_time TEXT,
          is_active INTEGER DEFAULT 1,
          days_of_week TEXT,
          has_reminders INTEGER DEFAULT 1
        );
      `);

      // Migrate medications table schema
      await migrateTableSchema('medications', [
        { name: 'name', type: 'TEXT' },
        { name: 'dosage', type: 'TEXT' },
        { name: 'scheduled_time', type: 'TEXT' },
        { name: 'is_active', type: 'INTEGER' },
        { name: 'days_of_week', type: 'TEXT' },
        { name: 'has_reminders', type: 'INTEGER' },
      ]);

      // Create Medication Logs Table
      await execWithRetry(
        db,
        `
        CREATE TABLE IF NOT EXISTS medication_logs (
          id TEXT PRIMARY KEY,
          medication_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          status TEXT NOT NULL,
          FOREIGN KEY (medication_id) REFERENCES medications (id)
        );
      `);

      // Migrate medication_logs schema
      await migrateTableSchema('medication_logs', [
        { name: 'medication_id', type: 'TEXT' },
        { name: 'timestamp', type: 'INTEGER' },
        { name: 'status', type: 'TEXT' },
      ]);

      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      if (db) {
        try {
          await db.closeAsync();
        } catch (closeError) {
          console.warn('[Database] Failed to close database after init error:', closeError);
        } finally {
          db = null;
        }
      }
      initPromise = null; // Allow retry on failure
      throw error;
    }
  });

  return initPromise;
};

const ensureDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!db) await initDatabase();
  if (!db) throw new Error('Database not initialized');
  return db;
};

const withDatabaseLock = async <T>(
  fn: (database: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> => {
  await initDatabase();
  return runExclusive(async () => {
    const database = await ensureDatabase();
    console.log(`[Database] queue executing ${fn.name || '<anonymous>'}`);
    return fn(database);
  });
};

export const saveFacilities = async (facilities: Facility[]) =>
  withDatabaseLock(async (database) => {
    const timestamp = Date.now();

    try {
      await execWithRetry(database, 'BEGIN TRANSACTION');

      const statement = await database.prepareAsync(
        `INSERT OR REPLACE INTO facilities (id, name, type, services, address, latitude, longitude, phone, yakapAccredited, hours, photoUrl, lastUpdated, specialized_services, is_24_7, data) VALUES ($id, $name, $type, $services, $address, $latitude, $longitude, $phone, $yakapAccredited, $hours, $photoUrl, $lastUpdated, $specialized_services, $is_24_7, $data)`,
      );

      try {
        for (const facility of facilities) {
          await executeStatementWithRetry(statement, {
            $id: facility.id,
            $name: facility.name,
            $type: facility.type,
            $services: JSON.stringify(facility.services || []),
            $address: facility.address,
            $latitude: facility.latitude,
            $longitude: facility.longitude,
            $phone: facility.phone || null,
            $yakapAccredited: facility.yakapAccredited ? 1 : 0,
            $hours: facility.hours || null,
            $photoUrl: facility.photoUrl || null,
            $lastUpdated: timestamp,
            $specialized_services: JSON.stringify(facility.specialized_services || []),
            $is_24_7: facility.is_24_7 ? 1 : 0,
            $data: JSON.stringify(facility),
          });
        }

        await execWithRetry(database, 'COMMIT');
        console.log(`Saved ${facilities.length} facilities to offline storage`);
      } catch (innerError) {
        console.error('Error during facility save loop:', innerError);
        try {
          await execWithRetry(database, 'ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to rollback facility transaction:', rollbackError);
        }
        throw innerError;
      } finally {
        await statement.finalizeAsync();
      }
    } catch (error) {
      console.error('Error in saveFacilities:', error);
      throw error;
    }
  });

const stableStringify = (value: unknown) =>
  JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return nested;

    const record = nested as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = record[key];
    }
    return sorted;
  });

export const saveFacilitiesFull = async (facilities: Facility[]) =>
  withDatabaseLock(async (database) => {
    const timestamp = Date.now();

    const incomingIds = new Set<string>();
    if (facilities.length > 0) {
      for (const facility of facilities) {
        if (!facility?.id) {
          throw new Error('Invalid facilities dataset: missing facility.id');
        }
        incomingIds.add(facility.id);
      }

      if (incomingIds.size === 0) {
        throw new Error('Invalid facilities dataset: no facility ids present');
      }
    }

    try {
      if (facilities.length === 0) {
        await execWithRetry(database, 'DELETE FROM facilities');
        console.log('Cleared facilities offline storage (empty dataset)');
        return;
      }

      const existing = await database.getAllAsync<{ id: string; data: string | null }>(
        'SELECT id, data FROM facilities',
      );
      const existingDataById = new Map(existing.map((row) => [row.id, row.data ?? '']));

      const deleteStatement = await database.prepareAsync('DELETE FROM facilities WHERE id = $id');
      const upsertStatement = await database.prepareAsync(
        `INSERT OR REPLACE INTO facilities (id, name, type, services, address, latitude, longitude, phone, yakapAccredited, hours, photoUrl, lastUpdated, specialized_services, is_24_7, data) VALUES ($id, $name, $type, $services, $address, $latitude, $longitude, $phone, $yakapAccredited, $hours, $photoUrl, $lastUpdated, $specialized_services, $is_24_7, $data)`,
      );

      let deletedCount = 0;
      let upsertedCount = 0;
      let skippedCount = 0;

      const deleteIds = Array.from(existingDataById.keys()).filter((id) => !incomingIds.has(id));
      const upsertQueue: Array<{
        facility: Facility;
        serialized: string;
      }> = [];

      for (const facility of facilities) {
        if (!facility?.id) {
          continue;
        }
        const serialized = stableStringify(facility);
        const existingSerialized = existingDataById.get(facility.id);
        if (existingSerialized === serialized) {
          skippedCount += 1;
          continue;
        }
        upsertQueue.push({ facility, serialized });
      }

      const chunkSize = 40;
      let deleteIndex = 0;
      let upsertIndex = 0;

      const processBatch = async () => {
        await execWithRetry(database, 'BEGIN TRANSACTION');
        try {
          const deleteBatch = deleteIds.slice(deleteIndex, deleteIndex + chunkSize);
          const upsertBatch = upsertQueue.slice(upsertIndex, upsertIndex + chunkSize);

          for (const id of deleteBatch) {
            await executeStatementWithRetry(deleteStatement, { $id: id });
            deletedCount += 1;
          }

          for (const { facility, serialized } of upsertBatch) {
            await executeStatementWithRetry(upsertStatement, {
              $id: facility.id,
              $name: facility.name,
              $type: facility.type,
              $services: JSON.stringify(facility.services || []),
              $address: facility.address,
              $latitude: facility.latitude,
              $longitude: facility.longitude,
              $phone: facility.phone || null,
              $yakapAccredited: facility.yakapAccredited ? 1 : 0,
              $hours: facility.hours || null,
              $photoUrl: facility.photoUrl || null,
              $lastUpdated: timestamp,
              $specialized_services: JSON.stringify(facility.specialized_services || []),
              $is_24_7: facility.is_24_7 ? 1 : 0,
              $data: serialized,
            });
            upsertedCount += 1;
          }

          await execWithRetry(database, 'COMMIT');
        } catch (innerError) {
          await execWithRetry(database, 'ROLLBACK');
          throw innerError;
        }
      };

      try {
        while (deleteIndex < deleteIds.length || upsertIndex < upsertQueue.length) {
          await processBatch();
          deleteIndex = Math.min(deleteIds.length, deleteIndex + chunkSize);
          upsertIndex = Math.min(upsertQueue.length, upsertIndex + chunkSize);
        }

        console.log(
          `Synced facilities offline storage (upserted ${upsertedCount}, skipped ${skippedCount}, deleted ${deletedCount})`,
        );
      } catch (innerError) {
        console.error('Error during full facilities sync:', innerError);
        throw innerError;
      } finally {
        await deleteStatement.finalizeAsync();
        await upsertStatement.finalizeAsync();
      }
    } catch (error) {
      console.error('Error in saveFacilitiesFull:', error);
      throw error;
    }
  });

interface FacilityRow {
  id: string;
  name: string;
  type: string;
  services: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  yakapAccredited: number;
  hours: string | null;
  photoUrl: string | null;
  lastUpdated: number;
  specialized_services: string | null;
  is_24_7: number | null;
  data: string;
}

export const getFacilities = async (): Promise<Facility[]> =>
  withDatabaseLock(async (database) => {
    try {
      const result = await database.getAllAsync<FacilityRow>('SELECT * FROM facilities');

      return result
        .map((row) => {
          try {
            const fullData = row.data ? JSON.parse(row.data) : {};
            return {
              ...fullData,
              id: row.id,
              name: row.name,
              type: row.type,
              services: row.services ? JSON.parse(row.services) : [],
              address: row.address,
              latitude: row.latitude,
              longitude: row.longitude,
              phone: row.phone,
              yakapAccredited: Boolean(row.yakapAccredited),
              hours: row.hours,
              photoUrl: row.photoUrl,
              specialized_services: row.specialized_services
                ? JSON.parse(row.specialized_services)
                : [],
              is_24_7: Boolean(row.is_24_7),
              lastUpdated: row.lastUpdated,
            };
          } catch (e) {
            console.error('Error parsing facility row:', e);
            return null;
          }
        })
        .filter((f): f is Facility => f !== null);
    } catch (error) {
      console.error('Error getting facilities:', error);
      throw error;
    }
  });

export const getFacilityById = async (id: string): Promise<Facility | null> =>
  withDatabaseLock(async (database) => {
    try {
      const row = await database.getFirstAsync<FacilityRow>('SELECT * FROM facilities WHERE id = ?', [id]);

      if (!row) return null;

      const fullData = row.data ? JSON.parse(row.data) : {};
      return {
        ...fullData,
        id: row.id,
        name: row.name,
        type: row.type,
        services: row.services ? JSON.parse(row.services) : [],
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        phone: row.phone,
        yakapAccredited: Boolean(row.yakapAccredited),
        hours: row.hours,
        photoUrl: row.photoUrl,
        specialized_services: row.specialized_services ? JSON.parse(row.specialized_services) : [],
        is_24_7: Boolean(row.is_24_7),
        lastUpdated: row.lastUpdated,
      };
    } catch (error) {
      console.error('Error getting facility by ID:', error);
      throw error;
    }
  });

export const saveClinicalHistory = async (record: ClinicalHistoryRecord) =>
  withDatabaseLock(async (database) => {
    try {
      await execWithRetry(database, 'BEGIN TRANSACTION');

      const statement = await database.prepareAsync(
        `INSERT OR REPLACE INTO clinical_history (id, timestamp, initial_symptoms, recommended_level, final_disposition, clinical_soap, medical_justification, profile_snapshot, synced, synced_at) 
         VALUES ($id, $timestamp, $initial_symptoms, $recommended_level, $final_disposition, $clinical_soap, $medical_justification, $profile_snapshot, $synced, $synced_at)`,
      );

      try {
        await executeStatementWithRetry(statement, {
          $id: record.id,
          $timestamp: record.timestamp,
          $initial_symptoms: record.initial_symptoms,
          $recommended_level: record.recommended_level,
          $final_disposition: record.final_disposition || null,
          $clinical_soap: record.clinical_soap,
          $medical_justification: record.medical_justification,
          $profile_snapshot: record.profile_snapshot || null,
          $synced: record.synced || 0,
          $synced_at: record.synced_at || null,
        });

        await execWithRetry(database, 'COMMIT');
        console.log(`Saved clinical history record: ${record.id}`);
      } catch (innerError) {
        console.error('Error during clinical history save:', innerError);
          try {
            await execWithRetry(database, 'ROLLBACK');
          } catch (rollbackError) {
            console.error('Failed to rollback clinical history transaction:', rollbackError);
          }
        throw innerError;
      } finally {
        await statement.finalizeAsync();
      }
    } catch (error) {
      console.error('Error in saveClinicalHistory:', error);
      throw error;
    }
  });

export const getClinicalHistory = async (): Promise<ClinicalHistoryRecord[]> =>
  withDatabaseLock(async (database) => {
    try {
      const result = await database.getAllAsync<ClinicalHistoryRecord>(
        'SELECT * FROM clinical_history ORDER BY timestamp DESC',
      );
      return result;
    } catch (error) {
      console.error('Error getting clinical history:', error);
      throw error;
    }
  });

export const getUnsyncedHistory = async (): Promise<ClinicalHistoryRecord[]> =>
  withDatabaseLock(async (database) => {
    try {
      const result = await database.getAllAsync<ClinicalHistoryRecord>(
        'SELECT * FROM clinical_history WHERE synced = 0 OR synced IS NULL',
      );
      return result;
    } catch (error) {
      console.error('Error getting unsynced clinical history:', error);
      throw error;
    }
  });

export const markHistorySynced = async (id: string) =>
  withDatabaseLock(async (database) => {
    const timestamp = Date.now();
    try {
      await runWithRetry(database, 'UPDATE clinical_history SET synced = 1, synced_at = ? WHERE id = ?', [
        timestamp,
        id,
      ]);
      console.log(`Marked clinical history record as synced: ${id}`);
    } catch (error) {
      console.error('Error marking history as synced:', error);
      throw error;
    }
  });

export const getHistoryById = async (id: string): Promise<ClinicalHistoryRecord | null> =>
  withDatabaseLock(async (database) => {
    try {
      const result = await database.getFirstAsync<ClinicalHistoryRecord>(
        'SELECT * FROM clinical_history WHERE id = ?',
        [id],
      );
      return result;
    } catch (error) {
      console.error('Error getting history by ID:', error);
      throw error;
    }
  });

export interface MedicationRecord {
  id: string;
  name: string;
  dosage: string;
  scheduled_time: string;
  is_active: number;
  days_of_week: string;
}

export const saveMedication = async (medication: MedicationRecord) =>
  withDatabaseLock(async (database) => {
    try {
      await execWithRetry(database, 'BEGIN TRANSACTION');

      const statement = await database.prepareAsync(
        `INSERT OR REPLACE INTO medications (id, name, dosage, scheduled_time, is_active, days_of_week) 
         VALUES ($id, $name, $dosage, $scheduled_time, $is_active, $days_of_week)`,
      );

      try {
        await executeStatementWithRetry(statement, {
          $id: medication.id,
          $name: medication.name,
          $dosage: medication.dosage,
          $scheduled_time: medication.scheduled_time,
          $is_active: medication.is_active,
          $days_of_week: medication.days_of_week,
        });

        await execWithRetry(database, 'COMMIT');
        console.log(`Saved medication record: ${medication.id}`);
      } catch (innerError) {
        console.error('Error during medication save:', innerError);
          try {
            await execWithRetry(database, 'ROLLBACK');
          } catch (rollbackError) {
            console.error('Failed to rollback medication transaction:', rollbackError);
          }
        throw innerError;
      } finally {
        await statement.finalizeAsync();
      }
    } catch (error) {
      console.error('Error in saveMedication:', error);
      throw error;
    }
  });

export const getMedications = async (): Promise<MedicationRecord[]> =>
  withDatabaseLock(async (database) => {
    try {
      const result = await database.getAllAsync<MedicationRecord>('SELECT * FROM medications');
      return result;
    } catch (error) {
      console.error('Error getting medications:', error);
      throw error;
    }
  });

export const deleteMedication = async (id: string) =>
  withDatabaseLock(async (database) => {
    try {
      await execWithRetry(database, 'BEGIN TRANSACTION');
      try {
        await runWithRetry(database, 'DELETE FROM medications WHERE id = ?', [id]);
        await execWithRetry(database, 'COMMIT');
        console.log(`Deleted medication record: ${id}`);
      } catch (innerError) {
        console.error('Error during medication deletion:', innerError);
        await execWithRetry(database, 'ROLLBACK');
        throw innerError;
      }
    } catch (error) {
      console.error('Error in deleteMedication:', error);
      throw error;
    }
  });

export interface MedicationLogRecord {
  id: string;
  medication_id: string;
  timestamp: number;
  status: string;
}

export const saveMedicationLog = async (log: MedicationLogRecord) =>
  withDatabaseLock(async (database) => {
    try {
      await execWithRetry(database, 'BEGIN TRANSACTION');

      const statement = await database.prepareAsync(
        `INSERT OR REPLACE INTO medication_logs (id, medication_id, timestamp, status)
         VALUES ($id, $medication_id, $timestamp, $status)`,
      );

      try {
        await executeStatementWithRetry(statement, {
          $id: log.id,
          $medication_id: log.medication_id,
          $timestamp: log.timestamp,
          $status: log.status,
        });

        await execWithRetry(database, 'COMMIT');
        console.log(`Saved medication log: ${log.id}`);
      } catch (innerError) {
        console.error('Error during medication log save:', innerError);
        try {
          await execWithRetry(database, 'ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to rollback medication log transaction:', rollbackError);
        }
        throw innerError;
      } finally {
        await statement.finalizeAsync();
      }
    } catch (error) {
      console.error('Error in saveMedicationLog:', error);
      throw error;
    }
  });

export const getMedicationLogs = async (): Promise<MedicationLogRecord[]> =>
  withDatabaseLock(async (database) => {
    try {
      const result = await database.getAllAsync<MedicationLogRecord>(
        'SELECT * FROM medication_logs ORDER BY timestamp DESC',
      );
      return result;
    } catch (error) {
      console.error('Error getting medication logs:', error);
      throw error;
    }
  });
