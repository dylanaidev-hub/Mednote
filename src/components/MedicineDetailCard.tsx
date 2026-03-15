import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MedicineEntry } from '../types/medicine';

// ─── Design tokens ───────────────────────────────────────────────
const NAVY_TEXT = '#111827';
const GRAY_500 = '#6b7280';
const GRAY_100 = '#E5E7EB';

const SESSION_THEME: Record<string, { icon: string; color: string }> = {
    'Sáng': { icon: 'weather-sunny', color: '#f59e0b' },
    'Trưa': { icon: 'weather-partly-cloudy', color: '#f97316' },
    'Chiều': { icon: 'weather-sunset', color: '#ef4444' },
    'Tối': { icon: 'moon-waning-crescent', color: '#6366f1' },
};

// ─── Dynamic icon config ─────────────────────────────────────────
function getIconConfig(med: MedicineEntry, isActive: boolean) {
    if (med.source === 'routine') {
        return { family: 'MaterialCommunityIcons' as const, name: 'leaf', color: '#10b981', bgColor: '#ecfdf5' };
    }
    const unit = (med.unit || '').toLowerCase();
    if (unit.includes('gói')) {
        return { family: 'Ionicons' as const, name: 'cube-outline', color: '#f59e0b', bgColor: '#fef3c7' };
    }
    if (unit.includes('ml') || unit.includes('lọ') || unit.includes('ống') || unit.includes('chai')) {
        return { family: 'Ionicons' as const, name: 'water-outline', color: '#0ea5e9', bgColor: '#e0f2fe' };
    }
    return { family: 'MaterialCommunityIcons' as const, name: 'pill', color: isActive ? '#3b82f6' : '#9ca3af', bgColor: isActive ? '#eff6ff' : '#f3f4f6' };
}

// ─── Props ───────────────────────────────────────────────────────
interface MedicineDetailCardProps {
    medicine: MedicineEntry;
    isActive?: boolean;
}

// ─── Component ───────────────────────────────────────────────────
export default function MedicineDetailCard({ medicine: med, isActive = true }: MedicineDetailCardProps) {
    const iconCfg = getIconConfig(med, isActive);

    // Group session times by slot
    const grouped: Record<string, string[]> = {};
    Object.entries(med.sessionTimes || {}).forEach(([key, time]) => {
        const baseSession = key.includes('_sub_') ? key.split('_sub_')[0] : key;
        const displayKey = baseSession.charAt(0).toUpperCase() + baseSession.slice(1);
        if (!grouped[displayKey]) grouped[displayKey] = [];
        grouped[displayKey].push(time);
    });

    return (
        <View
            style={{
                backgroundColor: '#fff',
                borderRadius: 24,
                padding: 24,
                borderWidth: 1,
                borderColor: GRAY_100,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 8,
                elevation: 2,
            }}
        >
            {/* ── Header: Icon + Name + Dosage ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <View style={{
                    width: 56, height: 56, borderRadius: 18,
                    alignItems: 'center', justifyContent: 'center', marginRight: 16,
                    backgroundColor: iconCfg.bgColor,
                }}>
                    {iconCfg.family === 'Ionicons' ? (
                        <Ionicons name={iconCfg.name as any} size={28} color={iconCfg.color} />
                    ) : (
                        <MaterialCommunityIcons name={iconCfg.name as any} size={28} color={iconCfg.color} />
                    )}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: NAVY_TEXT }}>{med.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: GRAY_500 }}>{med.quantity} {med.unit} / lần uống</Text>
                </View>
            </View>

            {/* ── Body: Meal Timing + Session Times ── */}
            <View style={{ borderTopWidth: 1, borderColor: '#F3F4F6', paddingTop: 16 }}>

                {/* Meal Timing */}
                {med.mealTiming ? (
                    <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#4B5563" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, fontWeight: '700', color: '#4B5563' }}>Cách uống</Text>
                            </View>
                            <View style={{ backgroundColor: '#F9FAFB', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                                <Text style={{ fontSize: 15, fontWeight: '700', color: NAVY_TEXT }}>{med.mealTiming}</Text>
                            </View>
                        </View>
                        <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 }} />
                    </>
                ) : null}

                {/* Session Times */}
                {Object.entries(grouped).map(([session, times]) => {
                    const theme = SESSION_THEME[session] || { icon: 'clock-outline', color: GRAY_500 };
                    return (
                        <View key={session} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 4 }}>
                                <MaterialCommunityIcons name={theme.icon as any} size={18} color={theme.color} style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.color }}>{session}</Text>
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, paddingLeft: 16 }}>
                                {times.sort().map((time, tIdx) => (
                                    <View key={tIdx} style={{ backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                                        <Text style={{ fontSize: 15, fontWeight: '700', color: NAVY_TEXT }}>{time}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* ── Note ── */}
            {med.note ? (
                <View style={{ backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="create-outline" size={14} color="#6B7280" />
                        <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '700', color: '#6B7280' }}>Ghi chú</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: '#374151', lineHeight: 20 }}>{med.note}</Text>
                </View>
            ) : null}
        </View>
    );
}
