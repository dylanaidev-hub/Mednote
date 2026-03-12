import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, Easing, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MedicineEntry } from '../types/medicine';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Dose Session Model ──────────────────────────────────────────
export interface DoseSession {
    slotKey: string;     // 'Sáng', 'Trưa', 'Chiều', 'Tối'
    label: string;       // 'Buổi Sáng', 'Buổi Trưa', etc.
    icon: string;        // MaterialCommunityIcons name
    iconColor: string;   // Icon color
    time: string;        // '08:00', '12:00', '18:00', '21:00'
    hour: number;
    medicines: MedicineEntry[];
    emoji?: string;
}

// ─── Slot Configuration ──────────────────────────────────────────
const SLOT_CONFIG: Record<string, { label: string; icon: string; iconColor: string; time: string; hour: number; order: number }> = {
    'sáng': { label: 'Buổi Sáng', icon: 'weather-sunny', iconColor: '#f59e0b', time: '08:00', hour: 8, order: 0 },
    'trưa': { label: 'Buổi Trưa', icon: 'weather-partly-cloudy', iconColor: '#f97316', time: '12:00', hour: 12, order: 1 },
    'chiều': { label: 'Buổi Chiều', icon: 'weather-sunset', iconColor: '#ef4444', time: '18:00', hour: 18, order: 2 },
    'tối': { label: 'Buổi Tối', icon: 'moon-waning-crescent', iconColor: '#6366f1', time: '21:00', hour: 21, order: 3 },
};

// Normalize slot key — robust case-insensitive mapping with safe fallback
export function normalizeSlotKey(key: string): string {
    if (!key) return 'sáng';
    // Strip _sub_ suffix and lowercase for comparison
    const base = key.split('_sub_')[0].toLowerCase();
    if (base === 'sáng' || base === 'morning') return 'sáng';
    if (base === 'trưa' || base === 'noon') return 'trưa';
    if (base === 'chiều' || base === 'afternoon') return 'chiều';
    if (base === 'tối' || base === 'evening') return 'tối';
    return 'sáng'; // Safe fallback
}

// Build schedule_id that matches DB format (used only to look up doseLogIdMap)
function buildScheduleId(medId: string, sessionTimesKey: string): string {
    const normalizedSlot = normalizeSlotKey(sessionTimesKey);
    if (sessionTimesKey.includes('_sub_')) {
        const fullScheduleId = sessionTimesKey.substring(sessionTimesKey.indexOf('_sub_') + 5);
        if (fullScheduleId.startsWith(medId)) {
            return fullScheduleId;
        }
        return `${medId}_${normalizedSlot}_sub_${fullScheduleId}`;
    }
    return `${medId}_${normalizedSlot}`;
}

// Get exact time for a medicine entry (uses _virtualTime override if set)
function getMedTime(med: MedicineEntry, slotKey: string): string {
    if ((med as any)._virtualTime) return (med as any)._virtualTime;
    const normalizedTarget = normalizeSlotKey(slotKey);
    const entry = Object.entries(med.sessionTimes || {}).find(([k]) => normalizeSlotKey(k) === normalizedTarget);
    return entry ? entry[1] : (SLOT_CONFIG[normalizedTarget]?.time || '08:00');
}

// ─── Meal Timing ordering ────────────────────────────────────────
const MEAL_ORDER = ['Trước ăn', 'Khi đói', 'Sau ăn', 'Tùy ý', 'Chưa định khung'];

// ─── Group medicines into DoseSessions — 1 entry per time slot ───
// doseLogIdMap: optional map from schedule_id → dose_log_id (from DB)
export function groupIntoDoseSessions(medicines: MedicineEntry[], doseLogIdMap?: Record<string, string>): DoseSession[] {
    const sessionMap: Record<string, MedicineEntry[]> = {};

    medicines.forEach(med => {
        const sessionTimes = med.sessionTimes || {};
        const keys = Object.keys(sessionTimes);

        if (keys.length > 0) {
            // Each sessionTimes key = one time slot → one card
            keys.forEach(key => {
                const normalized = normalizeSlotKey(key);
                if (!sessionMap[normalized]) sessionMap[normalized] = [];

                const scheduleId = buildScheduleId(med.id, key);
                // Resolve dose_log_id: pre-set (from flat row) > map lookup > fallback to scheduleId
                const doseLogId = (med as any)._doseLogId
                    || doseLogIdMap?.[scheduleId]
                    || scheduleId;

                // Dedup by doseLogId (absolute unique key)
                if (!sessionMap[normalized].some(m => (m as any)._doseLogId === doseLogId)) {
                    sessionMap[normalized].push({
                        ...med,
                        id: doseLogId,
                        _doseLogId: doseLogId,
                        _virtualTime: sessionTimes[key],
                    } as any);
                }
            });
        } else if (med.frequency && med.frequency.length > 0) {
            med.frequency.forEach(slot => {
                const normalized = normalizeSlotKey(slot);
                if (!sessionMap[normalized]) sessionMap[normalized] = [];
                const scheduleId = `${med.id}_${normalized}`;
                const doseLogId = doseLogIdMap?.[scheduleId] || scheduleId;
                if (!sessionMap[normalized].some(m => (m as any)._doseLogId === doseLogId)) {
                    sessionMap[normalized].push({
                        ...med,
                        id: doseLogId,
                        _doseLogId: doseLogId,
                    } as any);
                }
            });
        }
    });

    return Object.entries(sessionMap)
        .map(([slotKey, meds]) => {
            const config = SLOT_CONFIG[slotKey] || {
                label: slotKey, icon: 'clock-outline', iconColor: '#6b7280', hour: 8, order: 99,
            };

            const sortedMeds = [...meds].sort((a, b) => {
                const timeA = getMedTime(a, slotKey);
                const timeB = getMedTime(b, slotKey);
                return timeA.localeCompare(timeB);
            });

            return {
                slotKey,
                label: config.label,
                icon: config.icon,
                iconColor: config.iconColor,
                time: config.time || '08:00',
                hour: config.hour,
                medicines: sortedMeds,
            };
        })
        .sort((a, b) => (SLOT_CONFIG[a.slotKey]?.order ?? 99) - (SLOT_CONFIG[b.slotKey]?.order ?? 99));
}

// ─── Get active session: First session with pending items ────────
export function getActiveSessionKey(sessions: DoseSession[], confirmedSlots: Record<string, string[]> = {}): string | null {
    for (const session of sessions) {
        const confirmedIds = confirmedSlots[session.slotKey] || [];
        if (confirmedIds.length < session.medicines.length) {
            return session.slotKey;
        }
    }
    return null; // All items for the day confirmed
}

// ─── Props ───────────────────────────────────────────────────────
interface DoseSessionCardProps {
    session: DoseSession;
    isActive: boolean;
    confirmedIds: string[];
    onConfirmItems: (slotKey: string, ids: string[]) => void;
    onUndoItem: (slotKey: string, id?: string) => void;
    dateState?: 'past' | 'today' | 'future';
    isReadOnly?: boolean;
    completedAtMap?: Record<string, number>;
    showCompletedTime?: boolean;
}

// ─── Dynamic Icon Mapping ────────────────────────────────────────
const getMedicineIconConfig = (med: MedicineEntry) => {
    // Priority 1: Source distinction as per requirements
    if (med.source === 'routine') {
        return { family: 'MaterialCommunityIcons' as const, name: 'leaf', color: '#10b981', bgColor: '#ecfdf5' };
    }

    // Priority 2: Unit-based icons for prescriptions
    const unit = (med.unit || '').toLowerCase();

    // Packets / Powders
    if (unit.includes('gói')) {
        return { family: 'Ionicons' as const, name: 'cube-outline', color: '#f59e0b', bgColor: '#fef3c7' };
    }

    // Liquids / Syrups
    if (unit.includes('ml') || unit.includes('lọ') || unit.includes('ống') || unit.includes('chai')) {
        return { family: 'Ionicons' as const, name: 'water-outline', color: '#0ea5e9', bgColor: '#e0f2fe' };
    }

    // Pills / Tablets (Default)
    return { family: 'MaterialCommunityIcons' as const, name: 'pill', color: '#3b82f6', bgColor: '#eff6ff' };
};

// ─── Format completed_at timestamp ──────────────────────────────
function formatCompletedAt(timestamp: number | undefined): string | null {
    if (!timestamp) return null;
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `Đã uống lúc ${hh}:${mm}`;
}

// ─── Individual Medicine Item ────────────────────────────────────
interface MedicineItemRowProps {
    med: MedicineEntry;
    sessionKey: string;
    isConfirmed: boolean;
    dateState?: 'past' | 'today' | 'future';
    isReadOnly?: boolean;
    completedAt?: number;
    showCompletedTime?: boolean;
    onConfirm: () => void;
    onUndo?: () => void;
}

const MedicineItemRow: React.FC<MedicineItemRowProps> = ({ med, sessionKey, isConfirmed, dateState = 'today', isReadOnly = false, completedAt, showCompletedTime = false, onConfirm, onUndo }: MedicineItemRowProps) => {
    // Exact time for this item in this session
    const medTime = getMedTime(med, sessionKey);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handleToggle = () => {
        if (isReadOnly) return; // Read-only: no interactions
        if (!isConfirmed) {
            Animated.sequence([
                Animated.timing(scaleAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true })
            ]).start();
            onConfirm();
        } else {
            if (onUndo) onUndo();
        }
    };

    // Format completed_at for display
    const completedAtText = isConfirmed ? formatCompletedAt(completedAt) : null;

    // Dynamic CTA Text
    const ctaText = med.quantity && med.unit
        ? `Uống ${med.quantity} ${med.unit}`
        : 'Uống loại này';

    const iconConfig = getMedicineIconConfig(med);

    return (
        <View style={[styles.medRow, isConfirmed && styles.medRowDone]}>
            <View style={styles.medRowLeft}>
                <View style={[
                    styles.medCircle,
                    { backgroundColor: iconConfig.bgColor }
                ]}>
                    {iconConfig.family === 'Ionicons' ? (
                        <Ionicons
                            name={iconConfig.name as any}
                            size={18}
                            color={iconConfig.color}
                        />
                    ) : (
                        <MaterialCommunityIcons
                            name={iconConfig.name as any}
                            size={18}
                            color={iconConfig.color}
                        />
                    )}
                </View>
                <View style={styles.medInfo}>
                    <Text style={styles.medName} numberOfLines={1}>
                        {med.name}
                    </Text>
                    <View style={styles.medMetaRow}>
                        <Text style={styles.medDose} numberOfLines={1}>
                            {med.dosage || `${med.quantity} ${med.unit}`}
                        </Text>
                    </View>
                    {/* Meal Timing Badge */}
                    {med.mealTiming ? (
                        <View style={styles.mealTimingBadge}>
                            <Text style={styles.mealTimingText}>{med.mealTiming}</Text>
                        </View>
                    ) : null}
                    {/* Note */}
                    {med.note ? (
                        <View style={styles.noteRow}>
                            <Ionicons name="create-outline" size={12} color="#9CA3AF" style={{ marginRight: 3, marginTop: 1 }} />
                            <Text style={styles.noteText} numberOfLines={2}>
                                {med.note}
                            </Text>
                        </View>
                    ) : null}
                    {showCompletedTime && completedAtText && (
                        <Text style={styles.completedAtText}>{completedAtText}</Text>
                    )}
                </View>
            </View>

            {/* Read-Only Future State */}
            {dateState === 'future' && (
                <View style={styles.futureWrap}>
                    <Text style={styles.futureText}>Dự kiến</Text>
                </View>
            )}

            {/* ── Read-Only Mode: Status Tags ── */}
            {isReadOnly && dateState !== 'future' && (
                isConfirmed ? (
                    <View style={styles.statusTagDone}>
                        <Text style={styles.statusTagDoneText}>Đã uống ✓</Text>
                    </View>
                ) : dateState === 'past' ? (
                    <View style={styles.statusTagMissed}>
                        <Text style={styles.statusTagMissedText}>Bỏ lỡ</Text>
                    </View>
                ) : (
                    <View style={styles.statusTagPending}>
                        <Text style={styles.statusTagPendingText}>Chưa uống</Text>
                    </View>
                )
            )}

            {/* ── Interactive Mode: Checkbox ── */}
            {!isReadOnly && (dateState === 'today' || isConfirmed) && dateState !== 'future' ? (
                <TouchableOpacity
                    onPress={handleToggle}
                    activeOpacity={0.7}
                >
                    <Animated.View style={[
                        styles.checkboxCircle,
                        isConfirmed && styles.checkboxCircleCheckedBlue,
                        { transform: [{ scale: scaleAnim }] }
                    ]}>
                        {isConfirmed && <Ionicons name="checkmark" size={18} color="#ffffff" />}
                    </Animated.View>
                </TouchableOpacity>
            ) : null}

            {/* Missed Warning for Past (not confirmed, not read-only) */}
            {!isReadOnly && dateState === 'past' && !isConfirmed && (
                <View style={styles.missedWarningWrap}>
                    <Ionicons name="close-circle" size={18} color="#ef4444" />
                </View>
            )}
        </View>
    );
};

export const DoseSessionCard = ({
    session, isActive, confirmedIds, onConfirmItems, onUndoItem,
    dateState = 'today', isReadOnly = false, completedAtMap = {}, showCompletedTime = false
}: DoseSessionCardProps) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const totalCount = session.medicines.length;
    // Helper: get dose_log_id from medicine (the actual DB primary key)
    const getDoseLogId = (m: MedicineEntry) => (m as any)._doseLogId || m.id;
    // Only count IDs that actually exist in this session's medicine list.
    const validDoseLogIds = new Set(session.medicines.map(getDoseLogId));
    const validConfirmedIds = confirmedIds.filter(id => validDoseLogIds.has(id));

    // Combine confirmed and late counts for progress logic 
    const confirmedCount = validConfirmedIds.length;
    const resolvedCount = validConfirmedIds.length;
    const remainingCount = totalCount - resolvedCount;
    // Progress implies anything handled (done or late, or pure done depending on interpretation. Lets use resolved / total)
    const progress = totalCount > 0 ? resolvedCount / totalCount : 0;
    const isFullyDone = totalCount > 0 && resolvedCount >= totalCount;

    // Default to closed if fully done, opened if still active
    const [isExpanded, setIsExpanded] = useState(!isFullyDone);

    // If fully done state changes externally, we might want to collapse it automatically
    useEffect(() => {
        if (isFullyDone) {
            // Optional: collapse after short delay if just finished
            const timer = setTimeout(() => setIsExpanded(false), 600);
            return () => clearTimeout(timer);
        } else {
            setIsExpanded(true);
        }
    }, [isFullyDone]);

    // ─── Pulse animation for active sessions ─────────────────
    useEffect(() => {
        if (isActive && !isFullyDone) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.01,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isActive, isFullyDone, pulseAnim]);

    // ─── Confirm single item ─────────────────────────────────
    const handleConfirmOne = useCallback((medId: string) => {
        onConfirmItems(session.slotKey, [medId]);
    }, [session.slotKey, onConfirmItems]);

    // ─── Confirm all remaining ───────────────────────────────
    const handleConfirmAll = useCallback(() => {
        const remainingDoseLogIds = session.medicines
            .filter(m => !confirmedIds.includes(getDoseLogId(m)))
            .map(m => getDoseLogId(m));
        if (remainingDoseLogIds.length > 0) {
            onConfirmItems(session.slotKey, remainingDoseLogIds);
        }
    }, [session, confirmedIds, onConfirmItems]);

    // ─── Collapsed Completed View ────────────────────────────
    if (isFullyDone && !isExpanded) {
        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsExpanded(true)}
                style={[styles.card, styles.cardDone, { paddingVertical: 14 }]}
            >
                <View style={styles.headerRow}>
                    <View style={styles.doneIconWrap}>
                        <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.headerSessionTitle, { color: '#166534', fontSize: 18 }]}>
                            Đã hoàn thành {session.label}
                        </Text>
                    </View>
                    <Ionicons name="chevron-down" size={20} color="#15803d" />
                </View>
            </TouchableOpacity>
        );
    }

    // ─── CTA config ──────────────────────────────────────────
    let ctaLabel: string;
    let ctaStyle: any;
    if (confirmedCount === 0) {
        ctaLabel = 'Xác nhận uống tất cả';
        ctaStyle = styles.ctaPrimary;
    } else {
        ctaLabel = `Xác nhận phần còn lại (${remainingCount})`;
        ctaStyle = styles.ctaSecondary;
    }

    return (
        <Animated.View style={[
            styles.card,
            isActive && styles.cardActive,
            { transform: [{ scale: pulseAnim }] },
        ]}>

            {/* Header */}
            <View style={styles.headerRow}>
                <View style={[styles.slotIconWrap, { backgroundColor: `${session.iconColor}18` }]}>
                    <MaterialCommunityIcons name={session.icon as any} size={22} color={session.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerSessionTitle}>
                        {session.label}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {totalCount} loại thuốc
                    </Text>
                </View>

                {isFullyDone ? (
                    <TouchableOpacity
                        onPress={() => setIsExpanded(false)}
                        style={{ padding: 4 }}
                    >
                        <Ionicons name="chevron-up" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Medicine list grouped by time */}
            <View style={styles.medList}>
                {(() => {
                    // Group medicines by time
                    const timeGroups: Record<string, typeof session.medicines> = {};
                    session.medicines.forEach(med => {
                        const time = getMedTime(med, session.slotKey);
                        if (!timeGroups[time]) timeGroups[time] = [];
                        timeGroups[time].push(med);
                    });
                    const sortedTimes = Object.keys(timeGroups).sort();

                    return sortedTimes.map(time => (
                        <View key={time}>
                            {/* Time sub-header */}
                            <View style={styles.timeSubHeader}>
                                <Ionicons name="time-outline" size={16} color="#6B7280" />
                                <Text style={styles.timeSubHeaderText}>{time}</Text>
                            </View>
                            {timeGroups[time].map(med => {
                                const doseLogId = (med as any)._doseLogId || med.id;
                                const isConfirmed = confirmedIds.includes(doseLogId);
                                return (
                                    <MedicineItemRow
                                        key={doseLogId}
                                        med={{...med, id: doseLogId}}
                                        sessionKey={session.slotKey}
                                        isConfirmed={isConfirmed}
                                        dateState={dateState}
                                        isReadOnly={isReadOnly}
                                        completedAt={completedAtMap[doseLogId]}
                                        showCompletedTime={showCompletedTime}
                                        onConfirm={() => handleConfirmOne(doseLogId)}
                                        onUndo={() => onUndoItem(session.slotKey, doseLogId)}
                                    />
                                );
                            })}
                        </View>
                    ));
                })()}
            </View>

            {/* UX Feedback for Future State */}
            {dateState === 'future' && (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
                        Chưa đến thời gian uống thuốc
                    </Text>
                </View>
            )}

            {/* CTA Button — only if there are remaining meds AND today AND not read-only */}
            {!isReadOnly && dateState === 'today' && remainingCount > 0 && !isFullyDone && (
                <TouchableOpacity
                    style={[styles.ctaButton, ctaStyle]}
                    onPress={handleConfirmAll}
                    activeOpacity={0.8}
                >
                    <Text style={[
                        styles.ctaText,
                        resolvedCount > 0 && styles.ctaTextSecondary,
                    ]}>
                        {ctaLabel}
                    </Text>
                </TouchableOpacity>
            )}
        </Animated.View>
    );
};

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Card
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 18,
        paddingTop: 14,
        paddingHorizontal: 18,
        paddingBottom: 18,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        position: 'relative',
        overflow: 'hidden',
    },
    cardActive: {
        borderColor: '#93c5fd',
        borderWidth: 1.5,
        backgroundColor: '#fafcff',
    },
    cardDone: {
        backgroundColor: '#ffffff',
    },
    doneIconWrap: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    // Progress bar (top edge)
    progressBarTop: {
        position: 'absolute',
        top: 0,
        left: 0,
        height: 3,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
    },
    // Header
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    slotIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    headerSessionTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1f2937',
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#9ca3af',
        marginTop: 1,
        fontWeight: '500',
    },
    undoHeaderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#fef2f2',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginTop: 12,
        gap: 4,
    },
    undoHeaderText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ef4444',
    },
    // Sub-group headers
    subgroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
        marginTop: 4,
        paddingBottom: 4,
    },
    subgroupEmoji: {
        fontSize: 12,
    },
    subgroupLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Medicine list
    medList: {
        marginTop: 14,
        marginBottom: 14,
    },
    timeSubHeader: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginTop: 14,
        marginBottom: 6,
        paddingHorizontal: 14,
    },
    timeSubHeaderText: {
        fontSize: 15,
        fontWeight: '700' as const,
        color: '#374151',
        marginLeft: 6,
    },
    // Medicine item row
    medRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f3f4f6',
        gap: 12,
        paddingHorizontal: 8,
    },
    medRowDone: {
        backgroundColor: 'rgba(22, 163, 74, 0.04)', // Very subtle green tint
        borderRadius: 12,
        marginHorizontal: -8,
        paddingHorizontal: 16,
    },
    medRowLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    medCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    medInfo: {
        flex: 1,
        paddingRight: 8,
    },
    medName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1f2937',
    },
    medDose: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 2,
    },
    // Action button ('Uống X viên')
    actionBtn: {
        backgroundColor: '#eef2ff', // Indigo 50
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#3b82f6', // Blue 500
    },
    // Confirmed state
    doneWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
    },
    doneText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9ca3af',
    },
    medDoseLate: {
        fontSize: 13,
        color: '#b45309', // amber 700
        marginTop: 2,
    },
    checkboxCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#d1d5db',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxCircleChecked: {
        backgroundColor: '#10b981',
        borderColor: '#10b981',
    },
    checkboxCircleCheckedBlue: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    futureWrap: {
        paddingHorizontal: 8,
    },
    futureText: {
        fontSize: 12,
        color: '#9ca3af',
        fontStyle: 'italic',
    },
    lateWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
    },
    medNameLate: {
        fontSize: 15,
        color: '#92400e', // amber 800
    },
    lateText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#f59e0b',
    },
    missedWarningWrap: {
        paddingHorizontal: 8,
        justifyContent: 'center',
    },
    actionBtnRetro: {
        backgroundColor: '#fffbeb', // amber 50
        borderWidth: 1,
        borderColor: '#fde68a', // amber 200
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    actionBtnTextRetro: {
        fontSize: 12,
        fontWeight: '600',
        color: '#d97706', // amber 600
    },
    // CTA Buttons
    ctaButton: {
        borderRadius: 14,
        paddingVertical: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaPrimary: {
        backgroundColor: '#2563eb',
    },
    ctaSecondary: {
        backgroundColor: '#ffffff',
        borderWidth: 1.5,
        borderColor: '#2563eb',
    },
    ctaText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#ffffff',
    },
    ctaTextSecondary: {
        color: '#2563eb',
    },
    doneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: 12,
    },
    doneTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#065f46',
    },
    doneSubtitle: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2,
    },
    medMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    timeBadgeSmall: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginRight: 4,
    },
    timeBadgeTextSmall: {
        fontSize: 11,
        fontWeight: '700',
        color: '#4b5563',
    },
    completedAtText: {
        fontSize: 12,
        color: '#16a34a',
        fontWeight: '500',
        marginTop: 2,
    },
    // ── Status Tags (Read-only mode) ──
    statusTagDone: {
        backgroundColor: '#dcfce7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusTagDoneText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#16a34a',
    },
    statusTagPending: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusTagPendingText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#9ca3af',
    },
    statusTagMissed: {
        backgroundColor: '#fef2f2',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusTagMissedText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ef4444',
    },
    mealTimingBadge: {
        backgroundColor: '#FFF7ED',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: 'flex-start',
        marginTop: 3,
        borderWidth: 1,
        borderColor: '#FDBA74',
    },
    mealTimingText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#EA580C',
    },
    noteRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 2,
    },
    noteText: {
        fontSize: 11,
        color: '#9CA3AF',
        fontStyle: 'italic',
        marginTop: 2,
    },
});
