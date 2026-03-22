import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ────────────────────────────────────────────────────
export interface AppCalendarProps {
    /** 'single' = pick one date, 'range' = pick start→end range */
    mode?: 'single' | 'range';
    /** Currently selected date (single mode) */
    selectedDate?: Date | null;
    /** Range selection dates */
    startDate?: Date | null;
    endDate?: Date | null;
    /** Callback when a date is tapped */
    onDateSelect?: (date: Date) => void;
    /** Callback for range mode */
    onRangeSelect?: (start: Date | null, end: Date | null) => void;
    /** Min selectable date */
    minDate?: Date;
    /** Max selectable date */
    maxDate?: Date;
}

// ─── Constants ─────────────────────────────────────────────────
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_NAMES = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const PRIMARY = '#3B82F6';
const PRIMARY_LIGHT = '#EFF6FF';
const GRAY_400 = '#9CA3AF';
const GRAY_200 = '#E5E7EB';
const NAVY = '#111827';

// ─── Helpers ───────────────────────────────────────────────────
function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function isInRange(date: Date, start: Date, end: Date): boolean {
    const t = date.getTime();
    return t > start.getTime() && t < end.getTime();
}

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/** Returns 0=Mon...6=Sun for the 1st of given month */
function getFirstDayOfWeek(year: number, month: number): number {
    const day = new Date(year, month, 1).getDay(); // 0=Sun
    return day === 0 ? 6 : day - 1; // Convert to 0=Mon
}

// ─── Component ─────────────────────────────────────────────────
export default function AppCalendar({
    mode = 'single',
    selectedDate,
    startDate,
    endDate,
    onDateSelect,
    onRangeSelect,
    minDate,
    maxDate,
}: AppCalendarProps) {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const [viewYear, setViewYear] = useState(
        selectedDate?.getFullYear() || startDate?.getFullYear() || today.getFullYear()
    );
    const [viewMonth, setViewMonth] = useState(
        selectedDate?.getMonth() ?? startDate?.getMonth() ?? today.getMonth()
    );

    // ─── Range selection state ────────────────────────────────
    const [rangeStart, setRangeStart] = useState<Date | null>(startDate || null);
    const [rangeEnd, setRangeEnd] = useState<Date | null>(endDate || null);

    // ─── Navigation ───────────────────────────────────────────
    const goToPrev = useCallback(() => {
        setViewMonth(prev => {
            if (prev === 0) {
                setViewYear(y => y - 1);
                return 11;
            }
            return prev - 1;
        });
    }, []);

    const goToNext = useCallback(() => {
        setViewMonth(prev => {
            if (prev === 11) {
                setViewYear(y => y + 1);
                return 0;
            }
            return prev + 1;
        });
    }, []);

    // ─── Handle date tap ──────────────────────────────────────
    const handleDayPress = useCallback((date: Date) => {
        if (mode === 'single') {
            onDateSelect?.(date);
        } else {
            // Range mode logic
            if (!rangeStart || (rangeStart && rangeEnd)) {
                // First tap or reset
                setRangeStart(date);
                setRangeEnd(null);
                onRangeSelect?.(date, null);
            } else {
                // Second tap
                if (date.getTime() < rangeStart.getTime()) {
                    setRangeStart(date);
                    setRangeEnd(rangeStart);
                    onRangeSelect?.(date, rangeStart);
                } else {
                    setRangeEnd(date);
                    onRangeSelect?.(rangeStart, date);
                }
            }
        }
    }, [mode, rangeStart, rangeEnd, onDateSelect, onRangeSelect]);

    // ─── Build grid ───────────────────────────────────────────
    const calendarGrid = useMemo(() => {
        const totalDays = getDaysInMonth(viewYear, viewMonth);
        const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

        const cells: (Date | null)[] = [];

        // Leading empty cells
        for (let i = 0; i < firstDay; i++) {
            cells.push(null);
        }

        // Day cells
        for (let d = 1; d <= totalDays; d++) {
            cells.push(new Date(viewYear, viewMonth, d));
        }

        // Trailing empty cells to complete last row
        while (cells.length % 7 !== 0) {
            cells.push(null);
        }

        return cells;
    }, [viewYear, viewMonth]);

    // ─── Render ───────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Header: < Month Year > */}
            <View style={styles.header}>
                <TouchableOpacity onPress={goToPrev} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-back" size={20} color={NAVY} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={goToNext} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-forward" size={20} color={NAVY} />
                </TouchableOpacity>
            </View>

            {/* Weekday labels */}
            <View style={styles.weekRow}>
                {WEEKDAY_LABELS.map(label => (
                    <View key={label} style={styles.weekCell}>
                        <Text style={styles.weekLabel}>{label}</Text>
                    </View>
                ))}
            </View>

            {/* Days grid */}
            <View style={styles.daysGrid}>
                {calendarGrid.map((date, idx) => {
                    if (!date) {
                        return <View key={`empty-${idx}`} style={styles.dayCell} />;
                    }

                    const isToday = isSameDay(date, today);
                    const isSelected = mode === 'single' && selectedDate && isSameDay(date, selectedDate);
                    const isRangeStart = mode === 'range' && rangeStart && isSameDay(date, rangeStart);
                    const isRangeEnd = mode === 'range' && rangeEnd && isSameDay(date, rangeEnd);
                    const isInRangeDay = mode === 'range' && rangeStart && rangeEnd && isInRange(date, rangeStart, rangeEnd);

                    const isDisabled = (minDate && date.getTime() < minDate.getTime())
                        || (maxDate && date.getTime() > maxDate.getTime());

                    const isHighlighted = isSelected || isRangeStart || isRangeEnd;

                    return (
                        <TouchableOpacity
                            key={date.toISOString()}
                            style={[
                                styles.dayCell,
                                isInRangeDay && styles.dayCellInRange,
                                isRangeStart && styles.dayCellRangeStart,
                                isRangeEnd && styles.dayCellRangeEnd,
                            ]}
                            onPress={() => !isDisabled && handleDayPress(date)}
                            activeOpacity={isDisabled ? 1 : 0.6}
                            disabled={isDisabled}
                        >
                            <View style={[
                                styles.dayCircle,
                                isHighlighted && styles.dayCircleSelected,
                            ]}>
                                <Text style={[
                                    styles.dayText,
                                    isToday && !isHighlighted && styles.dayTextToday,
                                    isHighlighted && styles.dayTextSelected,
                                    isDisabled && styles.dayTextDisabled,
                                ]}>
                                    {date.getDate()}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingVertical: 8,
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    navBtn: {
        width: 36, height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: NAVY,
    },
    // Weekday row
    weekRow: {
        flexDirection: 'row',
        paddingHorizontal: 4,
        marginBottom: 4,
    },
    weekCell: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 6,
    },
    weekLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: GRAY_400,
    },
    // Days grid
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 4,
    },
    dayCell: {
        width: '14.28%', // 100/7
        alignItems: 'center',
        paddingVertical: 2,
    },
    dayCellInRange: {
        backgroundColor: PRIMARY_LIGHT,
    },
    dayCellRangeStart: {
        backgroundColor: PRIMARY_LIGHT,
        borderTopLeftRadius: 20,
        borderBottomLeftRadius: 20,
    },
    dayCellRangeEnd: {
        backgroundColor: PRIMARY_LIGHT,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
    },
    // Day circle
    dayCircle: {
        width: 36, height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCircleSelected: {
        backgroundColor: PRIMARY,
    },
    // Text
    dayText: {
        fontSize: 14,
        fontWeight: '500',
        color: NAVY,
    },
    dayTextToday: {
        color: PRIMARY,
        fontWeight: '700',
    },
    dayTextSelected: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    dayTextDisabled: {
        opacity: 0.3,
    },
});
