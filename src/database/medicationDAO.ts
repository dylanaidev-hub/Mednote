/**
 * ─── Medication DAO ──────────────────────────────────────────────
 * CRUD for medications + schedules. Uses execAsync for batch inserts
 * and runAsync for individual operations.
 */

import { getDB } from './database';
import { MedicineEntry } from '../types/medicine';
import { formatLocalDate, parseSQLiteDate } from '../utils/dateUtils';

// ─── Types ───────────────────────────────────────────────────────

export interface MedicationRow {
    id: string;
    name: string;
    type: string;
    created_at: number;
    prescription_id: string | null;
    hospital: string | null;
    record_title: string | null;
    duration: number;
    start_date: string | null;
    images: string | null;
    note: string | null;
    weekdays: string | null;
    meal_timing: string | null;
}

export interface ScheduleRow {
    id: string;
    medication_id: string;
    time: string;
    dose: number;
    slot_key: string | null;
    unit: string | null;
    created_at: number | null;
}

export interface PrescriptionRecord {
    id: string;
    recordTitle?: string;
    hospital: string;
    date: string;
    duration: number;
    medicines: MedicineEntry[];
    images?: string[];
    createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function normalizeSlotKey(key: string): string {
    if (!key) return 'sáng';
    // Strip _sub_ suffix and lowercase for comparison
    const base = key.split('_sub_')[0].toLowerCase();
    if (base === 'sáng' || base === 'morning') return 'sáng';
    if (base === 'trưa' || base === 'noon') return 'trưa';
    if (base === 'chiều' || base === 'afternoon') return 'chiều';
    if (base === 'tối' || base === 'evening') return 'tối';
    return 'sáng'; // Safe fallback
}

function esc(val: string): string {
    return val.replace(/'/g, "''");
}

/** Convert "HH:mm" string to total minutes since midnight (integer math, no timezone) */
function getMinutesSinceMidnight(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// ─── INSERT ──────────────────────────────────────────────────────

export async function insertPrescription(prescription: PrescriptionRecord): Promise<void> {
    const db = await getDB();
    const createdAtTs = new Date(prescription.createdAt).getTime();
    const imagesJson = prescription.images ? JSON.stringify(prescription.images) : '';
    const type = prescription.duration === 999 ? 'routine' : 'prescription';

    const statements: string[] = [];

    // ─── Day-1 Logic: minutes-since-midnight comparison ───
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes(); // e.g. 00:23 → 23
    const todayStr = formatLocalDate(now);

    for (const med of prescription.medicines) {
        const weekdaysJson = med.weekdays ? JSON.stringify(med.weekdays) : null;
        const weekdaysSql = weekdaysJson ? `'${esc(weekdaysJson)}'` : 'NULL';
        const recordTitleSql = prescription.recordTitle ? `'${esc(prescription.recordTitle)}'` : 'NULL';
        statements.push(
            `INSERT OR REPLACE INTO medications (id, name, type, created_at, prescription_id, hospital, record_title, duration, start_date, images, note, weekdays, meal_timing)
             VALUES ('${esc(med.id)}', '${esc(med.name)}', '${type}', ${createdAtTs}, '${esc(prescription.id)}', '${esc(prescription.hospital)}', ${recordTitleSql}, ${prescription.duration}, '${esc(prescription.date)}', '${esc(imagesJson)}', '${esc(med.note || '')}', ${weekdaysSql}, '${esc(med.mealTiming || '')}')`
        );

        const sessionTimes = med.sessionTimes || {};

        // ★ Weekday Guard for Day-1: skip today's dose_logs if today is not in allowed weekdays
        const todayDayOfWeek = now.getDay(); // 0=Sun..6=Sat
        const skipToday = med.weekdays && med.weekdays.length > 0 && !med.weekdays.includes(todayDayOfWeek);
        if (skipToday) {
            console.log(`MedNote: Day-1 Weekday guard ⛔ ${med.name} → today (day ${todayDayOfWeek}) not in [${med.weekdays}], skipping all dose_logs for today`);
        }

        // Sort sessionTimes entries by time value (ascending) for consistent processing
        const sortedEntries = Object.entries(sessionTimes).sort((a, b) => a[1].localeCompare(b[1]));

        for (const [slot, time] of sortedEntries) {
            const normalizedSlot = normalizeSlotKey(slot);
            // Sub-times need unique schedule IDs to avoid collisions
            const isSubTime = slot.includes('_sub_');
            const scheduleId = isSubTime
                ? `${med.id}_${normalizedSlot}_sub_${slot.split('_sub_')[1]}`
                : `${med.id}_${normalizedSlot}`;
            const dose = parseInt(med.quantity, 10) || 1;

            statements.push(
                `INSERT OR REPLACE INTO schedules (id, medication_id, time, dose, slot_key, unit, created_at)
                 VALUES ('${esc(scheduleId)}', '${esc(med.id)}', '${esc(time)}', ${dose}, '${esc(normalizedSlot)}', '${esc(med.unit || 'viên')}', ${Date.now()})`
            );

            // ── Day-1 dose_log creation (Minutes-Since-Midnight comparison) ──
            if (skipToday) continue; // Weekday guard: don't create dose_log for non-matching day

            const scheduleMinutes = getMinutesSinceMidnight(time); // e.g. "00:05" → 5

            if (scheduleMinutes > currentMinutes) {
                // Session time is in the FUTURE → create PENDING dose_log for today
                const logId = `${scheduleId}_${todayStr}`;
                statements.push(
                    `INSERT OR IGNORE INTO dose_logs (id, schedule_id, medication_id, scheduled_date, status)
                     VALUES ('${esc(logId)}', '${esc(scheduleId)}', '${esc(med.id)}', '${esc(todayStr)}', 'PENDING')`
                );
                console.log(`MedNote: Day-1 ✅ ${med.name} [${normalizedSlot}] ${time} (${scheduleMinutes}min) > now (${currentMinutes}min) → PENDING today`);
            } else {
                // Session time has PASSED → DO NOT create for today, starts tomorrow
                console.log(`MedNote: Day-1 ⏭ ${med.name} [${normalizedSlot}] ${time} (${scheduleMinutes}min) <= now (${currentMinutes}min) → SKIP today`);
            }
        }
    }

    if (statements.length > 0) {
        console.log(`MedNote: insertPrescription → executing ${statements.length} SQL statements`);
        await db.execAsync(statements.join(';\n') + ';');
        // Verify dose_logs were created
        const doseLogCount = await db.getFirstAsync<{ cnt: number }>(
            `SELECT COUNT(*) as cnt FROM dose_logs WHERE scheduled_date = '${esc(todayStr)}'`
        );
        console.log(`MedNote: insertPrescription → dose_logs for today after insert: ${doseLogCount?.cnt ?? 0}`);
    }
}

// ─── UPDATE (Safe Edit — preserves COMPLETED dose_logs) ─────────

export async function updatePrescription(prescription: PrescriptionRecord): Promise<void> {
    const db = await getDB();
    const now = new Date();
    const todayStr = formatLocalDate(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const type = prescription.duration === 999 ? 'routine' : 'prescription';
    const imagesJson = prescription.images ? JSON.stringify(prescription.images) : '';

    const statements: string[] = [];

    for (const med of prescription.medicines) {
        const weekdaysJson = med.weekdays ? JSON.stringify(med.weekdays) : null;
        const weekdaysSql = weekdaysJson ? `'${esc(weekdaysJson)}'` : 'NULL';

        const recordTitleSql = prescription.recordTitle ? `'${esc(prescription.recordTitle)}'` : 'NULL';

        // Step 1: UPSERT medication row (handles both existing + newly-added meds)
        statements.push(
            `INSERT OR REPLACE INTO medications (id, name, type, created_at, prescription_id, hospital, record_title, duration, start_date, images, note, weekdays, meal_timing)
             VALUES ('${esc(med.id)}', '${esc(med.name)}', '${type}',
                     COALESCE((SELECT created_at FROM medications WHERE id = '${esc(med.id)}'), ${Date.now()}),
                     '${esc(prescription.id)}', '${esc(prescription.hospital)}', ${recordTitleSql}, ${prescription.duration}, '${esc(prescription.date)}', '${esc(imagesJson)}', '${esc(med.note || '')}', ${weekdaysSql}, '${esc(med.mealTiming || '')}')`
        );

        // Step 2: DELETE old schedules for this med
        statements.push(
            `DELETE FROM schedules WHERE medication_id = '${esc(med.id)}'`
        );

        // Step 3: DELETE only PENDING future dose_logs (PROTECT COMPLETED!)
        statements.push(
            `DELETE FROM dose_logs
             WHERE medication_id = '${esc(med.id)}'
             AND scheduled_date >= '${esc(todayStr)}'
             AND status = 'PENDING'`
        );

        const sessionTimes = med.sessionTimes || {};

        // Weekday Guard for today
        const todayDayOfWeek = now.getDay();
        const skipToday = med.weekdays && med.weekdays.length > 0 && !med.weekdays.includes(todayDayOfWeek);

        // Sort sessionTimes entries by time value (ascending) for consistent processing
        const sortedEntries = Object.entries(sessionTimes).sort((a, b) => a[1].localeCompare(b[1]));

        // Step 4: Re-create schedules + Day-1 dose_logs (same logic as insertPrescription)
        for (const [slot, time] of sortedEntries) {
            const normalizedSlot = normalizeSlotKey(slot);
            const isSubTime = slot.includes('_sub_');
            const scheduleId = isSubTime
                ? `${med.id}_${normalizedSlot}_sub_${slot.split('_sub_')[1]}`
                : `${med.id}_${normalizedSlot}`;
            const dose = parseInt(med.quantity, 10) || 1;

            statements.push(
                `INSERT OR REPLACE INTO schedules (id, medication_id, time, dose, slot_key, unit, created_at)
                 VALUES ('${esc(scheduleId)}', '${esc(med.id)}', '${esc(time)}', ${dose}, '${esc(normalizedSlot)}', '${esc(med.unit || 'viên')}', ${Date.now()})`
            );

            // Day-1 dose_log creation
            if (skipToday) continue;

            const scheduleMinutes = getMinutesSinceMidnight(time);

            // Check if a COMPLETED log already exists for today (don't overwrite)
            if (scheduleMinutes > currentMinutes) {
                const logId = `${scheduleId}_${todayStr}`;
                statements.push(
                    `INSERT OR IGNORE INTO dose_logs (id, schedule_id, medication_id, scheduled_date, status)
                     VALUES ('${esc(logId)}', '${esc(scheduleId)}', '${esc(med.id)}', '${esc(todayStr)}', 'PENDING')`
                );
                console.log(`MedNote: Edit Day-1 ✅ ${med.name} [${normalizedSlot}] ${time} → PENDING today`);
            } else {
                console.log(`MedNote: Edit Day-1 ⏭ ${med.name} [${normalizedSlot}] ${time} → SKIP (past)`);
            }
        }
    }

    if (statements.length > 0) {
        console.log(`MedNote: updatePrescription → executing ${statements.length} SQL statements`);
        await db.execAsync(statements.join(';\n') + ';');
    }
}

// ─── ARCHIVE (End Treatment — preserves COMPLETED logs) ─────────

export async function archivePrescription(prescriptionId: string): Promise<void> {
    const db = await getDB();
    const todayStr = formatLocalDate(new Date());

    // Get all medication IDs for this prescription
    const meds = await db.getAllAsync<{ id: string; start_date: string }>(
        `SELECT id, start_date FROM medications WHERE prescription_id = '${esc(prescriptionId)}' OR id = '${esc(prescriptionId)}'`
    );

    if (meds.length === 0) return;

    const statements: string[] = [];

    for (const med of meds) {
        // Set duration = 0 as definitive "STOPPED" flag
        // All UI components check duration === 0 first → "Đã dừng"
        const newDuration = 0;

        // Step 1: Shrink duration to end yesterday
        statements.push(
            `UPDATE medications SET duration = ${newDuration} WHERE id = '${esc(med.id)}'`
        );

        // Step 2: Delete PENDING dose_logs from today onward
        statements.push(
            `DELETE FROM dose_logs
             WHERE medication_id = '${esc(med.id)}'
             AND scheduled_date >= '${esc(todayStr)}'
             AND status = 'PENDING'`
        );

        console.log(`MedNote: Archive ${med.id} → duration shrunk to ${newDuration}, PENDING future logs deleted`);
    }

    if (statements.length > 0) {
        await db.execAsync(statements.join(';\n') + ';');
    }
}

// ─── DELETE ──────────────────────────────────────────────────────

export async function deletePrescriptionById(prescriptionId: string): Promise<void> {
    const db = await getDB();
    // Delete dose_logs, schedules, then medications
    await db.execAsync(`
        DELETE FROM dose_logs WHERE medication_id IN (SELECT id FROM medications WHERE prescription_id = '${esc(prescriptionId)}');
        DELETE FROM schedules WHERE medication_id IN (SELECT id FROM medications WHERE prescription_id = '${esc(prescriptionId)}');
        DELETE FROM medications WHERE prescription_id = '${esc(prescriptionId)}';
    `);
}

// ─── QUERY ───────────────────────────────────────────────────────

export async function getAllPrescriptions(): Promise<PrescriptionRecord[]> {
    const db = await getDB();

    const medRows = await db.getAllAsync<MedicationRow>(
        `SELECT * FROM medications ORDER BY created_at ASC`
    );

    if (medRows.length === 0) return [];

    const groups = new Map<string, MedicationRow[]>();
    medRows.forEach(row => {
        const pId = row.prescription_id || row.id;
        if (!groups.has(pId)) groups.set(pId, []);
        groups.get(pId)!.push(row);
    });

    // Get ALL schedules at once (avoid N+1 queries)
    const allSchedules = await db.getAllAsync<ScheduleRow>(
        `SELECT * FROM schedules`
    );

    const prescriptions: PrescriptionRecord[] = [];

    for (const [prescriptionId, meds] of groups) {
        const first = meds[0];
        const medIdSet = new Set(meds.map(m => m.id));

        const scheduleRows = allSchedules.filter(s => medIdSet.has(s.medication_id));

        const medicines: MedicineEntry[] = meds.map(med => {
            const medSchedules = scheduleRows.filter(s => s.medication_id === med.id);
            const sessionTimes: Record<string, string> = {};
            const frequency: string[] = [];

            // Sort by time ASC so earliest time is always the primary slot
            medSchedules.sort((a, b) => a.time.localeCompare(b.time));

            medSchedules.forEach(s => {
                const slotKey = (s.slot_key || '').toLowerCase(); // normalize to lowercase
                if (slotKey) {
                    if (!sessionTimes[slotKey]) {
                        // Primary time slot (earliest time for this session)
                        sessionTimes[slotKey] = s.time;
                        frequency.push(slotKey);
                    } else if (sessionTimes[slotKey] !== s.time) {
                        // Sub-time: same slot_key, different time
                        // Extract ONLY the unique suffix from schedule.id
                        // schedule.id format: "medId_slot_sub_SUFFIX" → we need "SUFFIX"
                        // Or if no _sub_, use full s.id as fallback
                        let subSuffix: string;
                        if (s.id.includes('_sub_')) {
                            // Get everything after the LAST _sub_ (the unique timestamp)
                            const parts = s.id.split('_sub_');
                            subSuffix = parts[parts.length - 1];
                        } else {
                            subSuffix = String(Date.now()) + Math.random().toString(36).slice(2, 6);
                        }
                        const subKey = `${slotKey}_sub_${subSuffix}`;
                        sessionTimes[subKey] = s.time;
                        frequency.push(subKey);
                    }
                    // Skip exact duplicates (same slot_key AND same time)
                }
            });

            // Parse weekdays from DB
            let weekdays: number[] | undefined;
            try {
                weekdays = med.weekdays ? JSON.parse(med.weekdays) : undefined;
            } catch {
                weekdays = undefined;
            }

            return {
                id: med.id,
                name: med.name,
                quantity: String(medSchedules[0]?.dose || 1),
                unit: medSchedules[0]?.unit || 'viên',
                frequency,
                sessionTimes,
                mealTiming: med.meal_timing || undefined,
                note: med.note || '',
                hasError: false,
                source: (med.type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
                prescriptionId: med.prescription_id || undefined,
                weekdays,
            };
        });

        let images: string[] | undefined;
        try {
            images = first.images ? JSON.parse(first.images) : undefined;
        } catch {
            images = undefined;
        }

        prescriptions.push({
            id: prescriptionId,
            recordTitle: first.record_title || undefined,
            hospital: first.hospital || '',
            date: first.start_date || parseSQLiteDate(first.created_at).toISOString(),
            duration: first.duration,
            medicines,
            images,
            createdAt: parseSQLiteDate(first.created_at).toISOString(),
        });
    }

    // Sort prescriptions newest-first (medicines within each are already oldest-first from ASC query)
    prescriptions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return prescriptions;
}

export async function getActiveMedicinesForDate(date: Date): Promise<MedicineEntry[]> {
    const db = await getDB();
    const dateStr = formatLocalDate(date);

    const medRows = await db.getAllAsync<MedicationRow>(
        `SELECT * FROM medications
         WHERE start_date IS NOT NULL
         AND date(start_date) <= date('${dateStr}')
         AND date(start_date, '+' || (duration - 1) || ' days') >= date('${dateStr}')`
    );

    if (medRows.length === 0) return [];

    const allSchedules = await db.getAllAsync<ScheduleRow>(`SELECT * FROM schedules`);

    return medRows.map(med => {
        const medSchedules = allSchedules.filter(s => s.medication_id === med.id);
        const sessionTimes: Record<string, string> = {};
        const frequency: string[] = [];

        medSchedules.forEach(s => {
            if (s.slot_key) {
                if (!sessionTimes[s.slot_key]) {
                    // Primary time slot
                    sessionTimes[s.slot_key] = s.time;
                    frequency.push(s.slot_key.toLowerCase());
                } else {
                    // Sub-time: same slot_key, different time
                    const subKey = `${s.slot_key}_sub_${s.id}`;
                    sessionTimes[subKey] = s.time;
                    frequency.push(subKey);
                }
            }
        });

        return {
            id: med.id,
            name: med.name,
            quantity: String(medSchedules[0]?.dose || 1),
            unit: medSchedules[0]?.unit || 'viên',
            frequency,
            sessionTimes,
            mealTiming: med.meal_timing || undefined,
            note: med.note || '',
            hasError: false,
            source: (med.type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
            prescriptionId: med.prescription_id || undefined,
            status: 'pending' as 'taken' | 'pending',
        };
    });
}
