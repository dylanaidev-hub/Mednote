/**
 * Schedule.tsx
 * "Lịch uống thuốc" – Clinical Utility design
 *
 * Sections:
 *  1. Weekly calendar strip (swipeable by week)
 *  2. Daily adherence summary card (progress ring)
 *  3. Session timeline (Sáng/Trưa/Chiều/Tối) with past/present/future states
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    FlatList, Animated, Easing,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMedContext, Prescription, MedicationStatus } from '../context/MedContext';
import { MedicineEntry } from '../types/medicine';
import { useToast } from '../context/ToastContext';
import {
    groupIntoDoseSessions,
    DoseSession,
    DoseSessionCard,
    getActiveSessionKey,
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
 * Each DoseSessionRow = 1 dose_log = 1 unique MedicineEntry.
 * NO grouping by medication_id — avoids all overwrite/collision bugs.
 */
function doseSessionRowsToMedicines(rows: DoseSessionRow[]): { medicines: MedicineEntry[], doseLogIdMap: Record<string, string> } {
    const doseLogIdMap: Record<string, string> = {};

    const medicines: MedicineEntry[] = rows.map(row => {
        // Build schedule_id → dose_log_id map
        if (row.schedule_id && row.dose_log_id) {
            doseLogIdMap[row.schedule_id] = row.dose_log_id;
        }

        const slotKey = (row.slot_key || 'sáng').toLowerCase();

        return {
            id: row.dose_log_id, // Use dose_log_id as the unique ID
            name: row.med_name,
            quantity: String(row.dose),
            unit: row.unit || 'viên',
            frequency: [slotKey],
            sessionTimes: { [slotKey]: row.time }, // Single time entry per medicine
            mealTiming: row.meal_timing || undefined,
            note: row.note || '',
            hasError: false,
            source: (row.med_type === 'routine' ? 'routine' : 'prescription') as 'routine' | 'prescription',
            prescriptionId: row.prescription_id || undefined,
            _doseLogId: row.dose_log_id, // Carry dose_log_id for confirm/undo
        } as any;
    });

    return { medicines, doseLogIdMap };
}

// ─── Animated Progress Ring ───────────────────────────────────────

interface RingProps {
    progress: number; // 0-1
    size: number;
    strokeWidth: number;
    color: string;
    bg: string;
}

const ProgressRing = ({ progress, size, strokeWidth, color, bg }: RingProps) => {
    const animVal = useRef(new Animated.Value(0)).current;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

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
    // Re-fetch whenever selectedDate, records, or confirmedMedsToday changes.
    // confirmedMedsToday triggers re-fetch so completed_at timestamps update
    // after the user confirms meds on the Dashboard screen.
    useEffect(() => {
        const loadDoseSessions = async () => {
            const dateStr = formatLocalDate(selectedDate);
            // Ensure dose_logs exist for the selected date
            await sqlEnsureAllTodayDoseLogs(dateStr);
            // Query dose_logs directly (SQL JOIN)
            const rows = await sqlGetDoseSessionsForDate(dateStr);
            setDoseSessions(rows);
        };
        loadDoseSessions();
    }, [selectedDate, records, confirmedSlots]);

    // ── Convert DB rows to MedicineEntry[] → DoseSession[] ────
    const { medicines: meds, doseLogIdMap } = useMemo(() => doseSessionRowsToMedicines(doseSessions), [doseSessions]);
    const sessions: DoseSession[] = useMemo(() => groupIntoDoseSessions(meds, doseLogIdMap), [meds, doseLogIdMap]);

    // ── Build completedAtMap: dose_log_id → completed_at timestamp ────
    const completedAtMap = useMemo(() => {
        const map: Record<string, number> = {};
        doseSessions.forEach(row => {
            if (row.status === 'COMPLETED' && row.completed_at && row.dose_log_id) {
                map[row.dose_log_id] = row.completed_at;
            }
        });
        return map;
    }, [doseSessions]);

    // ── hasMeds dot for calendar strip (also from dose_logs) ──
    const [dayDotsCache, setDayDotsCache] = useState<Record<string, boolean>>({});
    useEffect(() => {
        const loadDots = async () => {
            const cache: Record<string, boolean> = {};
            for (const d of days) {
                const dStr = formatLocalDate(d);
                const rows = await sqlGetDoseSessionsForDate(dStr);
                cache[dStr] = rows.length > 0;
            }
            setDayDotsCache(cache);
        };
        loadDots();
    }, [weekBase, records]);

    // ── Date state helpers ─────────────────────────────────────
    const isToday = (d: Date) => dayStart(d).getTime() === today.getTime();
    const isPast = (d: Date) => dayStart(d).getTime() < today.getTime();
    const isFuture = (d: Date) => dayStart(d).getTime() > today.getTime();
    const isSelected = (d: Date) => dayStart(d).getTime() === dayStart(selectedDate).getTime();
    const hasMeds = (d: Date) => dayDotsCache[formatLocalDate(d)] || false;

    // ── Adherence computation for selected date ────────────────
    const totalMeds = sessions.reduce((s: number, sess: DoseSession) => s + sess.medicines.length, 0);

    const confirmedCount = useMemo(() => {
        if (isToday(selectedDate)) {
            return sessions.reduce((s: number, sess: DoseSession) => {
                const validIds = new Set(sess.medicines.map(m => m.id));
                return s + (confirmedSlots[sess.slotKey] || []).filter((id: string) => validIds.has(id)).length;
            }, 0);
        } else if (isPast(selectedDate)) {
            // For past dates: check dose_logs status from DB rows
            return doseSessions.filter(r => r.status === 'COMPLETED').length;
        }
        return 0;
    }, [selectedDate, sessions, confirmedSlots, doseSessions]);

    const progress = totalMeds > 0 ? confirmedCount / totalMeds : 0;
    const allDone = confirmedCount >= totalMeds && totalMeds > 0;

    // ── Session status for selected date ──────────────────────
    const now = new Date();

    const getSessionStatus = (sess: DoseSession): 'done' | 'missed' | 'active' | 'upcoming' | 'future' => {
        if (isFuture(selectedDate)) return 'future';

        const validIds = new Set(sess.medicines.map(m => m.id));
        const confirmed = (confirmedSlots[sess.slotKey] || []).filter((id: string) => validIds.has(id));

        if (confirmed.length >= sess.medicines.length) return 'done';
        if (isPast(selectedDate)) return 'missed';

        const nowHour = now.getHours();
        const windows: Record<string, { start: number, end: number }> = {
            'Sáng': { start: 0, end: 11 },
            'Trưa': { start: 11, end: 15 },
            'Chiều': { start: 15, end: 19 },
            'Tối': { start: 19, end: 24 },
        };

        const win = windows[sess.slotKey];
        if (win) {
            if (nowHour >= win.end) return 'missed';
            if (nowHour >= win.start && nowHour < win.end) return 'active';
            return 'upcoming';
        }

        const h = sess.hour || 8;
        if (nowHour >= h + 2) return 'missed';
        if (Math.abs(nowHour - h) <= 1) return 'active';
        return nowHour < h ? 'upcoming' : 'missed';
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
                    const dot = hasMeds(d);
                    const dow = d.getDay();
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[styles.dayCell, sel && styles.dayCellActive]}
                            onPress={() => setSelectedDate(d)}
                            activeOpacity={0.75}
                        >
                            <Text style={[styles.dowText, sel && styles.dowTextActive, tod && !sel && styles.dowTextToday]}>
                                {VI_DOW[dow]}
                            </Text>
                            <Text style={[styles.dateNum, sel && styles.dateNumActive, tod && !sel && styles.dateNumToday]}>
                                {d.getDate()}
                            </Text>
                            <View style={styles.dotRow}>
                                {dot ? <View style={[styles.dot, sel && styles.dotActive]} /> : <View style={styles.dotPlaceholder} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* ══ Scrollable content ═══════════════════════════ */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 80 }]}
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

                {/* ── Session timeline ────────────────────────── */}
                {sessions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#d1d5db" />
                        <Text style={styles.emptyTitle}>Không có lịch thuốc</Text>
                        <Text style={styles.emptySubtitle}>Ngày này không có đơn thuốc nào đang hoạt động.</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.sectionLabel}>Lịch trình ({sessions.length} cữ)</Text>
                        {sessions.map(sess => {
                            const dateState = isFuture(selectedDate) ? 'future' : isPast(selectedDate) ? 'past' : 'today';

                            // Determine active status: today + pending logic
                            const activeSlotKey = getActiveSessionKey(sessions, confirmedSlots);
                            const isActive = isToday(selectedDate) && activeSlotKey === sess.slotKey;

                            // Determine confirmed items based on date
                            let confirmedInSession: string[] = [];
                            if (dateState === 'future') {
                                confirmedInSession = [];
                            } else if (isToday(selectedDate)) {
                                confirmedInSession = confirmedSlots[sess.slotKey] || [];
                            } else {
                                // Past dates: read from medicationLogs
                                const dateStr = formatLocalDate(selectedDate);
                                confirmedInSession = sess.medicines.filter(m => {
                                    const rxId = m.prescriptionId;
                                    return rxId && medicationLogs[rxId]?.[dateStr] === 'taken';
                                }).map(m => m.id);
                            }

                            // Past items cannot be caught up anymore
                            const lateInSession: string[] = [];

                            return (
                                <DoseSessionCard
                                    key={sess.slotKey}
                                    session={sess}
                                    isActive={isActive}
                                    confirmedIds={confirmedInSession}
                                    dateState={dateState}
                                    isReadOnly={true}
                                    completedAtMap={completedAtMap}
                                    showCompletedTime={true}
                                    onConfirmItems={() => {}}
                                    onUndoItem={() => {}}
                                />
                            );
                        })}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f8fafc' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SP.lg, paddingTop: SP.sm, paddingBottom: 4,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
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
    },
    dayCell: {
        flex: 1, alignItems: 'center', paddingVertical: 10,
        borderRadius: 14, gap: 4,
    },
    dayCellActive: { backgroundColor: '#1d4ed8' },
    dowText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
    dowTextActive: { color: 'rgba(255,255,255,0.8)' },
    dowTextToday: { color: '#2563eb' },
    dateNum: { fontSize: 16, fontWeight: '700', color: '#374151' },
    dateNumActive: { color: '#ffffff' },
    dateNumToday: { color: '#2563eb' },
    dotRow: { height: 6, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#93c5fd' },
    dotActive: { backgroundColor: 'rgba(255,255,255,0.6)' },
    dotPlaceholder: { width: 5, height: 5 },

    // Scroll
    scrollContent: { paddingHorizontal: SP.lg, paddingTop: SP.md },

    // Adherence card
    adherenceCard: {
        flexDirection: 'row', alignItems: 'center', gap: SP.md,
        backgroundColor: '#ffffff', borderRadius: 18,
        borderWidth: 1, borderColor: '#e5e7eb',
        padding: SP.md, marginBottom: SP.lg,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
    },
    adherenceInfo: { flex: 1 },
    adherenceTitle: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    adherenceDate: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
    adherenceLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },

    // Section label
    sectionLabel: {
        fontSize: 12, fontWeight: '700', color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: SP.md,
    },

    // Session card
    sessionCard: {
        backgroundColor: '#ffffff', borderRadius: 18,
        borderWidth: 1, borderColor: '#e5e7eb',
        padding: SP.md, marginBottom: SP.md,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
    },
    sessionDone: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
    sessionMissed: { backgroundColor: '#fff5f5', borderColor: '#fecaca' },
    sessionActive: { borderColor: '#93c5fd', borderWidth: 1.5 },

    // Session header
    sessHeader: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginBottom: SP.sm },
    sessIconWrap: {
        width: 44, height: 44, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    sessLabelRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginBottom: 2 },
    sessLabel: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
    sessLabelDone: { color: '#166534' },
    sessLabelMissed: { color: '#991b1b' },
    sessTime: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },

    // Status pills
    activePill: { backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    activePillText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
    futurePill: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    futurePillText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },

    // Medicine list in session
    medList: { gap: 10, marginTop: 4 },
    medRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    medDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#93c5fd', flexShrink: 0 },
    medDotDone: { backgroundColor: '#6ee7b7' },
    medDotMissed: { backgroundColor: '#fca5a5' },
    medName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
    medNameDone: { color: '#4b5563', opacity: 0.7 },
    medNameMissed: { color: '#991b1b' },
    medDose: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

    // Session footer badges
    sessDoneBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#f0fdf4', padding: 8, borderRadius: 10, marginTop: SP.sm,
    },
    sessDoneBadgeText: { fontSize: 12, fontWeight: '600', color: '#16a34a' },
    sessMissedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#fff5f5', padding: 8, borderRadius: 10, marginTop: SP.sm,
    },
    sessMissedBadgeText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
    sessUpcomingBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#f9fafb', padding: 8, borderRadius: 10, marginTop: SP.sm,
    },
    sessUpcomingBadgeText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: SP.xl, gap: SP.sm },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
    emptySubtitle: { fontSize: 14, color: '#d1d5db', textAlign: 'center', lineHeight: 20 },
});
