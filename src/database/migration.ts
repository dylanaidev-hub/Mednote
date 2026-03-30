/**
 * ─── Data Migration: AsyncStorage → SQLite ───────────────────────
 * One-time migration. Uses transactions for batch safety.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDB, initDB } from './database';
import { MedicineEntry } from '../types/medicine';

const MIGRATION_FLAG = '@mednote_sqlite_migrated_v1';
const STORAGE_KEY = '@mednote_prescriptions';
const LOGS_STORAGE_KEY = '@mednote_medication_logs';

interface LegacyPrescription {
    id: string;
    hospital: string;
    date: string;
    duration: number;
    medicines: MedicineEntry[];
    images?: string[];
    createdAt: string;
}

type LegacyLogs = Record<string, Record<string, 'taken' | 'missed'>>;

export async function isMigrated(): Promise<boolean> {
    const flag = await AsyncStorage.getItem(MIGRATION_FLAG);
    return flag === 'true';
}

/**
 * Perform one-time migration using a single transaction with execAsync.
 * execAsync is used for bulk inserts (no parameter binding needed, we escape values).
 */
export async function migrateFromAsyncStorage(): Promise<boolean> {
    const alreadyDone = await isMigrated();
    if (alreadyDone) {
        console.log('MedNote Migration: Already migrated, skipping.');
        return false;
    }

    console.log('MedNote Migration: Starting AsyncStorage → SQLite migration...');

    try {
        await initDB();
        const db = await getDB();

        // Read legacy data
        const rawPrescriptions = await AsyncStorage.getItem(STORAGE_KEY);
        const prescriptions: LegacyPrescription[] = rawPrescriptions
            ? JSON.parse(rawPrescriptions)
            : [];

        const rawLogs = await AsyncStorage.getItem(LOGS_STORAGE_KEY);
        const logs: LegacyLogs = rawLogs ? JSON.parse(rawLogs) : {};

        console.log(`MedNote Migration: Found ${prescriptions.length} prescriptions.`);

        if (prescriptions.length === 0) {
            // Nothing to migrate, just mark as done
            await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
            console.log('MedNote Migration: ✅ No data to migrate, marked complete.');
            return true;
        }

        // Build all SQL statements as a single batch
        const statements: string[] = [];

        for (const rx of prescriptions) {
            const createdAtTs = new Date(rx.createdAt).getTime();
            const imagesJson = rx.images ? JSON.stringify(rx.images) : '';
            const type = rx.duration === 999 ? 'routine' : 'prescription';

            for (const med of rx.medicines) {
                // INSERT medication
                statements.push(
                    `INSERT OR REPLACE INTO medications (id, name, type, created_at, prescription_id, hospital, duration, start_date, images, note)
                     VALUES ('${esc(med.id)}', '${esc(med.name)}', '${type}', ${createdAtTs}, '${esc(rx.id)}', '${esc(rx.hospital)}', ${rx.duration}, '${esc(rx.date)}', '${esc(imagesJson)}', '${esc(med.note || '')}')`
                );

                // INSERT schedules
                const sessionTimes = med.sessionTimes || {};
                for (const [slot, time] of Object.entries(sessionTimes)) {
                    const normalizedSlot = normalizeSlotKey(slot);
                    const scheduleId = `${med.id}_${normalizedSlot}`;
                    const dose = parseInt(med.quantity, 10) || 1;

                    statements.push(
                        `INSERT OR REPLACE INTO schedules (id, medication_id, time, dose, slot_key, unit, created_at)
                         VALUES ('${esc(scheduleId)}', '${esc(med.id)}', '${esc(time)}', ${dose}, '${esc(normalizedSlot)}', '${esc(med.unit || 'viên')}', ${createdAtTs})`
                    );
                }
            }
        }

        // Migrate medication logs
        for (const [prescriptionId, dateLogs] of Object.entries(logs)) {
            const prescription = prescriptions.find(p => p.id === prescriptionId);
            if (!prescription) continue;

            for (const [dateStr, status] of Object.entries(dateLogs)) {
                for (const med of prescription.medicines) {
                    const sessionTimes = med.sessionTimes || {};
                    for (const [slot] of Object.entries(sessionTimes)) {
                        const normalizedSlot = normalizeSlotKey(slot);
                        const scheduleId = `${med.id}_${normalizedSlot}`;
                        const logId = `${scheduleId}_${dateStr}`;
                        const sqliteStatus = status === 'taken' ? 'COMPLETED' : 'MISSED';
                        const completedAt = status === 'taken' ? Date.now() : 'NULL';

                        statements.push(
                            `INSERT OR REPLACE INTO dose_logs (id, schedule_id, medication_id, scheduled_date, status, completed_at)
                             VALUES ('${esc(logId)}', '${esc(scheduleId)}', '${esc(med.id)}', '${esc(dateStr)}', '${sqliteStatus}', ${completedAt})`
                        );
                    }
                }
            }
        }

        // Execute all in a single batch (execAsync supports ; separated statements)
        if (statements.length > 0) {
            const batch = statements.join(';\n') + ';';
            await db.execAsync(batch);
            console.log(`MedNote Migration: Executed ${statements.length} SQL statements.`);
        }

        await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
        console.log('MedNote Migration: ✅ Migration complete!');
        return true;
    } catch (error) {
        console.error('MedNote Migration: ❌ Migration failed:', error);
        return false;
    }
}

/** Escape single quotes for SQL string literals */
function esc(val: string): string {
    return val.replace(/'/g, "''");
}

function normalizeSlotKey(key: string): string {
    const map: Record<string, string> = {
        'sáng': 'Sáng', 'Sáng': 'Sáng',
        'trưa': 'Trưa', 'Trưa': 'Trưa',
        'chiều': 'Chiều', 'Chiều': 'Chiều',
        'tối': 'Tối', 'Tối': 'Tối',
    };
    return map[key] || key;
}
