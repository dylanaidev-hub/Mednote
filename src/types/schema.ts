/**
 * ─── Database Schema for MedNote ─────────────────────────────────
 * 4 Core Models: User, Medication, Schedule, DoseLog
 * 
 * Designed as TypeScript interfaces for use with AsyncStorage.
 * Can be migrated to Prisma/TypeORM when a backend is introduced.
 */

// ─── Enums ───────────────────────────────────────────────────────

/** Status of a single dose log entry */
export enum DoseStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    MISSED = 'MISSED',
    NOT_APPLICABLE = 'NOT_APPLICABLE', // Date before medication was created
    FUTURE = 'FUTURE',                 // Date hasn't occurred yet
}

// ─── Model: User ─────────────────────────────────────────────────

export interface UserSettings {
    allowNotifications: boolean;
    naggingMode: boolean;
}

export interface User {
    id: string;                        // UUID / CUID
    settings: UserSettings;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
    allowNotifications: true,
    naggingMode: false,
};

// ─── Model: Medication ───────────────────────────────────────────

export interface Medication {
    id: string;                        // UUID
    userId: string;                    // Foreign Key → User.id
    name: string;
    createdAt: string;                 // ISO 8601 datetime — critical for blocking past data
    source?: 'prescription' | 'routine';
    prescriptionId?: string;           // Link back to legacy Prescription if applicable
}

// ─── Model: Schedule ─────────────────────────────────────────────

export interface Schedule {
    id: string;                        // UUID
    medicationId: string;              // Foreign Key → Medication.id
    time: string;                      // Format: "HH:mm" (e.g. "08:00", "12:00")
    dose: number;                      // Number of units per intake
    slotKey?: string;                  // Session identifier: 'Sáng', 'Trưa', 'Chiều', 'Tối'
}

// ─── Model: DoseLog ──────────────────────────────────────────────

export interface DoseLog {
    id: string;                        // UUID
    scheduleId: string;                // Foreign Key → Schedule.id
    userId: string;                    // Foreign Key → User.id (for optimized queries)
    scheduledDate: string;             // Date-only string "YYYY-MM-DD" (no time component)
    status: DoseStatus;                // Default: PENDING
}

// ─── Aggregated View Types ───────────────────────────────────────

/** Represents one day's status in the weekly progress view */
export interface DayProgress {
    date: Date;
    dateStr: string;                   // "YYYY-MM-DD"
    status: DoseStatus;
}

/** Weekly progress result */
export interface WeeklyProgress {
    days: DayProgress[];
    compliance: number;                // 0-100 percentage
    motivationalText: string;
}

/** Streak result */
export interface StreakResult {
    count: number;
    label: string;                     // e.g. "5 ngày liên tiếp"
}
