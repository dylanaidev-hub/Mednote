/**
 * TimelineCard.tsx
 * Extracted from Schedule.tsx — renders a single session card in the Timeline view.
 * Handles all status-driven styles: done, done_late, active, incomplete, upcoming, future.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { MedicineEntry } from '../types/medicine';
import { DoseSession } from './DoseSessionCard';

// ─── Exported Types ──────────────────────────────────────────────

export type TimelineStatus = 'done' | 'done_late' | 'active' | 'incomplete' | 'upcoming' | 'future';

export interface TimeGroup {
    time: string;
    medicines: MedicineEntry[];
}

export interface SessionGroup extends DoseSession {
    timeGroups: TimeGroup[];
}

// ─── Props ───────────────────────────────────────────────────────

interface TimelineCardProps {
    session: SessionGroup;
    status: TimelineStatus;
    completedAtMap: Record<string, number>;
    isMedConfirmed: (sess: DoseSession, medId: string) => boolean;
    isMedSkipped?: (sess: DoseSession, medId: string) => boolean;
}

// ─── Session time window lookup ──────────────────────────────────
const SESSION_END_HOURS: Record<string, number> = {
    'sáng': 11, 'trưa': 15, 'chiều': 19, 'tối': 24,
};

// ─── Component ───────────────────────────────────────────────────

export default function TimelineCard({
    session: sess,
    status,
    completedAtMap,
    isMedConfirmed,
    isMedSkipped,
}: TimelineCardProps) {
    const isActive = status === 'active';
    const isDone = status === 'done';
    const isDoneLate = status === 'done_late';
    const isIncomplete = status === 'incomplete';

    const confirmedInSess = sess.medicines.filter(
        (m: MedicineEntry) => isMedConfirmed(sess, m.id),
    ).length;
    const skippedInSess = sess.medicines.filter(
        (m: MedicineEntry) => isMedSkipped?.(sess, m.id),
    ).length;

    return (
        <View style={[
            s.card,
            isDone && s.cardDone,
            isDoneLate && s.cardDoneLate,
            isActive && s.cardActive,
            isIncomplete && s.cardIncomplete,
        ]}>
            {/* Time groups — each with full header + medicine list */}
            {sess.timeGroups.map((tg: TimeGroup, tgIdx: number) => {
                const tgConfirmed = tg.medicines.filter(
                    (m: MedicineEntry) => isMedConfirmed(sess, m.id),
                ).length;
                return (
                    <View key={tg.time}>
                        {/* Divider between time groups */}
                        {tgIdx > 0 && (
                            <View style={s.timeGroupDivider} />
                        )}
                        {/* Header per time group */}
                        <View style={s.cardHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialCommunityIcons
                                    name={sess.icon as any}
                                    size={18}
                                    color={isActive ? '#3b82f6' : sess.iconColor}
                                />
                                <Text style={s.cardTitle}>
                                    {sess.label} — {tg.time}
                                </Text>
                            </View>
                            <Text style={[
                                s.cardCount,
                                isActive && s.cardCountActive,
                                (isDone || isDoneLate) && s.cardCountDone,
                            ]}>
                                {`${tgConfirmed}/${tg.medicines.length}`}
                            </Text>
                        </View>

                        {/* Medicine list */}
                        <View style={s.medList}>
                            {tg.medicines.map((med: MedicineEntry) => (
                                <MedicineRow
                                    key={med.id}
                                    med={med}
                                    sess={sess}
                                    isActive={isActive}
                                    isDone={isDone}
                                    isIncomplete={isIncomplete}
                                    completedAtMap={completedAtMap}
                                    isMedConfirmed={isMedConfirmed}
                                    isMedSkipped={isMedSkipped}
                                />
                            ))}
                        </View>
                    </View>
                );
            })}

            {/* ── Status footer ── */}
            {isDone && (
                <View style={s.statusFooter}>
                    <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                    <Text style={s.statusDoneText}>Đã hoàn thành</Text>
                </View>
            )}
            {isDoneLate && (
                <View style={s.statusFooter}>
                    <Ionicons name="timer-outline" size={14} color="#d97706" />
                    <Text style={s.statusDoneLateText}>Đã uống bù</Text>
                </View>
            )}
            {isActive && (
                <View style={s.statusFooter}>
                    <Ionicons name="time-outline" size={14} color="#2563eb" />
                    <Text style={s.statusActiveText}>Đang trong khung giờ</Text>
                </View>
            )}
            {isIncomplete && (() => {
                const missedCount = sess.medicines.length - confirmedInSess - skippedInSess;
                return (
                    <View>
                        {missedCount > 0 && (
                            <View style={s.statusFooter}>
                                <Ionicons name="warning" size={14} color="#d97706" />
                                <Text style={s.statusIncompleteText}>
                                    Thiếu {missedCount} liều
                                </Text>
                            </View>
                        )}
                        {skippedInSess > 0 && (
                            <View style={s.statusFooter}>
                                <Ionicons name="remove-circle-outline" size={14} color="#9CA3AF" />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9CA3AF', marginLeft: 4 }}>
                                    Đã bỏ qua {skippedInSess} liều
                                </Text>
                            </View>
                        )}
                    </View>
                );
            })()}
        </View>
    );
}

// ─── Medicine Row Sub-component ──────────────────────────────────

interface MedicineRowProps {
    med: MedicineEntry;
    sess: SessionGroup;
    isActive: boolean;
    isDone: boolean;
    isIncomplete: boolean;
    completedAtMap: Record<string, number>;
    isMedConfirmed: (sess: DoseSession, medId: string) => boolean;
    isMedSkipped?: (sess: DoseSession, medId: string) => boolean;
}

function MedicineRow({
    med,
    sess,
    isActive,
    isDone,
    isIncomplete,
    completedAtMap,
    isMedConfirmed,
    isMedSkipped,
}: MedicineRowProps) {
    const confirmed = isMedConfirmed(sess, med.id);
    const takenTs = completedAtMap[med.id];
    const takenTimeStr = takenTs
        ? new Date(takenTs).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '';

    // Detect if this specific med was taken late
    const sessionWin = SESSION_END_HOURS[sess.slotKey.toLowerCase()] || 24;
    const isMedLate = !!(confirmed && takenTs && new Date(takenTs).getHours() >= sessionWin);
    const isSkippedMed = !!(isMedSkipped && isMedSkipped(sess, med.id));
    const isMissedMed = isIncomplete && !confirmed && !isSkippedMed;

    return (
        <View style={s.medRow}>
            {/* Bullet indicator */}
            <View style={[
                s.medBullet,
                isActive && !confirmed && !isSkippedMed && s.medBulletActive,
                confirmed && !isMedLate && s.medBulletDone,
                confirmed && isMedLate && { backgroundColor: '#d97706' },
                isSkippedMed && { backgroundColor: '#9CA3AF' },
                isMissedMed && { backgroundColor: '#EF4444' },
            ]} />

            {/* Medicine name + dose */}
            <View style={{ flex: 1 }}>
                <Text style={[
                    s.medName,
                    isActive && !confirmed && s.medNameActive,
                    (isDone && !confirmed) && s.medNameDone,
                    confirmed && s.medNameTaken,
                ]}>
                    {med.name}
                    <Text style={[
                        s.medDose,
                        isActive && !confirmed && s.medDoseActive,
                        (isDone && !confirmed) && s.medDoseDone,
                        confirmed && s.medDoseTaken,
                    ]}>
                        {' '}({med.quantity} {med.unit})
                    </Text>
                </Text>
            </View>

            {/* Right badge: taken time / missed / meal timing */}
            {confirmed && takenTimeStr ? (
                <View style={[
                    s.takenBadge,
                    isMedLate && { backgroundColor: '#FEF3C7' },
                ]}>
                    <Feather name="check" size={12} color={isMedLate ? '#92400E' : '#166534'} />
                    <Text style={[
                        s.takenBadgeText,
                        isMedLate && { color: '#92400E' },
                    ]}>{takenTimeStr}</Text>
                </View>
            ) : isSkippedMed ? (
                <View style={s.skippedBadge}>
                    <Text style={s.skippedBadgeText}>Đã bỏ qua</Text>
                </View>
            ) : isMissedMed ? (
                <View style={s.missedBadge}>
                    <Text style={s.missedBadgeText}>Quên uống</Text>
                </View>
            ) : (
                med.mealTiming && med.mealTiming !== 'Tùy ý' && (
                    <View style={[
                        s.mealBadge,
                        isActive && s.mealBadgeActive,
                    ]}>
                        <Text style={[
                            s.mealBadgeText,
                            isActive && s.mealBadgeTextActive,
                        ]}>
                            {med.mealTiming}
                        </Text>
                    </View>
                )
            )}
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
    // ── Card container ──
    card: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        padding: 14,
        marginLeft: 10,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    cardDone: {
        backgroundColor: '#ffffff',
        borderColor: '#E5E7EB',
    },
    cardDoneLate: {
        backgroundColor: '#ffffff',
        borderColor: '#E5E7EB',
    },
    cardActive: {
        backgroundColor: '#EFF6FF',
        borderColor: '#BFDBFE',
        borderWidth: 1,
        opacity: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardIncomplete: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        opacity: 1,
    },

    // ── Time group divider ──
    timeGroupDivider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginVertical: 14,
    },

    // ── Card header ──
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1F2937',
    },
    cardCount: {
        fontSize: 12,
        fontWeight: '600',
        color: '#9ca3af',
    },
    cardCountActive: {
        color: '#6b7280',
    },
    cardCountDone: {
        color: '#6B7280',
    },

    // ── Medicine list ──
    medList: {
        gap: 8,
    },
    medRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    medBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#93c5fd',
        flexShrink: 0,
    },
    medBulletActive: {
        backgroundColor: '#9ca3af',
    },
    medBulletDone: {
        backgroundColor: '#86efac',
    },
    medName: {
        fontSize: 14,
        fontWeight: '400',
        color: '#111827',
    },
    medNameActive: {
        color: '#1f2937',
    },
    medNameDone: {
        color: '#374151',
    },
    medNameTaken: {
        color: '#1F2937',
    },
    medDose: {
        fontSize: 12,
        fontWeight: '400',
        color: '#6b7280',
    },
    medDoseActive: {
        color: '#6b7280',
    },
    medDoseDone: {
        color: '#6B7280',
    },
    medDoseTaken: {
        color: '#6B7280',
    },

    // ── Taken time badge ──
    takenBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#dcfce7',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    takenBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#166534',
    },

    // ── Missed badge ──
    missedBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    missedBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#EF4444',
    },

    // ── Skipped badge ──
    skippedBadge: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    skippedBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#6B7280',
    },

    // ── Meal timing badge ──
    mealBadge: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    mealBadgeActive: {
        backgroundColor: '#f3f4f6',
    },
    mealBadgeText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#6b7280',
    },
    mealBadgeTextActive: {
        color: '#374151',
    },

    // ── Status footer ──
    statusFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 10,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    statusDoneText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#16a34a',
    },
    statusDoneLateText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#d97706',
    },
    statusActiveText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2563eb',
    },
    statusIncompleteText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#d97706',
    },
});
