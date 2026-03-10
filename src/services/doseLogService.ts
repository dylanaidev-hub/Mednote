/**
 * ─── Dose Log Service ────────────────────────────────────────────
 * Core Business Logic for medication tracking.
 * 
 * 3 mandatory functions:
 * 1. fetchWeeklyProgress — Weekly day-by-day status with createdAt guard
 * 2. calculateStreak     — Consecutive days count with today-skip rule
 * 3. calculateComplianceRate — Percentage based on valid days only
 */

import { DoseStatus, DayProgress, WeeklyProgress, StreakResult } from '../types/schema';
import { formatLocalDate } from '../utils/dateUtils';

// ─── Types expected from the caller ──────────────────────────────

type MedicationStatus = 'taken' | 'missed';

interface DoseLogServiceParams {
    /** Legacy medication logs: Record<prescriptionId, Record<dateStr, status>> */
    medicationLogs: Record<string, Record<string, MedicationStatus>>;
    /** The prescription ID being queried */
    prescriptionId: string;
    /** ISO string of when the medication/prescription was created */
    createdAt: string;
    /** Current date reference (for testability) */
    now?: Date;
}

// ─── Logic 1: Fetch Weekly Progress ──────────────────────────────

/**
 * Returns the status for each day in a given week range.
 * 
 * RULES:
 * - If currentDate < Medication.createdAt → NOT_APPLICABLE
 * - If currentDate > today → FUTURE  
 * - If log shows 'taken' → COMPLETED
 * - If log shows 'missed' → MISSED
 * - If past date with no log → MISSED
 * - Otherwise → PENDING
 * 
 * @param params - Core data parameters
 * @param startDate - Monday of the target week
 * @param endDate - Sunday of the target week
 */
export function fetchWeeklyProgress(
    params: DoseLogServiceParams,
    startDate: Date,
    endDate: Date
): DayProgress[] {
    const { medicationLogs, prescriptionId, createdAt, now: nowOverride } = params;
    const now = nowOverride || new Date();

    const createdAtDate = new Date(createdAt);
    const createdAtDateOnly = new Date(createdAtDate);
    createdAtDateOnly.setHours(0, 0, 0, 0);

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const days: DayProgress[] = [];

    // Iterate 7 days from startDate
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        currentDate.setHours(0, 0, 0, 0);

        const dateStr = formatLocalDate(currentDate);

        let status: DoseStatus;

        if (currentDate < createdAtDateOnly) {
            // ★ Rule: Date before medication creation → NOT_APPLICABLE
            status = DoseStatus.NOT_APPLICABLE;
        } else if (currentDate.getTime() === createdAtDateOnly.getTime()) {
            // ★ Rule: Creation day — check if there are any active logs
            const log = medicationLogs[prescriptionId]?.[dateStr];

            if (log === 'taken') {
                status = DoseStatus.COMPLETED;
            } else if (log === 'missed') {
                status = DoseStatus.MISSED;
            } else if (currentDate < today) {
                // Past creation day with no log:
                // If created late in the day, sessions may have been skipped → NOT_APPLICABLE
                // Otherwise → MISSED
                // Conservative: if no log at all for creation day, mark NOT_APPLICABLE
                // (the system didn't generate dose logs for past sessions on creation day)
                status = DoseStatus.NOT_APPLICABLE;
            } else {
                // Today is creation day, no log yet → PENDING (there may be future sessions)
                status = DoseStatus.PENDING;
            }
        } else if (currentDate > today) {
            // Future date
            status = DoseStatus.FUTURE;
        } else {
            // Check real logs
            const log = medicationLogs[prescriptionId]?.[dateStr];

            if (log === 'taken') {
                status = DoseStatus.COMPLETED;
            } else if (log === 'missed') {
                status = DoseStatus.MISSED;
            } else if (currentDate < today) {
                // Past date with no log = missed
                status = DoseStatus.MISSED;
            } else {
                // Today, no log yet
                status = DoseStatus.PENDING;
            }
        }

        days.push({ date: currentDate, dateStr, status });
    }

    return days;
}

// ─── Logic 2: Calculate Streak ───────────────────────────────────

/**
 * Counts consecutive days of COMPLETED status, going backwards from today.
 * 
 * RULES:
 * - Start from today, go backwards day by day.
 * - If all DoseLogs for a day are COMPLETED → streak++
 * - If a day has MISSED → break the loop, return streak.
 * - EXCEPTION: If today is entirely PENDING (not yet taken),
 *   DO NOT break. Skip today and continue counting from yesterday.
 * - EXCEPTION: If the day is the creation date AND has no log
 *   (Day-1 Logic: all sessions were skipped), skip it entirely.
 * - Safety cap at 365 days.
 */
export function calculateStreak(params: DoseLogServiceParams): StreakResult {
    const { medicationLogs, prescriptionId, createdAt, now: nowOverride } = params;
    const now = nowOverride || new Date();

    const createdAtDate = new Date(createdAt);
    const createdAtDateOnly = new Date(createdAtDate);
    createdAtDateOnly.setHours(0, 0, 0, 0);

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    let streak = 0;
    const checkDate = new Date(today);

    while (streak <= 365) {
        // Don't count days before the medication was created
        if (checkDate < createdAtDateOnly) break;

        const dateStr = formatLocalDate(checkDate);
        const log = medicationLogs[prescriptionId]?.[dateStr];

        if (log === 'taken') {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            // If it's today and not yet taken (PENDING), skip today
            if (checkDate.getTime() === today.getTime()) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            // If it's the creation day and no log exists (Day-1: all sessions skipped),
            // skip it — don't break the streak
            if (checkDate.getTime() === createdAtDateOnly.getTime() && !log) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            // Any other day without 'taken' → break
            break;
        }
    }

    const label = streak === 0
        ? 'Chưa có chuỗi'
        : `${streak} ngày liên tiếp`;

    return { count: streak, label };
}

// ─── Logic 3: Calculate Compliance Rate ──────────────────────────

/**
 * Calculates the medication compliance percentage for the given week.
 * 
 * RULES:
 * - validDays = number of days from Medication.createdAt to today (max 7)
 *   → Excludes NOT_APPLICABLE and FUTURE days
 * - completedDays = number of days with COMPLETED status
 * - Rate = (completedDays / validDays) * 100
 * - Returns 0 if no valid days exist
 */
export function calculateComplianceRate(
    weekDays: DayProgress[]
): number {
    const validDays = weekDays.filter(
        d => d.status !== DoseStatus.FUTURE && d.status !== DoseStatus.NOT_APPLICABLE
    );

    if (validDays.length === 0) return 0;

    const completedDays = validDays.filter(
        d => d.status === DoseStatus.COMPLETED
    ).length;

    return Math.round((completedDays / validDays.length) * 100);
}

// ─── Helper: Get Motivational Text ───────────────────────────────

export function getMotivationalText(compliance: number): string {
    if (compliance === 100) return 'Xuất sắc!';
    if (compliance >= 80) return 'Khá tốt!';
    if (compliance >= 50) return 'Cố gắng lên nhé!';
    if (compliance > 0) return 'Hãy kiên trì hơn!';
    return 'Bắt đầu nào!';
}

// ─── Helper: Get Week Days for Offset ────────────────────────────

/**
 * Returns an array of 7 dates (Monday→Sunday) for the given week offset.
 * Offset 0 = current week, -1 = last week, +1 = next week.
 */
export function getWeekDays(offset: number = 0, referenceDate?: Date): Date[] {
    const start = new Date(referenceDate || new Date());
    const day = start.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // Adjust to Monday
    start.setDate(start.getDate() + diff + (offset * 7));
    start.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
    });
}
