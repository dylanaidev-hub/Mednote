/**
 * ─── Schema Adapter ──────────────────────────────────────────────
 * Converts between legacy data structures (Prescription/MedicineEntry)
 * and the new formal schema (Medication/Schedule/DoseLog).
 * 
 * Ensures backward compatibility — all existing AsyncStorage data
 * continues to work seamlessly.
 */

import { Medication, Schedule, DoseLog, DoseStatus } from '../types/schema';
import { MedicineEntry } from '../types/medicine';

// Re-import Prescription type from MedContext to avoid circular deps
interface LegacyPrescription {
    id: string;
    hospital: string;
    date: string;
    duration: number;
    medicines: MedicineEntry[];
    images?: string[];
    createdAt: string;
}

type MedicationStatus = 'taken' | 'missed';

// ─── Prescription → Medication[] ─────────────────────────────────

/**
 * Convert a single legacy Prescription into an array of Medications.
 * Each MedicineEntry within the prescription becomes one Medication.
 */
export function prescriptionToMedications(
    prescription: LegacyPrescription,
    userId: string = 'default-user'
): Medication[] {
    return prescription.medicines.map(med => ({
        id: med.id,
        userId,
        name: med.name,
        createdAt: prescription.createdAt,
        source: med.source || 'prescription',
        prescriptionId: prescription.id,
    }));
}

// ─── MedicineEntry → Schedule[] ──────────────────────────────────

/**
 * Convert a MedicineEntry's sessionTimes into an array of Schedules.
 * Each session time (e.g. 'Sáng' → '08:00') becomes one Schedule.
 */
export function medicineEntryToSchedules(
    med: MedicineEntry,
    medicationId: string
): Schedule[] {
    const sessionTimes = med.sessionTimes || {};

    return Object.entries(sessionTimes).map(([slotKey, time]) => ({
        id: `${medicationId}_${normalizeSlotKey(slotKey)}`,
        medicationId,
        time,
        dose: parseInt(med.quantity, 10) || 1,
        slotKey: normalizeSlotKey(slotKey),
    }));
}

// ─── Medication Logs → DoseLog[] ─────────────────────────────────

/**
 * Convert the legacy medicationLogs structure into formal DoseLog entries.
 * 
 * Legacy format: Record<prescriptionId, Record<dateStr, 'taken' | 'missed'>>
 * New format:    DoseLog[] with scheduleId, userId, scheduledDate, status
 */
export function medicationLogsToDoseLogs(
    logs: Record<string, Record<string, MedicationStatus>>,
    prescriptions: LegacyPrescription[],
    userId: string = 'default-user'
): DoseLog[] {
    const doseLogs: DoseLog[] = [];

    for (const [prescriptionId, dateLogs] of Object.entries(logs)) {
        const prescription = prescriptions.find(p => p.id === prescriptionId);
        if (!prescription) continue;

        for (const [dateStr, status] of Object.entries(dateLogs)) {
            // Create one DoseLog per medicine in the prescription for this date
            prescription.medicines.forEach(med => {
                const schedules = medicineEntryToSchedules(med, med.id);
                schedules.forEach(schedule => {
                    doseLogs.push({
                        id: `${schedule.id}_${dateStr}`,
                        scheduleId: schedule.id,
                        userId,
                        scheduledDate: dateStr,
                        status: status === 'taken' ? DoseStatus.COMPLETED : DoseStatus.MISSED,
                    });
                });
            });
        }
    }

    return doseLogs;
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
