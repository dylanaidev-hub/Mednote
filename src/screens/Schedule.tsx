/**
 * Schedule.tsx
 * "Lịch uống thuốc" – Vertical Timeline design
 *
 * Sections:
 *  1. Weekly calendar strip (swipeable by week)
 *  2. Daily adherence summary card (progress ring)
 *  3. Vertical Timeline (Sáng/Trưa/Chiều/Tối) with past/active/future states
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Easing, AppState, AppStateStatus,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import TimelineCard from '../components/TimelineCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { useMedContext, Prescription, MedicationStatus } from '../context/MedContext';
import { MedicineEntry } from '../types/medicine';
import { useToast } from '../context/ToastContext';
import {
    DoseSession,
} from '../components/DoseSessionCard';
import { NotificationService } from '../services/notificationService';
import { formatLocalDate } from '../utils/dateUtils';
import {
    getDoseSessionsForDate as sqlGetDoseSessionsForDate,
    ensureAllDoseLogsForDate as sqlEnsureAllTodayDoseLogs,
    DoseSessionRow,
} from '../database/doseLogDAO';

// ─── Spacing tokens ───────────────────────────────────────────────
const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// ─── Helpers ─────────────────────────────────────────────────────

/** day-only Date (strips time) */
const dayStart = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
};

/** ISO date string YYYY-MM-DD */
const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday of the week containing d */
const weekStart = (d: Date) => {
    const c = dayStart(d);
    const day = c.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day; // shift to Monday
    c.setDate(c.getDate() + diff);
    return c;
};

/** Array of 7 Date objects for the week starting at mon */
const weekDays = (mon: Date): Date[] =>
    Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
    });

const VI_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const VI_MON = ['Th.1', 'Th.2', 'Th.3', 'Th.4', 'Th.5', 'Th.6', 'Th.7', 'Th.8', 'Th.9', 'Th.10', 'Th.11', 'Th.12'];

/**
 * Convert DoseSessionRow[] from DB into flat MedicineEntry[] + doseLogIdMap.
 */
function doseSessionRowsToMedicines(rows: DoseSessionRow[]): { medicines: MedicineEntry[], doseLogIdMap: Record<string, string> } {
    const doseLogIdMap: Record<string, string> = {};

    const medicines: MedicineEntry[] = rows.map(row => {
        if (row.schedule_id && row.dose_log_id) {
            doseLogIdMap[row.schedule_id] = row.dose_log_id;
        }

        const slotKey = (row.slot_key || 'sáng').toLowerCase();

        return {
            id: row.dose_log_id,
            name: row.med_name,
            quantity: String(row.dose),
            unit: row.unit || 'viên',
            frequency: [slotKey],
            sessionTimes: { [slotKey]: row.time },
            mealTiming: row.meal_timing || undefined,
            note: row.note || '',
            hasError: false,
            source: (row.med_type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
            prescriptionId: row.prescription_id || undefined,
            _doseLogId: row.dose_log_id,
        } as any;
    });

    return { medicines, doseLogIdMap };
}

// ─── Slot lookup from hour ───────────────────────────────────────
function slotFromHour(hour: number): string {
    if (hour < 11) return 'sáng';
    if (hour < 15) return 'trưa';
    if (hour < 19) return 'chiều';
    return 'tối';
}

interface TimeGroup {
    time: string;
    medicines: MedicineEntry[];
}

interface SessionGroup extends DoseSession {
    timeGroups: TimeGroup[];
}

const SLOT_ORDER: Record<string, number> = { 'sáng': 0, 'trưa': 1, 'chiều': 2, 'tối': 3 };

const SLOT_META: Record<string, { label: string; icon: string; iconColor: string }> = {
    'sáng': { label: 'Sáng', icon: 'weather-sunny', iconColor: '#f59e0b' },
    'trưa': { label: 'Trưa', icon: 'weather-partly-cloudy', iconColor: '#f97316' },
    'chiều': { label: 'Chiều', icon: 'weather-sunset', iconColor: '#ef4444' },
    'tối': { label: 'Tối', icon: 'moon-waning-crescent', iconColor: '#6366f1' },
};

/**
 * 2-level grouping: Session (Sáng/Trưa/Chiều/Tối) → Time (08:00, 09:00…)
 */
function groupBySession(
    rows: DoseSessionRow[],
): { sessions: SessionGroup[], completedAtMap: Record<string, number> } {
    const completedAtMap: Record<string, number> = {};

    // Level 1: group by session slot
    const slotGroups = new Map<string, Map<string, DoseSessionRow[]>>();

    rows.forEach(row => {
        const time = row.time || '08:00';
        const [hStr] = time.split(':');
        const slot = slotFromHour(parseInt(hStr, 10));

        if (!slotGroups.has(slot)) slotGroups.set(slot, new Map());
        const timeMap = slotGroups.get(slot)!;
        if (!timeMap.has(time)) timeMap.set(time, []);
        timeMap.get(time)!.push(row);

        if (row.status === 'COMPLETED' && row.completed_at && row.dose_log_id) {
            completedAtMap[row.dose_log_id] = row.completed_at;
        }
    });

    // Build SessionGroup[] sorted by slot order
    const sessions: SessionGroup[] = [...slotGroups.entries()]
        .sort((a, b) => (SLOT_ORDER[a[0]] ?? 99) - (SLOT_ORDER[b[0]] ?? 99))
        .map(([slot, timeMap]) => {
            const meta = SLOT_META[slot] || SLOT_META['sáng'];

            // Level 2: time groups sorted chronologically
            const timeGroups: TimeGroup[] = [...timeMap.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([time, group]) => ({
                    time,
                    medicines: group.map(row => ({
                        id: row.dose_log_id,
                        name: row.med_name,
                        quantity: String(row.dose),
                        unit: row.unit || 'viên',
                        frequency: [slot],
                        sessionTimes: { [slot]: time },
                        mealTiming: row.meal_timing || undefined,
                        note: row.note || '',
                        hasError: false,
                        source: (row.med_type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
                        prescriptionId: row.prescription_id || undefined,
                        _doseLogId: row.dose_log_id,
                    } as any)),
                }));

            const allMeds = timeGroups.flatMap(tg => tg.medicines);
            const firstTime = timeGroups[0]?.time || '08:00';
            const [h] = firstTime.split(':');

            return {
                slotKey: slot,
                label: meta.label,
                icon: meta.icon,
                iconColor: meta.iconColor,
                time: firstTime,
                hour: parseInt(h, 10),
                medicines: allMeds,
                timeGroups,
            };
        });

    return { sessions, completedAtMap };
}

// ─── Slot display config ─────────────────────────────────────────
const SLOT_DISPLAY: Record<string, { label: string; time: string; icon: string; iconColor: string }> = {
    'sáng': { label: 'Sáng', time: '08:00', icon: 'weather-sunny', iconColor: '#f59e0b' },
    'trưa': { label: 'Trưa', time: '12:00', icon: 'weather-partly-cloudy', iconColor: '#f97316' },
    'chiều': { label: 'Chiều', time: '18:00', icon: 'weather-sunset', iconColor: '#ef4444' },
    'tối': { label: 'Tối', time: '21:00', icon: 'moon-waning-crescent', iconColor: '#6366f1' },
};

// ─── Animated Progress Ring ───────────────────────────────────────

interface RingProps {
    progress: number;
    size: number;
    strokeWidth: number;
    color: string;
    bg: string;
}

const ProgressRing = ({ progress, size, strokeWidth, color, bg }: RingProps) => {
    const animVal = useRef(new Animated.Value(0)).current;
    const radius = (size - strokeWidth) / 2;

    useEffect(() => {
        Animated.timing(animVal, {
            toValue: progress,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const pct = Math.round(progress * 100);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
                width: size, height: size, borderRadius: size / 2,
                borderWidth: strokeWidth, borderColor: bg,
                alignItems: 'center', justifyContent: 'center',
                position: 'absolute',
            }} />
            {progress > 0 && (
                <View style={{
                    width: size, height: size, borderRadius: size / 2,
                    borderWidth: strokeWidth,
                    borderColor: 'transparent',
                    borderTopColor: color,
                    borderRightColor: progress > 0.25 ? color : 'transparent',
                    borderBottomColor: progress > 0.5 ? color : 'transparent',
                    borderLeftColor: progress > 0.75 ? color : 'transparent',
                    transform: [{ rotate: '-90deg' }],
                    position: 'absolute',
                }} />
            )}
            <Text style={{ fontSize: size * 0.22, fontWeight: '800', color: pct >= 100 ? color : '#1f2937' }}>
                {pct}%
            </Text>
        </View>
    );
};

// ─── Timeline Node ───────────────────────────────────────────────

type NodeState = 'done' | 'done_late' | 'active' | 'upcoming' | 'future' | 'incomplete';

const TimelineNode = ({ state }: { state: NodeState }) => {
    const pulseAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (state === 'active') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1500,
                        easing: Easing.out(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 0,
                        duration: 0,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
        return () => pulseAnim.stopAnimation();
    }, [state]);

    if (state === 'done') {
        return <View style={[tl.node, tl.nodeDone]} />;
    }
    if (state === 'done_late') {
        return <View style={[tl.node, tl.nodeDoneLate]} />;
    }
    if (state === 'active') {
        return (
            <View style={[tl.node, tl.nodeActiveHalo]}>
                <Animated.View style={{
                    position: 'absolute',
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: 'rgba(37, 99, 235, 0.4)',
                    transform: [{
                        scale: pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.2],
                        }),
                    }],
                    opacity: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 0],
                    }),
                }} />
                <View style={tl.nodeActiveInner} />
            </View>
        );
    }
    if (state === 'incomplete') {
        return <View style={[tl.node, tl.nodeIncomplete]} />;
    }
    // upcoming / future
    return <View style={[tl.node, tl.nodeDefault]} />;
};

// ─── Main Screen ──────────────────────────────────────────────────

export default function Schedule() {
    const { records, confirmedMedsToday, updateConfirmedMed, medicationLogs, updateMedicationLog } = useMedContext();
    const { showToast } = useToast();
    const insets = useSafeAreaInsets();

    const today = dayStart(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(today);
    const [weekBase, setWeekBase] = useState<Date>(weekStart(today));
    const [doseSessions, setDoseSessions] = useState<DoseSessionRow[]>([]);

    const confirmedSlots = confirmedMedsToday;
    const days = weekDays(weekBase);

    // ── SSoT: Load dose sessions from dose_logs table ──────────
    useEffect(() => {
        const loadDoseSessions = async () => {
            const dateStr = formatLocalDate(selectedDate);
            await sqlEnsureAllTodayDoseLogs(dateStr);
            const rows = await sqlGetDoseSessionsForDate(dateStr);
            setDoseSessions(rows);
        };
        loadDoseSessions();
    }, [selectedDate, records, confirmedSlots]);

    // ── Re-fetch when tab gains focus OR app resumes from background ──
    useFocusEffect(
        useCallback(() => {
            const reload = async () => {
                // Ensure dose_logs exist for selected date (generates for new meds)
                const dateStr = formatLocalDate(selectedDate);
                await sqlEnsureAllTodayDoseLogs(dateStr);
                const rows = await sqlGetDoseSessionsForDate(dateStr);
                setDoseSessions(rows);

                // Refresh weekly dots (ensure + query for each day)
                const dotCache: Record<string, any> = {};
                for (const d of days) {
                    const dStr = formatLocalDate(d);
                    await sqlEnsureAllTodayDoseLogs(dStr);
                    const dRows = await sqlGetDoseSessionsForDate(dStr);
                    dotCache[dStr] = getDailyAggregatedStatus(dRows, dStr);
                }
                setDayDotsCache(dotCache);
            };
            reload();
        }, [selectedDate, weekBase])
    );

    // ── AppState listener: re-fetch data when app comes back from background ──
    useEffect(() => {
        const appStateRef = { current: AppState.currentState };
        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextState === 'active'
            ) {
                const reload = async () => {
                    const dateStr = formatLocalDate(selectedDate);
                    const rows = await sqlGetDoseSessionsForDate(dateStr);
                    setDoseSessions(rows);
                };
                reload();
            }
            appStateRef.current = nextState;
        });
        return () => sub.remove();
    }, [selectedDate]);

    // ── Group DB rows by session → time sub-groups ────────
    const { sessions, completedAtMap } = useMemo(
        () => groupBySession(doseSessions),
        [doseSessions]
    );

    // ── Priority-based daily status indicator for calendar strip ──
    type DailyStatus = 'action_required' | 'in_progress' | 'all_clear' | 'none' | 'future';

    const getDailyAggregatedStatus = (rows: { status: string; time?: string }[], dateStr: string): DailyStatus => {
        if (rows.length === 0) return 'none';
        // Future dates → no status indicator (not yet actionable)
        const todayStr = formatLocalDate(new Date());
        if (dateStr > todayStr) return 'future';
        // PRIORITY 1: Any explicitly MISSED → needs action
        if (rows.some(r => r.status === 'MISSED')) return 'action_required';

        // PRIORITY 1b: PENDING past session deadline → overdue, needs action
        // Each session has a deadline (end of the dosing window), not just the exact schedule time
        const SESSION_DEADLINES: Record<string, number> = {
            'sáng': 720,    // 12:00
            'trưa': 840,    // 14:00
            'chiều': 1080,  // 18:00
            'tối': 1439,    // 23:59
        };
        const FALLBACK_GRACE_MINUTES = 120; // 2 hours grace if no slot_key match

        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        const isDatePast = dateStr < todayStr;
        const isDateToday = dateStr === todayStr;

        if (rows.some(r => {
            if (r.status !== 'PENDING') return false;
            if (isDatePast) return true; // All PENDING on past dates = overdue
            if (isDateToday) {
                const slotKey = ((r as any).slot_key || '').toLowerCase();
                const deadline = SESSION_DEADLINES[slotKey];
                if (deadline !== undefined) {
                    return nowMinutes > deadline; // Past session deadline
                }
                // Fallback: schedule time + 120 min grace
                if (r.time) {
                    const [h, m] = r.time.split(':').map(Number);
                    return (h * 60 + m) + FALLBACK_GRACE_MINUTES < nowMinutes;
                }
            }
            return false;
        })) return 'action_required';

        // PRIORITY 2: Any remaining PENDING (future time) → still in progress
        if (rows.some(r => r.status === 'PENDING')) return 'in_progress';
        // PRIORITY 3: All completed or skipped → all clear
        if (rows.every(r => r.status === 'COMPLETED' || r.status === 'SKIPPED')) return 'all_clear';
        return 'none';
    };

    const [dayDotsCache, setDayDotsCache] = useState<Record<string, DailyStatus>>({});
    useEffect(() => {
        const loadDots = async () => {
            const cache: Record<string, DailyStatus> = {};
            for (const d of days) {
                const dStr = formatLocalDate(d);
                const rows = await sqlGetDoseSessionsForDate(dStr);
                cache[dStr] = getDailyAggregatedStatus(rows, dStr);
            }
            setDayDotsCache(cache);
        };
        loadDots();
    }, [weekBase, records, confirmedSlots]);

    // ── Date state helpers ─────────────────────────────────────
    const isToday = (d: Date) => dayStart(d).getTime() === today.getTime();
    const isPast = (d: Date) => dayStart(d).getTime() < today.getTime();
    const isFuture = (d: Date) => dayStart(d).getTime() > today.getTime();
    const isSelected = (d: Date) => dayStart(d).getTime() === dayStart(selectedDate).getTime();
    const getDotStatus = (d: Date): DailyStatus => dayDotsCache[formatLocalDate(d)] || 'none';

    // Icon config per status
    const DOT_ICON: Record<DailyStatus, { name: string; color: string; size?: number } | null> = {
        action_required: { name: 'alert-circle',    color: '#EF4444' },
        in_progress:     { name: 'ellipse',         color: '#3B82F6' },
        all_clear:       { name: 'checkmark-circle', color: '#22C55E' },
        none:            { name: 'ellipse-outline',  color: '#9CA3AF', size: 6 },
        future:          null,
    };

    // ── Adherence computation ────────────────
    const totalMeds = sessions.reduce((s: number, sess: DoseSession) => s + sess.medicines.length, 0);

    const confirmedCount = useMemo(() => {
        if (isToday(selectedDate)) {
            return sessions.reduce((s: number, sess: DoseSession) => {
                const validIds = new Set(sess.medicines.map(m => m.id));
                return s + (confirmedSlots[sess.slotKey] || []).filter((id: string) => validIds.has(id)).length;
            }, 0);
        } else if (isPast(selectedDate)) {
            return doseSessions.filter(r => r.status === 'COMPLETED').length;
        }
        return 0;
    }, [selectedDate, sessions, confirmedSlots, doseSessions]);

    const progress = totalMeds > 0 ? confirmedCount / totalMeds : 0;
    const allDone = confirmedCount >= totalMeds && totalMeds > 0;

    // ── Session status (reactive, updates every 60s + on resume) ──
    const now = useCurrentTime();

    const getSessionNodeState = (sess: DoseSession): NodeState => {
        if (isFuture(selectedDate)) return 'future';

        const validIds = new Set(sess.medicines.map(m => m.id));
        const confirmed = (confirmedSlots[sess.slotKey] || []).filter((id: string) => validIds.has(id));

        const windows: Record<string, { start: number, end: number }> = {
            'sáng': { start: 0, end: 11 },
            'trưa': { start: 11, end: 15 },
            'chiều': { start: 15, end: 19 },
            'tối': { start: 19, end: 24 },
        };
        const nowHour = now.getHours();
        const win = windows[sess.slotKey.toLowerCase()];

        // All meds confirmed → check if on-time or late
        if (confirmed.length >= sess.medicines.length) {
            if (win) {
                // Check timestamps: any med completed after session end?
                for (const med of sess.medicines) {
                    const ts = completedAtMap[med.id];
                    if (ts && new Date(ts).getHours() >= win.end) return 'done_late';
                }
                // Or session is already over (today) → late
                if (nowHour >= win.end && !isPast(selectedDate)) return 'done_late';
            }
            // Past dates: check timestamps too
            if (isPast(selectedDate) && win) {
                for (const med of sess.medicines) {
                    const ts = completedAtMap[med.id];
                    if (ts && new Date(ts).getHours() >= win.end) return 'done_late';
                }
            }
            return 'done';
        }

        // Past dates: incomplete if not all confirmed
        if (isPast(selectedDate)) return 'incomplete';

        if (win) {
            if (nowHour >= win.start && nowHour < win.end) return 'active';
            if (nowHour >= win.end) return 'incomplete';
            return 'upcoming';
        }
        return 'upcoming';
    };

    const isMedConfirmed = (sess: DoseSession, medId: string): boolean => {
        if (isFuture(selectedDate)) return false;
        if (isPast(selectedDate)) {
            const row = doseSessions.find(r => r.dose_log_id === medId);
            return row?.status === 'COMPLETED';
        }
        return (confirmedSlots[sess.slotKey] || []).includes(medId);
    };

    const isMedSkipped = (sess: DoseSession, medId: string): boolean => {
        const row = doseSessions.find(r => r.dose_log_id === medId);
        return row?.status === 'SKIPPED';
    };

    // ── Week label ────────────────────────────────────────────
    const weekLabel = () => {
        const s = days[0];
        const e = days[6];
        if (s.getMonth() === e.getMonth()) {
            return `${VI_MON[s.getMonth()]} ${s.getFullYear()}`;
        }
        return `${VI_MON[s.getMonth()]} – ${VI_MON[e.getMonth()]} ${e.getFullYear()}`;
    };

    const adherenceLabel = () => {
        if (totalMeds === 0) return 'Không có lịch thuốc';
        if (allDone) return 'Hoàn thành tốt!';
        if (isFuture(selectedDate)) return `${totalMeds} loại thuốc dự kiến`;
        if (isPast(selectedDate)) return `${totalMeds} loại thuốc`;
        return `Đã uống ${confirmedCount}/${totalMeds} liều`;
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top + 16 }]}>

            {/* ══ Header ═══════════════════════════════════════ */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Lịch uống thuốc</Text>
                <TouchableOpacity
                    style={styles.todayBtn}
                    onPress={() => { setSelectedDate(today); setWeekBase(weekStart(today)); }}
                >
                    <Text style={styles.todayBtnText}>Hôm nay</Text>
                </TouchableOpacity>
            </View>

            {/* ══ Week navigation ══════════════════════════════ */}
            <View style={styles.weekNavRow}>
                <TouchableOpacity
                    style={styles.navArrow}
                    onPress={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }}
                >
                    <Ionicons name="chevron-back" size={18} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.weekLabel}>{weekLabel()}</Text>
                <TouchableOpacity
                    style={styles.navArrow}
                    onPress={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }}
                >
                    <Ionicons name="chevron-forward" size={18} color="#374151" />
                </TouchableOpacity>
            </View>

            {/* ══ Weekly strip ═════════════════════════════════ */}
            <View style={styles.strip}>
                {days.map((d, i) => {
                    const sel = isSelected(d);
                    const tod = isToday(d);
                    const dotStatus = getDotStatus(d);
                    const dow = d.getDay();
                    const past = isPast(d);
                    const dimmed = past && !sel;
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[
                                styles.dayCell,
                                sel && styles.dayCellActive,
                                sel && tod && styles.dayCellTodaySelected,
                            ]}
                            onPress={() => setSelectedDate(d)}
                            activeOpacity={0.75}
                        >
                            <Text style={[
                                styles.dowText,
                                sel && styles.dowTextActive,
                                tod && !sel && styles.dowTextToday,
                                dimmed && { opacity: 0.45 },
                            ]}>
                                {VI_DOW[dow]}
                            </Text>
                            <Text style={[
                                styles.dateNum,
                                sel && styles.dateNumActive,
                                tod && !sel && styles.dateNumToday,
                                dimmed && { opacity: 0.45 },
                            ]}>
                                {d.getDate()}
                            </Text>
                            <View style={styles.dotRow}>
                                {DOT_ICON[dotStatus]
                                    ? <Ionicons name={DOT_ICON[dotStatus]!.name as any} size={DOT_ICON[dotStatus]!.size || 10} color={DOT_ICON[dotStatus]!.color} style={dimmed ? { opacity: 0.45 } : undefined} />
                                    : <View style={styles.dotPlaceholder} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* ══ Scrollable content ═══════════════════════════ */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}
                showsVerticalScrollIndicator={false}
            >

                {/* ── Adherence summary card ──────────────────── */}
                <View style={styles.adherenceCard}>
                    <ProgressRing
                        progress={totalMeds === 0 ? 0 : progress}
                        size={72}
                        strokeWidth={7}
                        color={allDone ? '#10b981' : '#2563eb'}
                        bg="#e5e7eb"
                    />
                    <View style={styles.adherenceInfo}>
                        <Text style={styles.adherenceTitle}>
                            {isFuture(selectedDate) ? 'Lịch trình ngày' : isPast(selectedDate) ? 'Lịch sử ngày' : 'Tổng quan hôm nay'}
                        </Text>
                        <Text style={styles.adherenceDate}>
                            {selectedDate.getDate()} {VI_MON[selectedDate.getMonth()]}, {selectedDate.getFullYear()}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[
                                styles.adherenceLabel,
                                allDone && { color: '#10b981' },
                                totalMeds === 0 && { color: '#9ca3af' },
                            ]}>
                                {adherenceLabel()}
                            </Text>
                            {allDone && (
                                <Ionicons name="checkmark-circle" size={16} color="#22C55E" style={{ marginLeft: 6 }} />
                            )}
                        </View>
                    </View>
                </View>

                {/* ── Vertical Timeline ────────────────────────── */}
                {sessions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#d1d5db" />
                        <Text style={styles.emptyTitle}>Không có lịch thuốc</Text>
                        <Text style={styles.emptySubtitle}>Ngày này không có đơn thuốc nào đang hoạt động.</Text>
                    </View>
                ) : (
                    <View style={tl.container}>
                        {sessions.map((sess: SessionGroup, idx: number) => {
                            const nodeState = getSessionNodeState(sess);
                            const isActive = nodeState === 'active';
                            const isDone = nodeState === 'done';
                            const isDoneLate = nodeState === 'done_late';
                            const isIncomplete = nodeState === 'incomplete';
                            const isLast = idx === sessions.length - 1;
                            const slotDisplay = SLOT_DISPLAY[sess.slotKey.toLowerCase()] || SLOT_DISPLAY['sáng'];

                            // Count confirmed in this session
                            const confirmedInSess = sess.medicines.filter((m: MedicineEntry) => isMedConfirmed(sess, m.id)).length;

                            return (
                                <View key={sess.time} style={tl.row}>
                                    {/* Left axis: line + node */}
                                    <View style={tl.leftAxis}>
                                        <TimelineNode state={nodeState} />
                                        {!isLast && (
                                            <View style={[
                                                tl.line,
                                                isDone && tl.lineDone,
                                                isDoneLate && tl.lineDoneLate,
                                                isActive && tl.lineActive,
                                                isIncomplete && tl.lineIncomplete,
                                            ]} />
                                        )}
                                    </View>

                                    {/* Right: timeline card */}
                                    <TimelineCard
                                        session={sess}
                                        status={nodeState}
                                        completedAtMap={completedAtMap}
                                        isMedConfirmed={isMedConfirmed}
                                        isMedSkipped={isMedSkipped}
                                    />
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// ─── Timeline Styles ──────────────────────────────────────────────
const tl = StyleSheet.create({
    container: {
        paddingLeft: 4,
    },
    row: {
        flexDirection: 'row',
        minHeight: 80,
    },
    // ── Left axis ──
    leftAxis: {
        width: 32,
        alignItems: 'center',
    },
    node: {
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        marginTop: 18,
    },
    nodeDone: {
        backgroundColor: '#10b981',
    },
    nodeDoneLate: {
        backgroundColor: '#d97706',
    },
    nodeIncomplete: {
        backgroundColor: '#9CA3AF',
    },
    nodeActiveHalo: {
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 0,
        marginTop: 14,
    },
    nodeActiveInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#2563eb',
    },
    nodeDefault: {
        backgroundColor: '#d1d5db',
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 20,
    },
    line: {
        flex: 1,
        width: 2,
        backgroundColor: '#e5e7eb',
        marginTop: -2,
    },
    lineDone: {
        backgroundColor: '#86efac',
    },
    lineDoneLate: {
        backgroundColor: '#fcd34d',
    },
    lineActive: {
        backgroundColor: '#93c5fd',
    },
    lineIncomplete: {
        backgroundColor: '#d1d5db',
    },
    // ── Card styles moved to TimelineCard.tsx ──
});

// ─── General Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f8fafc' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SP.lg, paddingTop: SP.sm, paddingBottom: 4,
    },
    headerTitle: { fontSize: 28, fontWeight: '700', color: '#111827' },
    todayBtn: {
        backgroundColor: '#eff6ff', paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe',
    },
    todayBtnText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

    // Week navigation
    weekNavRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SP.md, paddingVertical: SP.sm,
    },
    navArrow: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
    },
    weekLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280' },

    // Calendar strip
    strip: {
        flexDirection: 'row', paddingHorizontal: SP.md,
        paddingBottom: SP.md, gap: 4,
        height: 88,
    },
    dayCell: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        height: 72, borderRadius: 14, gap: 4,
    },
    dayCellActive: { backgroundColor: '#1d4ed8' },
    dayCellTodaySelected: { borderWidth: 2, borderColor: '#93c5fd' },
    dowText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
    dowTextActive: { color: 'rgba(255,255,255,0.8)' },
    dowTextToday: { color: '#2563eb' },
    dateNum: { fontSize: 16, fontWeight: '700', color: '#374151' },
    dateNumActive: { color: '#ffffff', fontWeight: '900' as any },
    dateNumToday: { color: '#2563eb' },
    dotRow: { height: 12, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotPlaceholder: { width: 10, height: 10 },

    // Scroll
    scrollContent: { paddingHorizontal: SP.lg, paddingTop: SP.md },

    // Adherence card
    adherenceCard: {
        flexDirection: 'row', alignItems: 'center', gap: SP.md,
        backgroundColor: '#ffffff', borderRadius: 16,
        borderWidth: 1, borderColor: '#f1f5f9',
        padding: SP.md, marginBottom: SP.lg,
    },
    adherenceInfo: { flex: 1 },
    adherenceTitle: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    adherenceDate: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
    adherenceLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: SP.xl, gap: SP.sm },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
    emptySubtitle: { fontSize: 14, color: '#d1d5db', textAlign: 'center', lineHeight: 20 },
});
