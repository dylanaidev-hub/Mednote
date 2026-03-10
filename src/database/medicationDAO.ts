/**
 * ─── Medication DAO ──────────────────────────────────────────────
 * CRUD for medications + schedules. Uses execAsync for batch inserts
 * and runAsync for individual operations.
 */

import { getDB } from './database';
import { MedicineEntry } from '../types/medicine';
import { formatLocalDate } from '../utils/dateUtils';

// ─── Types ───────────────────────────────────────────────────────

export interface MedicationRow {
    id: string;
    name: string;
    type: string;
    created_at: number;
    prescription_id: string | null;
    hospital: string | null;
    duration: number;
    start_date: string | null;
    images: string | null;
    note: string | null;
}

export interface ScheduleRow {
    id: string;
    medication_id: string;
    time: string;
    dose: number;
    slot_key: string | null;
    unit: string | null;
}

export interface PrescriptionRecord {
    id: string;
    hospital: string;
    date: string;
    duration: number;
    medicines: MedicineEntry[];
    images?: string[];
    createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function normalizeSlotKey(key: string): string {
    const map: Record<string, string> = {
        'sáng': 'Sáng', 'Sáng': 'Sáng',
        'trưa': 'Trưa', 'Trưa': 'Trưa',
        'chiều': 'Chiều', 'Chiều': 'Chiều',
        'tối': 'Tối', 'Tối': 'Tối',
    };
    return map[key] || key;
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
        statements.push(
            `INSERT OR REPLACE INTO medications (id, name, type, created_at, prescription_id, hospital, duration, start_date, images, note)
             VALUES ('${esc(med.id)}', '${esc(med.name)}', '${type}', ${createdAtTs}, '${esc(prescription.id)}', '${esc(prescription.hospital)}', ${prescription.duration}, '${esc(prescription.date)}', '${esc(imagesJson)}', '${esc(med.note || '')}')`
        );

        const sessionTimes = med.sessionTimes || {};
        for (const [slot, time] of Object.entries(sessionTimes)) {
            const normalizedSlot = normalizeSlotKey(slot);
            const scheduleId = `${med.id}_${normalizedSlot}`;
            const dose = parseInt(med.quantity, 10) || 1;

            statements.push(
                `INSERT OR REPLACE INTO schedules (id, medication_id, time, dose, slot_key, unit)
                 VALUES ('${esc(scheduleId)}', '${esc(med.id)}', '${esc(time)}', ${dose}, '${esc(normalizedSlot)}', '${esc(med.unit || 'viên')}')`
            );

            // ── Day-1 dose_log creation (Minutes-Since-Midnight comparison) ──
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
        `SELECT * FROM medications ORDER BY created_at DESC`
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

            medSchedules.forEach(s => {
                if (s.slot_key) {
                    sessionTimes[s.slot_key] = s.time;
                    frequency.push(s.slot_key.toLowerCase());
                }
            });

            return {
                id: med.id,
                name: med.name,
                quantity: String(medSchedules[0]?.dose || 1),
                unit: medSchedules[0]?.unit || 'viên',
                frequency,
                sessionTimes,
                note: med.note || '',
                hasError: false,
                source: (med.type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
                prescriptionId: med.prescription_id || undefined,
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
            hospital: first.hospital || '',
            date: first.start_date || new Date(first.created_at).toISOString(),
            duration: first.duration,
            medicines,
            images,
            createdAt: new Date(first.created_at).toISOString(),
        });
    }

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
                sessionTimes[s.slot_key] = s.time;
                frequency.push(s.slot_key.toLowerCase());
            }
        });

        return {
            id: med.id,
            name: med.name,
            quantity: String(medSchedules[0]?.dose || 1),
            unit: medSchedules[0]?.unit || 'viên',
            frequency,
            sessionTimes,
            note: med.note || '',
            hasError: false,
            source: (med.type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
            prescriptionId: med.prescription_id || undefined,
            status: 'pending' as 'taken' | 'pending',
        };
    });
}
