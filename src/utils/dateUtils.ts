export const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Safe Date parser for SQLite values.
 * Handles: Date objects, ms timestamps, second timestamps (×1000), ISO strings, space-separated date strings.
 */
export const parseSQLiteDate = (dbDate: string | number | Date): Date => {
    if (!dbDate) return new Date();
    if (dbDate instanceof Date) return dbDate;

    if (typeof dbDate === 'number') {
        // If timestamp is 10 digits (seconds), multiply by 1000 to get ms for JS
        return new Date(dbDate < 10000000000 ? dbDate * 1000 : dbDate);
    }

    if (typeof dbDate === 'string') {
        // Fix Invalid Date on iOS: replace space with 'T'
        const safeDateStr = dbDate.replace(' ', 'T');
        return new Date(safeDateStr);
    }
    return new Date();
};

// ─── Frequency Formatter ──────────────────────────────────────────
const DAY_LABELS: Record<number, string> = {
    0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7',
};

/**
 * Format weekdays array into a readable Vietnamese frequency string.
 * @param weekdays - JS Date.getDay() values: 0=CN, 1=T2...6=T7
 * @returns "Uống mỗi ngày" | "T2, T4, T6, CN"
 */
export function formatFrequency(weekdays?: number[]): string {
    if (!weekdays || weekdays.length === 0 || weekdays.length === 7) {
        return 'Uống mỗi ngày';
    }
    // Sort by weekday order: T2 → T3 → ... → T7 → CN
    const sorted = [...weekdays].sort((a, b) => {
        const orderA = a === 0 ? 7 : a; // CN last
        const orderB = b === 0 ? 7 : b;
        return orderA - orderB;
    });
    return sorted.map(d => DAY_LABELS[d] || `?`).join(', ');
}

// ─── Prescription Status ──────────────────────────────────────────
export type PrescriptionStatus = 'stopped' | 'upcoming' | 'active' | 'completed';

export interface StatusDisplay {
    status: PrescriptionStatus;
    label: string;
    badgeVariant: 'info' | 'success' | 'warning' | 'danger' | 'default' | 'purple';
    // Legacy Tailwind classes (kept for gradual migration)
    badgeBg: string;
    badgeText: string;
}

/**
 * Single source of truth for prescription status.
 * Normalizes dates to midnight before comparing.
 */
export function getPrescriptionStatus(
    dateStr: string,
    duration: number,
    isRoutine: boolean,
): StatusDisplay {
    if (duration === 0) {
        return { status: 'stopped', label: 'Đã dừng', badgeVariant: 'danger', badgeBg: 'bg-red-50', badgeText: 'text-red-600' };
    }

    if (isRoutine) {
        return { status: 'active', label: 'Đang uống', badgeVariant: 'purple', badgeBg: 'bg-purple-50', badgeText: 'text-purple-600' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(dateStr + 'T00:00:00');
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + duration - 1);
    end.setHours(23, 59, 59, 999);

    if (today < start) {
        return { status: 'upcoming', label: 'Sắp tới', badgeVariant: 'warning', badgeBg: 'bg-amber-50', badgeText: 'text-amber-600' };
    }
    if (today > end) {
        return { status: 'completed', label: 'Đã hoàn thành', badgeVariant: 'success', badgeBg: 'bg-green-50', badgeText: 'text-green-600' };
    }
    return { status: 'active', label: 'Đang điều trị', badgeVariant: 'info', badgeBg: 'bg-blue-50', badgeText: 'text-blue-600' };
}
