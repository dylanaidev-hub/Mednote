/**
 * ─── Dose Log DAO ────────────────────────────────────────────────
 * Core dose tracking operations. Uses execAsync for writes,
 * getAllAsync for reads to minimize prepared statement issues.
 */

import { getDB } from './database';
import { DoseStatus, DayProgress, StreakResult } from '../types/schema';
import { formatLocalDate, parseSQLiteDate } from '../utils/dateUtils';

// ─── Types ───────────────────────────────────────────────────────

export interface DoseLogRow {
    id: string;
    schedule_id: string;
    medication_id: string;
    scheduled_date: string;
    status: string;
    completed_at: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function esc(val: string): string {
    return val.replace(/'/g, "''");
}

// ─── TOGGLE STATUS ───────────────────────────────────────────────

export async function toggleDoseStatus(doseLogId: string): Promise<void> {
    const db = await getDB();
    const rows = await db.getAllAsync<DoseLogRow>(
        `SELECT * FROM dose_logs WHERE id = '${esc(doseLogId)}'`
    );
    if (rows.length === 0) return;

    const row = rows[0];
    if (row.status === 'PENDING' || row.status === 'MISSED') {
        await db.execAsync(
            `UPDATE dose_logs SET status = 'COMPLETED', completed_at = ${Date.now()} WHERE id = '${esc(doseLogId)}'`
        );
    } else if (row.status === 'COMPLETED') {
        await db.execAsync(
            `UPDATE dose_logs SET status = 'PENDING', completed_at = NULL WHERE id = '${esc(doseLogId)}'`
        );
    }
}

/**
 * Set status for a medication on a specific date.
 */
export async function setMedicationDateStatus(
    medicationId: string,
    dateStr: string,
    status: 'COMPLETED' | 'MISSED' | 'PENDING' | null
): Promise<void> {
    const db = await getDB();

    if (status === null) {
        await db.execAsync(
            `DELETE FROM dose_logs WHERE medication_id = '${esc(medicationId)}' AND scheduled_date = '${esc(dateStr)}'`
        );
        return;
    }

    await ensureDoseLogsForDate(medicationId, dateStr);

    const completedAt = status === 'COMPLETED' ? Date.now() : 'NULL';
    await db.execAsync(
        `UPDATE dose_logs SET status = '${status}', completed_at = ${completedAt} WHERE medication_id = '${esc(medicationId)}' AND scheduled_date = '${esc(dateStr)}'`
    );
}

// ─── ENSURE DOSE LOGS ────────────────────────────────────────────

export async function ensureDoseLogsForDate(medicationId: string, dateStr: string): Promise<void> {
    const db = await getDB();

    const schedules = await db.getAllAsync<{ id: string; time: string }>(
        `SELECT id, time FROM schedules WHERE medication_id = '${esc(medicationId)}'`
    );

    // Get medication's start_date + created_at for Day-1 super-guard
    const med = await db.getFirstAsync<{ created_at: number; start_date: string }>(
        `SELECT created_at, start_date FROM medications WHERE id = '${esc(medicationId)}'`
    );

    // ★ SUPER-GUARD: Use start_date as Day-1 anchor
    const now = new Date();
    const dayOneDateStr = med?.start_date || formatLocalDate(now);
    const isDayOne = (dayOneDateStr === dateStr);
    const isTodayRealTime = (dateStr === formatLocalDate(now));

    // Safe parse created_at → createdMinutes (fallback to current time if null/invalid)
    let createdMinutes = now.getHours() * 60 + now.getMinutes(); // default = now
    if (med?.created_at) {
        const safeCreatedAt = parseSQLiteDate(med.created_at);
        if (!isNaN(safeCreatedAt.getTime())) {
            createdMinutes = safeCreatedAt.getHours() * 60 + safeCreatedAt.getMinutes();
        }
    }

    const statements: string[] = [];

    for (const schedule of schedules) {
        const logId = `${schedule.id}_${dateStr}`;

        // ★ Day-1 past-time guard: chặn dose_logs cho giờ đã qua trên ngày đầu tiên
        if (isDayOne && isTodayRealTime) {
            const scheduleMinutes = getMinutesSinceMidnight(schedule.time);
            if (scheduleMinutes <= createdMinutes) {
                // DELETE any existing bad dose_log + skip INSERT
                statements.push(`DELETE FROM dose_logs WHERE id = '${esc(logId)}'`);
                continue;
            }
        }

        // ★ PHASE 2: Valid session → create PENDING dose_log
        statements.push(
            `INSERT OR IGNORE INTO dose_logs (id, schedule_id, medication_id, scheduled_date, status)
             VALUES ('${esc(logId)}', '${esc(schedule.id)}', '${esc(medicationId)}', '${esc(dateStr)}', 'PENDING')`
        );
    }

    if (statements.length > 0) {
        await db.execAsync(statements.join(';\n') + ';');
    }
}

// ─── QUERY: DOSE LOG SESSIONS FOR DATE (Data-Driven Dashboard) ──

/**
 * Returns medication_id + slot_key pairs that have actual dose_log records
 * for a specific date. Used by Dashboard to render ONLY medicines with real DoseLogs.
 */
export async function getDoseLogSessionsForDate(dateStr: string): Promise<Set<string>> {
    const db = await getDB();
    const rows = await db.getAllAsync<{ medication_id: string; slot_key: string }>(
        `SELECT dl.medication_id, s.slot_key
         FROM dose_logs dl
         JOIN schedules s ON dl.schedule_id = s.id
         WHERE dl.scheduled_date = '${esc(dateStr)}'`
    );

    // Return a Set of "medId_slotKey" keys for fast lookup
    const keys = new Set<string>();
    rows.forEach(row => {
        keys.add(`${row.medication_id}_${(row.slot_key || '').toLowerCase()}`);
    });
    return keys;
}

// ─── ENSURE ALL TODAY DOSE LOGS (Day-1 aware) ────────────────────

/** Convert "HH:mm" → total minutes since midnight */
function getMinutesSinceMidnight(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Ensures dose_logs are correct for ALL active medications for the given date.
 * 
 * TWO-PHASE approach:
 * Phase 1 (DELETE): Remove any bad dose_logs for creation-day medications
 *   where the schedule time has already passed. These may have been created
 *   by previous code versions.
 * Phase 2 (INSERT): Create PENDING dose_logs for valid sessions only.
 * 
 * Must be called BEFORE getDoseLogSessionsForDate().
 */
export async function ensureAllDoseLogsForDate(dateStr: string): Promise<void> {
    const db = await getDB();
    const now = new Date();
    const todayDateOnly = formatLocalDate(now);

    // ★ GUARD: Never generate dose_logs for dates before today (local time)
    if (dateStr < todayDateOnly) {
        console.log(`MedNote: ensureAllDoseLogsForDate BLOCKED — ${dateStr} is before today (${todayDateOnly})`);
        return;
    }

    console.log(`MedNote: ensureDoseLogsForDate for ${dateStr}`);

    // Find all active medications for the target date
    const meds = await db.getAllAsync<{ id: string; created_at: number; start_date: string; duration: number; weekdays: string | null }>(
        `SELECT id, created_at, start_date, duration, weekdays FROM medications
         WHERE start_date IS NOT NULL
         AND date(start_date) <= date('${esc(dateStr)}')
         AND date(start_date, '+' || (duration - 1) || ' days') >= date('${esc(dateStr)}')`
    );

    if (meds.length === 0) {
        console.log(`MedNote: No active medications found for ${dateStr}`);
        return;
    }

    // Get all schedules for these meds
    const medIds = meds.map(m => `'${esc(m.id)}'`).join(',');
    const schedules = await db.getAllAsync<{ id: string; medication_id: string; time: string; slot_key: string }>(
        `SELECT id, medication_id, time, slot_key FROM schedules WHERE medication_id IN (${medIds})`
    );

    const insertStatements: string[] = [];
    const deleteStatements: string[] = [];

    for (const schedule of schedules) {
        const med = meds.find(m => m.id === schedule.medication_id);
        if (!med) continue;

        // ★ Weekday Guard: skip if target date's day-of-week is not in allowed weekdays
        if (med.weekdays) {
            try {
                const allowedDays: number[] = JSON.parse(med.weekdays);
                const targetDay = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun..6=Sat
                if (allowedDays.length > 0 && !allowedDays.includes(targetDay)) {
                    console.log(`MedNote: Weekday guard ⛔ [${schedule.slot_key}] skipped — day ${targetDay} not in ${med.weekdays}`);
                    continue;
                }
            } catch {
                // Invalid JSON, treat as all days allowed
            }
        }

        // ★ SUPER-GUARD: Use start_date as Day-1 anchor (not created_at alone)
        const dayOneDateStr = med.start_date || formatLocalDate(now);
        const isDayOne = (dayOneDateStr === dateStr);
        const isTodayRealTime = (dateStr === todayDateOnly);
        const logId = `${schedule.id}_${dateStr}`;

        if (isDayOne && isTodayRealTime) {
            const scheduleMinutes = getMinutesSinceMidnight(schedule.time);

            // Safe parse created_at → createdMinutes (fallback to current time if null/invalid)
            let createdMinutes = now.getHours() * 60 + now.getMinutes();
            if (med.created_at) {
                const safeCreatedAt = parseSQLiteDate(med.created_at);
                if (!isNaN(safeCreatedAt.getTime())) {
                    createdMinutes = safeCreatedAt.getHours() * 60 + safeCreatedAt.getMinutes();
                }
            }

            if (scheduleMinutes <= createdMinutes) {
                // ★ PHASE 1: Past session → DELETE any existing bad dose_log
                deleteStatements.push(
                    `DELETE FROM dose_logs WHERE id = '${esc(logId)}'`
                );
                console.log(`MedNote: Day-1 🗑 DELETE dose_log for [${schedule.slot_key}] ${schedule.time} (${scheduleMinutes}m <= ${createdMinutes}m created)`);
                continue; // ⛔ SKIP PHASE 2 INSERT
            } else {
                console.log(`MedNote: Day-1 ✅ KEEP [${schedule.slot_key}] ${schedule.time} (${scheduleMinutes}m > ${createdMinutes}m created)`);
            }
        }

        // ★ PHASE 2: Valid session → create PENDING dose_log (INSERT OR IGNORE = safe)
        insertStatements.push(
            `INSERT OR IGNORE INTO dose_logs (id, schedule_id, medication_id, scheduled_date, status)
             VALUES ('${esc(logId)}', '${esc(schedule.id)}', '${esc(schedule.medication_id)}', '${esc(dateStr)}', 'PENDING')`
        );
    }

    // Execute DELETE first, then INSERT
    const allStatements = [...deleteStatements, ...insertStatements];
    if (allStatements.length > 0) {
        await db.execAsync(allStatements.join(';\n') + ';');
        console.log(`MedNote: ensureAllTodayDoseLogs → ${deleteStatements.length} DELETEs, ${insertStatements.length} INSERTs for ${dateStr}`);
    }
}

// ─── SSoT: GET DOSE SESSIONS FOR DATE (Schedule.tsx) ─────────────

export interface DoseSessionRow {
    dose_log_id: string;
    schedule_id: string;
    medication_id: string;
    scheduled_date: string;
    status: string;
    completed_at: number | null;
    slot_key: string;
    time: string;
    dose: number;
    unit: string;
    med_name: string;
    med_type: string;
    prescription_id: string | null;
    created_at: number;
    meal_timing: string | null;
    note: string | null;
}

/**
 * SSoT query: Returns ALL dose sessions for a given date.
 * SQL JOIN: dose_logs → schedules → medications
 * 
 * This is the ONLY data source Schedule.tsx should use.
 * If dose_logs has no records for a date → empty array → nothing renders.
 */
export async function getDoseSessionsForDate(dateStr: string): Promise<DoseSessionRow[]> {
    const db = await getDB();
    const rows = await db.getAllAsync<DoseSessionRow>(
        `SELECT
            dl.id as dose_log_id,
            dl.schedule_id,
            dl.medication_id,
            dl.scheduled_date,
            dl.status,
            dl.completed_at,
            s.slot_key,
            s.time,
            s.dose,
            s.unit,
            m.name as med_name,
            m.type as med_type,
            m.prescription_id,
            m.created_at,
            m.meal_timing,
            m.note
         FROM dose_logs dl
         JOIN schedules s ON dl.schedule_id = s.id
         JOIN medications m ON dl.medication_id = m.id
         WHERE dl.scheduled_date = '${esc(dateStr)}'
         ORDER BY s.time ASC`
    );
    return rows;
}

// ─── SSoT: WEEKLY PROGRESS FROM DB ──────────────────────────────

/**
 * SSoT query: Returns 7-day progress directly from dose_logs.
 * 
 * For each day:
 * - Has dose_logs with ALL COMPLETED → COMPLETED
 * - Has dose_logs with some not COMPLETED + past → MISSED
 * - Has dose_logs with PENDING → PENDING
 * - No dose_logs at all → NOT_APPLICABLE (Day-1 or before creation)
 * - Future date → FUTURE
 */
export async function getWeeklyProgressFromDB(
    prescriptionId: string,
    createdAt: string,
    startDate: Date,
    endDate: Date
): Promise<DayProgress[]> {
    const db = await getDB();
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const createdAtDate = new Date(createdAt);
    const createdAtDateOnly = new Date(createdAtDate);
    createdAtDateOnly.setHours(0, 0, 0, 0);

    // Get ALL medication IDs for this prescription
    const medRows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM medications WHERE prescription_id = '${esc(prescriptionId)}'`
    );
    const medIds = medRows.map(r => r.id);

    if (medIds.length === 0) return [];

    const medIdsSQL = medIds.map(id => `'${esc(id)}'`).join(',');

    // Get all dose_logs in the date range for these medications
    const startStr = formatLocalDate(startDate);
    const endStr = formatLocalDate(endDate);
    const logs = await db.getAllAsync<{ scheduled_date: string; status: string }>(
        `SELECT scheduled_date, status FROM dose_logs
         WHERE medication_id IN (${medIdsSQL})
         AND scheduled_date >= '${esc(startStr)}'
         AND scheduled_date <= '${esc(endStr)}'`
    );

    // Group by date
    const logsByDate = new Map<string, string[]>();
    logs.forEach(log => {
        const existing = logsByDate.get(log.scheduled_date) || [];
        existing.push(log.status);
        logsByDate.set(log.scheduled_date, existing);
    });

    const days: DayProgress[] = [];

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        currentDate.setHours(0, 0, 0, 0);

        const dateStr = formatLocalDate(currentDate);
        let status: DoseStatus;

        if (currentDate < createdAtDateOnly) {
            status = DoseStatus.NOT_APPLICABLE;
        } else if (currentDate > today) {
            status = DoseStatus.FUTURE;
        } else {
            const dayLogs = logsByDate.get(dateStr);

            if (!dayLogs || dayLogs.length === 0) {
                // ★ No dose_logs at all → NOT_APPLICABLE (Day-1 skip or gap)
                status = DoseStatus.NOT_APPLICABLE;
            } else if (dayLogs.every(s => s === 'COMPLETED')) {
                status = DoseStatus.COMPLETED;
            } else if (currentDate < today) {
                // Past day with some non-COMPLETED → MISSED
                status = DoseStatus.MISSED;
            } else {
                // Today with some non-COMPLETED → PENDING
                status = DoseStatus.PENDING;
            }
        }

        days.push({ date: currentDate, dateStr, status });
    }

    return days;
}

// ─── SSoT: STREAK FROM DB ───────────────────────────────────────

/**
 * SSoT query: Counts consecutive COMPLETED days from dose_logs directly.
 * 
 * RULES:
 * - Go backwards from today
 * - Day with ALL dose_logs COMPLETED → streak++
 * - Day with 0 dose_logs → skip (NOT_APPLICABLE, don't break streak)
 * - Today with PENDING → skip (not yet taken)
 * - Day before createdAt → stop
 * - Any MISSED day → break
 */
export async function getStreakFromDB(
    prescriptionId: string,
    createdAt: string
): Promise<StreakResult> {
    const db = await getDB();
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const createdAtDate = new Date(createdAt);
    const createdAtDateOnly = new Date(createdAtDate);
    createdAtDateOnly.setHours(0, 0, 0, 0);

    // Get ALL medication IDs for this prescription
    const medRows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM medications WHERE prescription_id = '${esc(prescriptionId)}'`
    );
    const medIds = medRows.map(r => r.id);

    if (medIds.length === 0) return { count: 0, label: 'Chưa có chuỗi' };

    const medIdsSQL = medIds.map(id => `'${esc(id)}'`).join(',');

    // Get all dose_logs from creation to today
    const createdStr = formatLocalDate(createdAtDateOnly);
    const todayStr = formatLocalDate(today);
    const logs = await db.getAllAsync<{ scheduled_date: string; status: string }>(
        `SELECT scheduled_date, status FROM dose_logs
         WHERE medication_id IN (${medIdsSQL})
         AND scheduled_date >= '${esc(createdStr)}'
         AND scheduled_date <= '${esc(todayStr)}'`
    );

    // Group by date → Map<dateStr, statuses[]>
    const logsByDate = new Map<string, string[]>();
    logs.forEach(log => {
        const existing = logsByDate.get(log.scheduled_date) || [];
        existing.push(log.status);
        logsByDate.set(log.scheduled_date, existing);
    });

    let streak = 0;
    const checkDate = new Date(today);

    while (streak <= 365) {
        if (checkDate < createdAtDateOnly) break;

        const dateStr = formatLocalDate(checkDate);
        const dayLogs = logsByDate.get(dateStr);

        if (!dayLogs || dayLogs.length === 0) {
            // No dose_logs → NOT_APPLICABLE → skip (don't break streak)
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }

        if (dayLogs.every(s => s === 'COMPLETED')) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (checkDate.getTime() === today.getTime()) {
            // Today with PENDING → skip
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        } else {
            // Past day with non-COMPLETED → break
            break;
        }
    }

    const label = streak === 0 ? 'Chưa có chuỗi' : `${streak} ngày liên tiếp`;
    return { count: streak, label };
}

// ─── SSoT: COMPLIANCE FROM DB ───────────────────────────────────

/**
 * Calculates compliance % from DayProgress array (from getWeeklyProgressFromDB).
 * Excludes NOT_APPLICABLE and FUTURE from denominator.
 */
export function calculateComplianceFromDB(weekDays: DayProgress[]): number {
    const validDays = weekDays.filter(
        d => d.status !== DoseStatus.FUTURE && d.status !== DoseStatus.NOT_APPLICABLE
    );
    if (validDays.length === 0) return 0;

    const completedDays = validDays.filter(d => d.status === DoseStatus.COMPLETED).length;
    return Math.round((completedDays / validDays.length) * 100);
}

// ─── QUERY: CONFIRMED MEDS ──────────────────────────────────────

export async function getConfirmedMedsForDate(dateStr: string): Promise<Record<string, string[]>> {
    const db = await getDB();
    const rows = await db.getAllAsync<{
        schedule_id: string;
        slot_key: string;
    }>(
        `SELECT dl.schedule_id, s.slot_key
         FROM dose_logs dl
         JOIN schedules s ON dl.schedule_id = s.id
         WHERE dl.scheduled_date = '${esc(dateStr)}' AND dl.status = 'COMPLETED'`
    );

    const result: Record<string, string[]> = {};
    rows.forEach(row => {
        const key = row.slot_key || 'Unknown';
        if (!result[key]) result[key] = [];
        if (!result[key].includes(row.schedule_id)) {
            result[key].push(row.schedule_id);
        }
    });

    return result;
}

/**
 * Get completed_at timestamps for confirmed dose_logs on a date.
 * Returns schedule_id → completed_at (ms timestamp).
 */
export async function getCompletedAtMapForDate(dateStr: string): Promise<Record<string, number>> {
    const db = await getDB();
    const rows = await db.getAllAsync<{ schedule_id: string; completed_at: number }>(
        `SELECT dl.schedule_id, dl.completed_at
         FROM dose_logs dl
         WHERE dl.scheduled_date = '${esc(dateStr)}' AND dl.status = 'COMPLETED' AND dl.completed_at IS NOT NULL`
    );

    const result: Record<string, number> = {};
    rows.forEach(row => {
        result[row.schedule_id] = row.completed_at;
    });
    return result;
}

/**
 * Confirm specific medicines in a slot for a date.
 */
export async function confirmMedicines(slotKey: string, scheduleIds: string[], dateStr: string): Promise<void> {
    if (scheduleIds.length === 0) return;
    const db = await getDB();

    for (const scheduleId of scheduleIds) {
        // Fast path: UPDATE existing dose_log
        const result = await db.runAsync(
            `UPDATE dose_logs SET status = 'COMPLETED', completed_at = ${Date.now()}
             WHERE schedule_id = '${esc(scheduleId)}' AND scheduled_date = '${esc(dateStr)}'`
        );

        if (result.changes === 0) {
            // Self-healing: dose_log doesn't exist → create it from schedule data
            const schedule = await db.getFirstAsync<{ medication_id: string }>(
                `SELECT medication_id FROM schedules WHERE id = '${esc(scheduleId)}'`
            );
            if (schedule) {
                const logId = `${scheduleId}_${dateStr}`;
                await db.runAsync(
                    `INSERT OR REPLACE INTO dose_logs (id, schedule_id, medication_id, scheduled_date, status, completed_at)
                     VALUES ('${esc(logId)}', '${esc(scheduleId)}', '${esc(schedule.medication_id)}', '${esc(dateStr)}', 'COMPLETED', ${Date.now()})`
                );
                console.log(`MedNote: confirmMedicines self-healed dose_log for schedule ${scheduleId}`);
            } else {
                console.warn(`MedNote: confirmMedicines — schedule ${scheduleId} not found in DB!`);
            }
        }
    }
}

/**
 * Undo confirmation for specific medicines in a slot.
 */
export async function undoConfirmMedicines(slotKey: string, scheduleIds: string[], dateStr: string): Promise<void> {
    const db = await getDB();

    if (scheduleIds.length === 0) {
        // Undo ALL in this slot
        await db.execAsync(
            `UPDATE dose_logs SET status = 'PENDING', completed_at = NULL
             WHERE scheduled_date = '${esc(dateStr)}' AND schedule_id IN (
                 SELECT id FROM schedules WHERE slot_key = '${esc(slotKey)}'
             )`
        );
    } else {
        const idList = scheduleIds.map(id => `'${esc(id)}'`).join(',');
        await db.execAsync(
            `UPDATE dose_logs SET status = 'PENDING', completed_at = NULL
             WHERE schedule_id IN (${idList}) AND scheduled_date = '${esc(dateStr)}'`
        );
    }
}

// ─── QUERY: WEEKLY PROGRESS ──────────────────────────────────────

export async function getWeeklyProgress(
    medicationId: string,
    startDate: string,
    endDate: string,
    createdAt: number
): Promise<DayProgress[]> {
    const db = await getDB();

    const createdAtDate = new Date(createdAt);
    const createdAtDateOnly = new Date(createdAtDate);
    createdAtDateOnly.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await db.getAllAsync<DoseLogRow>(
        `SELECT * FROM dose_logs
         WHERE medication_id = '${esc(medicationId)}'
         AND scheduled_date >= '${esc(startDate)}'
         AND scheduled_date <= '${esc(endDate)}'
         ORDER BY scheduled_date`
    );

    // Build log map: date → best status
    const logMap = new Map<string, string>();
    logs.forEach(log => {
        const existing = logMap.get(log.scheduled_date);
        if (log.status === 'COMPLETED') {
            logMap.set(log.scheduled_date, 'COMPLETED');
        } else if (existing !== 'COMPLETED') {
            logMap.set(log.scheduled_date, log.status);
        }
    });

    const days: DayProgress[] = [];
    const start = new Date(startDate + 'T00:00:00');

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        currentDate.setHours(0, 0, 0, 0);

        const dStr = formatLocalDate(currentDate);
        let status: DoseStatus;

        if (currentDate < createdAtDateOnly) {
            status = DoseStatus.NOT_APPLICABLE;
        } else if (currentDate.getTime() === createdAtDateOnly.getTime()) {
            // Creation day: check logs
            const logStatus = logMap.get(dStr);
            if (logStatus === 'COMPLETED') {
                status = DoseStatus.COMPLETED;
            } else if (logStatus === 'MISSED') {
                status = DoseStatus.MISSED;
            } else if (currentDate < today) {
                // Past creation day with no log → NOT_APPLICABLE (sessions were skipped)
                status = DoseStatus.NOT_APPLICABLE;
            } else {
                status = DoseStatus.PENDING;
            }
        } else if (currentDate > today) {
            status = DoseStatus.FUTURE;
        } else {
            const logStatus = logMap.get(dStr);
            if (logStatus === 'COMPLETED') {
                status = DoseStatus.COMPLETED;
            } else if (logStatus === 'MISSED') {
                status = DoseStatus.MISSED;
            } else if (currentDate < today) {
                status = DoseStatus.MISSED;
            } else {
                status = DoseStatus.PENDING;
            }
        }

        days.push({ date: currentDate, dateStr: dStr, status });
    }

    return days;
}

// ─── QUERY: STREAK ───────────────────────────────────────────────

export async function calculateStreak(
    medicationId: string,
    createdAt: number
): Promise<StreakResult> {
    const db = await getDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const createdAtDate = new Date(createdAt);
    const createdAtDateOnly = new Date(createdAtDate);
    createdAtDateOnly.setHours(0, 0, 0, 0);

    const logs = await db.getAllAsync<{ scheduled_date: string; all_completed: number }>(
        `SELECT scheduled_date,
                MIN(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as all_completed
         FROM dose_logs
         WHERE medication_id = '${esc(medicationId)}'
         GROUP BY scheduled_date
         ORDER BY scheduled_date DESC`
    );

    const logMap = new Map<string, boolean>();
    logs.forEach(log => {
        logMap.set(log.scheduled_date, log.all_completed === 1);
    });

    let streak = 0;
    const checkDate = new Date(today);

    while (streak <= 365) {
        if (checkDate < createdAtDateOnly) break;

        const dStr = formatLocalDate(checkDate);
        const isCompleted = logMap.get(dStr);

        if (isCompleted === true) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (isCompleted === undefined && checkDate.getTime() === today.getTime()) {
            // Today with no log yet (PENDING) → skip, don't break
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        } else if (isCompleted === undefined && checkDate.getTime() === createdAtDateOnly.getTime()) {
            // Creation day with no DoseLogs (Day-1: all sessions skipped) → skip
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        } else {
            break;
        }
    }

    return {
        count: streak,
        label: streak === 0 ? 'Chưa có chuỗi' : `${streak} ngày liên tiếp`,
    };
}

// ─── LEGACY COMPATIBILITY ────────────────────────────────────────

export async function getMedicationLogsLegacy(): Promise<Record<string, Record<string, 'taken' | 'missed'>>> {
    const db = await getDB();

    const meds = await db.getAllAsync<{ id: string; prescription_id: string | null }>(
        `SELECT id, prescription_id FROM medications`
    );

    if (meds.length === 0) return {};

    const allLogs = await db.getAllAsync<{ medication_id: string; scheduled_date: string; status: string }>(
        `SELECT medication_id, scheduled_date, status FROM dose_logs`
    );

    // Group meds by prescription_id
    const medsByPrescription = new Map<string, string[]>();
    meds.forEach(m => {
        const pId = m.prescription_id || m.id;
        if (!medsByPrescription.has(pId)) medsByPrescription.set(pId, []);
        medsByPrescription.get(pId)!.push(m.id);
    });

    const result: Record<string, Record<string, 'taken' | 'missed'>> = {};

    for (const [prescriptionId, medIds] of medsByPrescription) {
        const medIdSet = new Set(medIds);
        const relevantLogs = allLogs.filter(l => medIdSet.has(l.medication_id));

        if (relevantLogs.length === 0) continue;

        const dateMap = new Map<string, string[]>();
        relevantLogs.forEach(log => {
            if (!dateMap.has(log.scheduled_date)) dateMap.set(log.scheduled_date, []);
            dateMap.get(log.scheduled_date)!.push(log.status);
        });

        const dateResult: Record<string, 'taken' | 'missed'> = {};
        dateMap.forEach((statuses, dateStr) => {
            if (statuses.every(s => s === 'COMPLETED')) {
                dateResult[dateStr] = 'taken';
            } else if (statuses.some(s => s === 'MISSED')) {
                dateResult[dateStr] = 'missed';
            }
        });

        if (Object.keys(dateResult).length > 0) {
            result[prescriptionId] = dateResult;
        }
    }

    return result;
}
