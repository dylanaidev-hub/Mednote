/**
 * ─── SQLite Database Layer ───────────────────────────────────────
 * Local-First architecture: 100% offline, no backend.
 * Uses expo-sqlite async API with finalizeUnused workaround.
 */

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'mednote.db';

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Get the singleton database instance (async).
 * Uses finalizeUnusedStatementsBeforeClosing: false to avoid
 * the known expo-sqlite@55 finalizeAsync crash.
 */
export async function getDB(): Promise<SQLite.SQLiteDatabase> {
    if (_db) return _db;
    if (_dbPromise) return _dbPromise;

    _dbPromise = SQLite.openDatabaseAsync(DB_NAME, {
        finalizeUnusedStatementsBeforeClosing: false,
        useNewConnection: true,
    }).then(db => {
        _db = db;
        return db;
    });

    return _dbPromise;
}

/**
 * Initialize the database: create tables and indexes.
 * Uses execAsync for DDL (no parameters needed).
 */
export async function initDB(): Promise<void> {
    const db = await getDB();

    await db.execAsync(`PRAGMA journal_mode = WAL`);

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS medications (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'prescription',
            created_at INTEGER NOT NULL,
            prescription_id TEXT,
            hospital TEXT,
            duration INTEGER DEFAULT 0,
            start_date TEXT,
            images TEXT,
            note TEXT,
            weekdays TEXT,
            meal_timing TEXT
        )
    `);

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            medication_id TEXT NOT NULL,
            time TEXT NOT NULL,
            dose INTEGER DEFAULT 1,
            slot_key TEXT,
            unit TEXT
        )
    `);

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS dose_logs (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL,
            medication_id TEXT NOT NULL,
            scheduled_date TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            completed_at INTEGER
        )
    `);

    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_dose_logs_date ON dose_logs(scheduled_date)`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_dose_logs_med_date ON dose_logs(medication_id, scheduled_date)`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_schedules_med ON schedules(medication_id)`);

    // ── Safe migration: add weekdays column if missing ──
    try {
        await db.execAsync(`ALTER TABLE medications ADD COLUMN weekdays TEXT`);
    } catch {
        // Column already exists, ignore
    }

    // ── Safe migration: add meal_timing column if missing ──
    try {
        await db.execAsync(`ALTER TABLE medications ADD COLUMN meal_timing TEXT`);
    } catch {
        // Column already exists, ignore
    }

    // ── Data cleanup: fix any bad slot_key containing '_sub_' ──
    // Sub-time schedules should have clean slot_key (e.g. 'Sáng', not 'Sáng_sub_xxx')
    const badRows = await db.getAllAsync<{ id: string; slot_key: string }>(
        `SELECT id, slot_key FROM schedules WHERE slot_key LIKE '%_sub_%'`
    );
    if (badRows.length > 0) {
        const fixes = badRows.map(row => {
            const cleanKey = row.slot_key.split('_sub_')[0];
            return `UPDATE schedules SET slot_key = '${cleanKey}' WHERE id = '${row.id}'`;
        });
        await db.execAsync(fixes.join(';\n') + ';');
        console.log(`MedNote: Cleaned ${badRows.length} bad slot_key records`);
    }
}

/**
 * Generate a unique ID.
 */
export function generateId(): string {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
        Math.floor(Math.random() * 16).toString(16)
    );
}
