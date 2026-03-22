import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
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
    /** Fires when month/year picker is shown or hidden */
    onPickerToggle?: (isOpen: boolean) => void;
}

// ─── Constants ─────────────────────────────────────────────────
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_NAMES = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
const MONTH_SHORT = [
    'Th.1', 'Th.2', 'Th.3', 'Th.4', 'Th.5', 'Th.6',
    'Th.7', 'Th.8', 'Th.9', 'Th.10', 'Th.11', 'Th.12',
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
    onPickerToggle,
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

    // ─── Month/Year picker state ──────────────────────────────
    const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(viewYear);

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

    // ─── Toggle month/year picker ─────────────────────────────
    const toggleMonthYearPicker = useCallback(() => {
        setShowMonthYearPicker(prev => {
            const next = !prev;
            if (next) setPickerYear(viewYear);
            onPickerToggle?.(next);
            return next;
        });
    }, [viewYear, onPickerToggle]);

    const selectMonth = useCallback((month: number) => {
        setViewMonth(month);
        setViewYear(pickerYear);
        setShowMonthYearPicker(false);
        onPickerToggle?.(false);
    }, [pickerYear, onPickerToggle]);

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

    // ─── Build grid (always 42 cells = 6 rows) ─────────────────
    interface GridCell { date: Date; isOutside: boolean; }
    const calendarGrid = useMemo((): GridCell[] => {
        const totalDays = getDaysInMonth(viewYear, viewMonth);
        const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
        const cells: GridCell[] = [];

        // Leading cells from previous month
        const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
        const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
        const prevMonthDays = getDaysInMonth(prevYear, prevMonth);
        for (let i = firstDay - 1; i >= 0; i--) {
            cells.push({ date: new Date(prevYear, prevMonth, prevMonthDays - i), isOutside: true });
        }

        // Current month cells
        for (let d = 1; d <= totalDays; d++) {
            cells.push({ date: new Date(viewYear, viewMonth, d), isOutside: false });
        }

        // Trailing cells from next month (fill to 42)
        const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        let nextDay = 1;
        while (cells.length < 42) {
            cells.push({ date: new Date(nextYear, nextMonth, nextDay++), isOutside: true });
        }

        return cells;
    }, [viewYear, viewMonth]);

    // ─── Render ───────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Header: < Month Year ▼ > */}
            <View style={styles.header}>
                <TouchableOpacity onPress={goToPrev} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-back" size={20} color={NAVY} />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={toggleMonthYearPicker}
                    style={styles.headerTitleBtn}
                    activeOpacity={0.6}
                >
                    <Text style={styles.headerTitle}>
                        {MONTH_NAMES[viewMonth]} {viewYear}
                    </Text>
                    <Ionicons
                        name={showMonthYearPicker ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={PRIMARY}
                        style={{ marginLeft: 4 }}
                    />
                </TouchableOpacity>
                <TouchableOpacity onPress={goToNext} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-forward" size={20} color={NAVY} />
                </TouchableOpacity>
            </View>

            {showMonthYearPicker ? (
                /* ═══ Month/Year Selector ═══ */
                <View style={styles.pickerContainer}>
                    {/* Year navigation */}
                    <View style={styles.yearRow}>
                        <TouchableOpacity onPress={() => setPickerYear(y => y - 1)} style={styles.yearArrow}>
                            <Ionicons name="chevron-back" size={18} color={NAVY} />
                        </TouchableOpacity>
                        <Text style={styles.yearText}>{pickerYear}</Text>
                        <TouchableOpacity onPress={() => setPickerYear(y => y + 1)} style={styles.yearArrow}>
                            <Ionicons name="chevron-forward" size={18} color={NAVY} />
                        </TouchableOpacity>
                    </View>

                    {/* Month grid 4×3 */}
                    <View style={styles.monthGrid}>
                        {MONTH_SHORT.map((label, idx) => {
                            const isCurrentMonth = idx === viewMonth && pickerYear === viewYear;
                            const isTodayMonth = idx === today.getMonth() && pickerYear === today.getFullYear();
                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[
                                        styles.monthCell,
                                        isCurrentMonth && styles.monthCellActive,
                                    ]}
                                    onPress={() => selectMonth(idx)}
                                    activeOpacity={0.6}
                                >
                                    <Text style={[
                                        styles.monthCellText,
                                        isTodayMonth && !isCurrentMonth && styles.monthCellTextToday,
                                        isCurrentMonth && styles.monthCellTextActive,
                                    ]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            ) : (
                /* ═══ Days Grid ═══ */
                <>
                    {/* Weekday labels */}
                    <View style={styles.weekRow}>
                        {WEEKDAY_LABELS.map(label => (
                            <View key={label} style={styles.weekCell}>
                                <Text style={styles.weekLabel}>{label}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Days grid — fixed 6 rows */}
                    <View style={styles.daysGrid}>
                        {calendarGrid.map((cell, idx) => {
                            const { date, isOutside } = cell;

                            const isToday = !isOutside && isSameDay(date, today);
                            const isSelected = !isOutside && mode === 'single' && selectedDate && isSameDay(date, selectedDate);
                            const isRangeStart = !isOutside && mode === 'range' && rangeStart && isSameDay(date, rangeStart);
                            const isRangeEnd = !isOutside && mode === 'range' && rangeEnd && isSameDay(date, rangeEnd);
                            const isInRangeDay = !isOutside && mode === 'range' && rangeStart && rangeEnd && isInRange(date, rangeStart, rangeEnd);

                            const isDisabled = isOutside
                                || (minDate && date.getTime() < minDate.getTime())
                                || (maxDate && date.getTime() > maxDate.getTime());

                            const isHighlighted = isSelected || isRangeStart || isRangeEnd;

                            return (
                                <TouchableOpacity
                                    key={`${date.getTime()}-${idx}`}
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
                                            isOutside && styles.dayTextOutside,
                                            isToday && !isHighlighted && styles.dayTextToday,
                                            isHighlighted && styles.dayTextSelected,
                                            !isOutside && isDisabled && styles.dayTextDisabled,
                                        ]}>
                                            {date.getDate()}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            )}
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
    headerTitleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
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
    dayTextOutside: {
        color: '#D1D5DB',
    },
    // ─── Month/Year Picker ────────────────────────────────────
    pickerContainer: {
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    yearRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 16,
        paddingVertical: 4,
    },
    yearArrow: {
        width: 32, height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    yearText: {
        fontSize: 20,
        fontWeight: '800',
        color: NAVY,
        minWidth: 60,
        textAlign: 'center',
    },
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    monthCell: {
        width: '30.5%',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    monthCellActive: {
        backgroundColor: PRIMARY,
    },
    monthCellText: {
        fontSize: 14,
        fontWeight: '600',
        color: NAVY,
    },
    monthCellTextToday: {
        color: PRIMARY,
        fontWeight: '700',
    },
    monthCellTextActive: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
});
