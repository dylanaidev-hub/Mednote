import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { SESSIONS, SESSION_DEFAULTS } from '../types/medicine';

interface SessionTimeSelectorProps {
    frequency: string[];
    sessionTimes: Record<string, string>;
    onUpdate: (frequency: string[], sessionTimes: Record<string, string>) => void;
    showError?: boolean;
}

const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// ─── Helpers ─────────────────────────────────────────────────────

/** Check if a key is a sub-time of a session (e.g. "Sáng_sub_171000") */
function isSubTime(key: string): boolean {
    return key.includes('_sub_');
}

/** Get the parent session ID from a sub-time key */
function getParentSession(key: string): string {
    return key.split('_sub_')[0];
}

/** Get all sub-time keys for a given session (case-insensitive parent match) */
function getSubTimesForSession(sessionId: string, sessionTimes: Record<string, string>): string[] {
    const lowerSessionId = sessionId.toLowerCase();
    return Object.keys(sessionTimes).filter(k =>
        isSubTime(k) && getParentSession(k).toLowerCase() === lowerSessionId
    );
}

// ─── Component ───────────────────────────────────────────────────

export default function SessionTimeSelector({
    frequency,
    sessionTimes,
    onUpdate,
    showError
}: SessionTimeSelectorProps) {
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [pickerConfig, setPickerConfig] = useState<{ timeId: string, initialTime: string, title: string } | null>(null);

    // ─── Sort by time value ──────────────────────────────────
    const sortFrequency = (freq: string[], times: Record<string, string>) => {
        return [...freq].sort((a, b) => {
            const timeA = times[a] || '00:00';
            const timeB = times[b] || '00:00';
            return timeA.localeCompare(timeB);
        });
    };

    // ─── Toggle session on/off ───────────────────────────────
    const toggleFrequency = (timeId: string) => {
        const alreadySelected = frequency.includes(timeId);
        let newFreq: string[];
        let newSessionTimes = { ...sessionTimes };

        if (alreadySelected) {
            newFreq = frequency.filter(t => t !== timeId);
            delete newSessionTimes[timeId];
            // Also remove all sub-times for this session
            const normalizedId = SESSIONS.find(s => s.id === timeId)?.label || timeId;
            const subKeys = getSubTimesForSession(normalizedId, newSessionTimes);
            subKeys.forEach(k => {
                delete newSessionTimes[k];
                newFreq = newFreq.filter(f => f !== k);
            });
            // Also try lowercase version
            const subKeys2 = getSubTimesForSession(timeId, newSessionTimes);
            subKeys2.forEach(k => {
                delete newSessionTimes[k];
                newFreq = newFreq.filter(f => f !== k);
            });
        } else {
            newFreq = [...frequency, timeId];
            if (!newSessionTimes[timeId] && SESSION_DEFAULTS[timeId]) {
                newSessionTimes[timeId] = SESSION_DEFAULTS[timeId];
            }
        }

        newFreq = sortFrequency(newFreq, newSessionTimes);
        onUpdate(newFreq, newSessionTimes);
    };

    // ─── Update time value ───────────────────────────────────
    const updateSessionTime = (timeId: string, timeValue: string) => {
        const newSessionTimes = { ...sessionTimes, [timeId]: timeValue };
        const newFreq = sortFrequency(frequency, newSessionTimes);
        onUpdate(newFreq, newSessionTimes);
    };

    // ─── Add sub-time to a session ───────────────────────────
    const addSubTime = (sessionId: string) => {
        // Use sessionId (lowercase, e.g. "sáng") to match primary key casing
        const subId = `${sessionId}_sub_${Date.now()}`;
        // Default sub-time: primary time + 2 hours
        const primaryTime = sessionTimes[sessionId] || SESSION_DEFAULTS[sessionId] || '08:00';
        const [h, m] = primaryTime.split(':').map(Number);
        const newH = Math.min(h + 2, 23);
        const subTime = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        const newFreq = [...frequency, subId];
        const newSessionTimes = { ...sessionTimes, [subId]: subTime };
        onUpdate(sortFrequency(newFreq, newSessionTimes), newSessionTimes);
    };

    // ─── Remove sub-time ─────────────────────────────────────
    const removeSubTime = (subId: string) => {
        const newFreq = frequency.filter(t => t !== subId);
        const newSessionTimes = { ...sessionTimes };
        delete newSessionTimes[subId];
        onUpdate(newFreq, newSessionTimes);
    };

    // ─── TimePicker confirm ──────────────────────────────────
    const handleConfirm = (date: Date) => {
        if (pickerConfig) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const newTime = `${hours}:${minutes}`;

            // Duplicate check
            const duplicateId = Object.keys(sessionTimes).find(id =>
                id !== pickerConfig.timeId && sessionTimes[id] === newTime && frequency.includes(id)
            );

            if (duplicateId) {
                Alert.alert(
                    'Trùng mốc giờ',
                    `Giờ ${newTime} đã tồn tại. Vui lòng chọn mốc thời gian khác!`
                );
                return;
            }

            updateSessionTime(pickerConfig.timeId, newTime);
        }
        setShowTimePicker(false);
    };

    // ─── Open time picker for a given key ────────────────────
    const openPicker = (timeId: string, label: string) => {
        const timeValue = sessionTimes[timeId] || SESSION_DEFAULTS[timeId] || '08:00';
        setPickerConfig({
            timeId,
            initialTime: timeValue,
            title: `Chọn giờ uống ${label}`
        });
        setShowTimePicker(true);
    };

    return (
        <View>
            {/* ── Session Grid (Sáng/Trưa/Chiều/Tối) ── */}
            <View style={[s.timeGrid, showError && frequency.length === 0 && s.gridError]}>
                {SESSIONS.map(t => {
                    const active = frequency.includes(t.id);
                    return (
                        <TouchableOpacity
                            key={t.id}
                            style={[s.timeChip, active && { backgroundColor: t.activeBg, borderColor: t.activeBorder }]}
                            onPress={() => toggleFrequency(t.id)}
                            activeOpacity={0.75}
                        >
                            <MaterialCommunityIcons
                                name={t.icon as any}
                                size={22}
                                color={active ? t.activeColor : '#9ca3af'}
                                style={{ marginBottom: 4 }}
                            />
                            <Text style={[s.timeLabel, active && { color: t.activeColor }]}>{t.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* ── Time Rows (primary + sub-times per session) ── */}
            <View style={s.timeRowsList}>
                {frequency.filter(id => !isSubTime(id)).map(id => {
                    const sessionConfig = SESSIONS.find(t => t.id === id);
                    if (!sessionConfig) return null;

                    const timeValue = sessionTimes[id] || SESSION_DEFAULTS[id] || '08:00';
                    const normalizedLabel = sessionConfig.label;
                    const subTimes = getSubTimesForSession(normalizedLabel, sessionTimes);

                    return (
                        <View key={id} style={s.sessionCard}>
                            {/* Primary Time Row */}
                            <View style={s.mainRow}>
                                <View style={s.timeRowLeft}>
                                    <MaterialCommunityIcons name={sessionConfig.icon as any} size={20} color={sessionConfig.iconColor} />
                                    <Text style={s.timeRowLabel}>Buổi {normalizedLabel}</Text>
                                </View>

                                <TouchableOpacity
                                    style={s.timeInputBtn}
                                    onPress={() => openPicker(id, `Buổi ${normalizedLabel}`)}
                                >
                                    <Text style={s.timeInputValue}>{timeValue}</Text>
                                    <Ionicons name="chevron-down" size={14} color="#9ca3af" />
                                </TouchableOpacity>
                            </View>

                            {/* Sub-Time Rows (only TimePicker + Delete) */}
                            {subTimes.map(subId => {
                                const subTime = sessionTimes[subId] || '08:00';
                                return (
                                    <View key={subId} style={s.subTimeRow}>
                                        <View style={s.subTimeIndent}>
                                            <View style={s.subTimeLine} />
                                            <View style={s.subTimeDot} />
                                        </View>
                                        <TouchableOpacity
                                            style={s.timeInputBtn}
                                            onPress={() => openPicker(subId, `Buổi ${normalizedLabel}`)}
                                        >
                                            <Text style={s.timeInputValue}>{subTime}</Text>
                                            <Ionicons name="chevron-down" size={14} color="#9ca3af" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => removeSubTime(subId)}
                                            style={s.removeSubBtn}
                                        >
                                            <Ionicons name="close-circle" size={20} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}

                            {/* + Thêm giờ uống buổi X */}
                            <TouchableOpacity
                                style={s.addSubBtn}
                                onPress={() => addSubTime(id)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="add" size={16} color={sessionConfig.activeColor} />
                                <Text style={[s.addSubText, { color: sessionConfig.activeColor }]}>
                                    Thêm giờ uống buổi {normalizedLabel.toLowerCase()}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </View>

            <DateTimePickerModal
                isVisible={showTimePicker}
                mode="time"
                date={(() => {
                    if (!pickerConfig) return new Date();
                    const [h, m] = pickerConfig.initialTime.split(':');
                    const d = new Date();
                    d.setHours(parseInt(h), parseInt(m), 0, 0);
                    return d;
                })()}
                onConfirm={handleConfirm}
                onCancel={() => setShowTimePicker(false)}
                confirmTextIOS="Xong"
                cancelTextIOS="Hủy"
                is24Hour={true}
                locale="vi-VN"
                customHeaderIOS={() => (
                    <View style={{ padding: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1f2937' }}>
                            {pickerConfig?.title || 'Chọn giờ uống'}
                        </Text>
                    </View>
                )}
            />
        </View>
    );
}

const s = StyleSheet.create({
    timeGrid: {
        flexDirection: 'row', justifyContent: 'space-between',
        gap: SP.sm,
        marginBottom: 0,
    },
    timeChip: {
        flex: 1, flexDirection: 'column', alignItems: 'center',
        paddingVertical: 14, borderRadius: 14,
        backgroundColor: '#f3f4f6',
        borderWidth: 1.5, borderColor: 'transparent',
    },
    timeLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 2 },
    gridError: { borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14, padding: SP.xs, backgroundColor: '#fff5f5' },

    timeRowsList: { marginTop: SP.md, gap: SP.sm },

    // Session card — wraps primary + sub-times + add button
    sessionCard: {
        backgroundColor: '#fff', borderRadius: 12,
        borderWidth: 1, borderColor: '#f1f5f9',
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
    },
    mainRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    timeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeRowLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
    timeInputBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
    },
    timeInputValue: { fontSize: 15, fontWeight: '700', color: '#2563eb' },

    // Sub-time rows (inside card)
    subTimeRow: {
        flexDirection: 'row', alignItems: 'center',
        marginTop: 8, paddingLeft: 8,
        gap: 10,
    },
    subTimeIndent: {
        flexDirection: 'column', alignItems: 'center',
        width: 20, marginRight: 0,
    },
    subTimeLine: {
        width: 1.5, height: 10,
        backgroundColor: '#e5e7eb',
    },
    subTimeDot: {
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: '#d1d5db',
    },
    removeSubBtn: { padding: 2 },

    // Add sub-time button (inside card)
    addSubBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 4, marginTop: 8, paddingTop: 8, paddingBottom: 4,
        borderTopWidth: 1, borderTopColor: '#f3f4f6',
    },
    addSubText: {
        fontSize: 12, fontWeight: '600',
    },
});
