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

// Current schema version — bump this when adding new migrations
const DB_VERSION = 3;

/**
 * Initialize the database with versioned migrations.
 * Uses PRAGMA user_version to track schema version.
 * Migrations run sequentially: v0→v1→v2→...
 */
export async function initDB(): Promise<void> {
    const db = await getDB();

    await db.execAsync(`PRAGMA journal_mode = WAL`);

    // ── Read current schema version ──────────────────────────
    const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let currentVersion = result?.user_version || 0;

    console.log(`MedNote DB: current version = ${currentVersion}, target = ${DB_VERSION}`);

    // ── Migration v0 → v1: Initial schema ────────────────────
    if (currentVersion < 1) {
        console.log('MedNote DB: Running migration v0 → v1 (initial schema)');

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
                note TEXT
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

        currentVersion = 1;
    }

    // ── Migration v1 → v2: Add weekdays + meal_timing columns ─
    if (currentVersion < 2) {
        console.log('MedNote DB: Running migration v1 → v2 (weekdays + meal_timing)');

        try {
            await db.execAsync(`ALTER TABLE medications ADD COLUMN weekdays TEXT`);
        } catch {
            // Column already exists — safe to ignore
        }

        try {
            await db.execAsync(`ALTER TABLE medications ADD COLUMN meal_timing TEXT`);
        } catch {
            // Column already exists — safe to ignore
        }

        currentVersion = 2;
    }

    // ── Migration v2 → v3: Add record_title column ───────
    if (currentVersion < 3) {
        console.log('MedNote DB: Running migration v2 → v3 (record_title)');

        try {
            await db.execAsync(`ALTER TABLE medications ADD COLUMN record_title TEXT`);
        } catch {
            // Column already exists — safe to ignore
        }

        currentVersion = 3;
    }

    // ── Future migrations go here ────────────────────────────

    // ── Persist final version ────────────────────────────────
    await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
    console.log(`MedNote DB: schema up to date (v${DB_VERSION})`);

    // ── Data cleanup: fix any bad slot_key containing '_sub_' ──
    const badRows = await db.getAllAsync<{ id: string; slot_key: string }>(
        `SELECT id, slot_key FROM schedules WHERE slot_key LIKE '%_sub_%'`
    );
    if (badRows.length > 0) {
        const fixes = badRows.map(row => {
            const cleanKey = row.slot_key.split('_sub_')[0];
            return `UPDATE schedules SET slot_key = '${cleanKey}' WHERE id = '${row.id}'`;
        });
        await db.execAsync(fixes.join(';\n') + ';');
        console.log(`MedNote DB: Cleaned ${badRows.length} bad slot_key records`);
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
