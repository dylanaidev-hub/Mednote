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

export default function SessionTimeSelector({
    frequency,
    sessionTimes,
    onUpdate,
    showError
}: SessionTimeSelectorProps) {
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [pickerConfig, setPickerConfig] = useState<{ timeId: string, initialTime: string, title: string } | null>(null);

    const toggleFrequency = (timeId: string) => {
        const alreadySelected = frequency.includes(timeId);
        let newFreq: string[];
        let newSessionTimes = { ...sessionTimes };

        if (alreadySelected) {
            newFreq = frequency.filter(t => t !== timeId);
            delete newSessionTimes[timeId]; // Clean up so it doesn't appear in saved data
        } else {
            newFreq = [...frequency, timeId];
            if (!newSessionTimes[timeId] && SESSION_DEFAULTS[timeId]) {
                newSessionTimes[timeId] = SESSION_DEFAULTS[timeId];
            }
        }

        // Auto-sort frequency whenever it changes (even on toggle)
        newFreq = sortFrequency(newFreq, newSessionTimes);
        onUpdate(newFreq, newSessionTimes);
    };

    const updateSessionTime = (timeId: string, timeValue: string) => {
        const newSessionTimes = { ...sessionTimes, [timeId]: timeValue };
        const newFreq = sortFrequency(frequency, newSessionTimes);
        onUpdate(newFreq, newSessionTimes);
    };

    const sortFrequency = (freq: string[], times: Record<string, string>) => {
        return [...freq].sort((a, b) => {
            const timeA = times[a] || '00:00';
            const timeB = times[b] || '00:00';
            return timeA.localeCompare(timeB);
        });
    };

    const addCustomTime = () => {
        const id = `custom_${Date.now()}`;
        const newFreq = [...frequency, id];
        const newSessionTimes = { ...sessionTimes, [id]: '22:00' };
        onUpdate(sortFrequency(newFreq, newSessionTimes), newSessionTimes);
    };

    const removeCustomTime = (id: string) => {
        const newFreq = frequency.filter(t => t !== id);
        const newSessionTimes = { ...sessionTimes };
        delete newSessionTimes[id];
        onUpdate(newFreq, newSessionTimes);
    };

    const handleConfirm = (date: Date) => {
        if (pickerConfig) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const newTime = `${hours}:${minutes}`;

            // Duplicate Time Check
            const duplicateSessionId = Object.keys(sessionTimes).find(id =>
                id !== pickerConfig.timeId && sessionTimes[id] === newTime && frequency.includes(id)
            );

            if (duplicateSessionId) {
                const sessionLabel = SESSIONS.find(t => t.id === duplicateSessionId)?.label || 'khác';
                Alert.alert(
                    'Trùng mốc giờ',
                    `Giờ này trùng với buổi ${sessionLabel}. Vui lòng chọn mốc thời gian khác!`
                );
                return;
            }

            updateSessionTime(pickerConfig.timeId, newTime);
        }
        setShowTimePicker(false);
    };

    const handleCancel = () => {
        setShowTimePicker(false);
    };

    return (
        <View>
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

            {/* Dynamic Time Rows List */}
            <View style={s.timeRowsList}>
                {frequency.map(id => {
                    const isCustom = id.startsWith('custom_');
                    const timeValue = sessionTimes[id] || SESSION_DEFAULTS[id] || '08:00';
                    const sessionConfig = SESSIONS.find(t => t.id === id);

                    const label = isCustom ? 'Tùy chỉnh' : (sessionConfig?.label || id);
                    const icon = isCustom ? 'clock-outline' : sessionConfig?.icon;
                    const iconColor = isCustom ? '#2563eb' : sessionConfig?.iconColor;

                    return (
                        <View key={id} style={s.timeRowItem}>
                            <View style={s.timeRowLeft}>
                                <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
                                <Text style={s.timeRowLabel}>{isCustom ? label : `Buổi ${label}`}</Text>
                            </View>

                            <View style={s.timeRowRight}>
                                <TouchableOpacity
                                    style={s.timeInputBtn}
                                    onPress={() => {
                                        setPickerConfig({
                                            timeId: id,
                                            initialTime: timeValue,
                                            title: `Chọn giờ uống ${isCustom ? label : `Buổi ${label}`}`
                                        });
                                        setShowTimePicker(true);
                                    }}
                                >
                                    <Text style={s.timeInputValue}>{timeValue}</Text>
                                    <Ionicons name="chevron-down" size={14} color="#9ca3af" />
                                </TouchableOpacity>

                                {isCustom && (
                                    <TouchableOpacity
                                        onPress={() => removeCustomTime(id)}
                                        style={s.removeTimeRowBtn}
                                    >
                                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    );
                })}

                {/* Add Custom Time Button */}
                <TouchableOpacity style={s.addCustomBtn} onPress={addCustomTime}>
                    <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
                    <Text style={s.addCustomText}>Thêm mốc giờ tùy chỉnh</Text>
                </TouchableOpacity>
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
                onCancel={handleCancel}
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
    timeRowItem: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
        borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
    },
    timeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeRowLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
    timeRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    timeInputBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
    },
    timeInputValue: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
    removeTimeRowBtn: { padding: 2 },
    addCustomBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, marginTop: 4,
        borderWidth: 1, borderStyle: 'dashed', borderColor: '#c7d2fe', borderRadius: 12,
        backgroundColor: '#f5f7ff',
    },
    addCustomText: { fontSize: 13, fontWeight: '600', color: '#6366f1' },
});
