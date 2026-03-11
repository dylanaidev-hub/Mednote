import React from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MedicineEntry } from '../types/medicine';
import { useMedContext, Prescription } from '../context/MedContext';
import PrimaryButton from '../components/PrimaryButton';

// ─── Spacing tokens (mirrors ManualAddScreen / RoutineAddScreen) ──
const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export default function ManualAddReviewScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { hospital, date, duration, medicines } = route.params as {
        hospital: string; date: string; duration: number; medicines: MedicineEntry[];
    };

    const [saving, setSaving] = React.useState(false);
    const [success, setSuccess] = React.useState(false);
    const { addPrescription } = useMedContext();

    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + duration);

    // ── Save handler ──────────────────────────────────────────────
    const handleFinalSave = async () => {
        setSaving(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const newPrescription: Prescription = {
            id: Date.now().toString(),
            hospital,
            date,
            duration,
            medicines,
            createdAt: new Date().toISOString(),
        };

        try {
            await addPrescription(newPrescription);
            setSaving(false);
            setSuccess(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            setTimeout(() => {
                navigation.dispatch(
                    CommonActions.reset({
                        index: 0,
                        routes: [{
                            name: 'MainTabs',
                            state: { routes: [{ name: 'Records' }] },
                        }],
                    })
                );
            }, 1800);
        } catch {
            setSaving(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    // ── Success state ─────────────────────────────────────────────
    if (success) {
        return (
            <View style={s.successRoot}>
                <View style={s.successIconWrap}>
                    <Ionicons name="checkmark-circle" size={80} color="#10b981" />
                </View>
                <Text style={s.successTitle}>Đã lưu đơn thuốc!</Text>
                <Text style={s.successSubtitle}>
                    Đơn thuốc đã được bảo mật. Lịch nhắc thuốc thiết lập cho {duration} ngày tới.
                </Text>
            </View>
        );
    }

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>

            {/* ══ Header ═══════════════════════════════════════════ */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={22} color="#374151" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Kiểm tra lần cuối</Text>
            </View>

            {/* ══ Scrollable Content ════════════════════════════════ */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 90 }]}
                showsVerticalScrollIndicator={false}
            >

                {/* ── Overview Card (white, clinical) ──────────────── */}
                <View style={s.overviewCard}>
                    {/* Card header row */}
                    <View style={s.overviewHeaderRow}>
                        <View style={s.squircle}>
                            <MaterialCommunityIcons name="clipboard-text" size={22} color="#2563eb" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={s.overviewHospital} numberOfLines={1}>
                                {hospital || 'Chưa có tên cơ sở'}
                            </Text>
                            <Text style={s.overviewSubtitle}>Đơn thuốc chỉ định</Text>
                        </View>
                    </View>

                    {/* Divider */}
                    <View style={s.cardDivider} />

                    {/* Metadata grid — 2 columns */}
                    <View style={s.metaGrid}>
                        <View style={s.metaCell}>
                            <Text style={s.metaLabel}>SỐ LƯỢNG</Text>
                            <Text style={s.metaValue}>{medicines.length} loại thuốc</Text>
                        </View>
                        <View style={s.metaCell}>
                            <Text style={s.metaLabel}>THỜI HẠN</Text>
                            <Text style={s.metaValue}>{duration} ngày</Text>
                        </View>
                        <View style={s.metaCell}>
                            <Text style={s.metaLabel}>NGÀY KHÁM</Text>
                            <Text style={s.metaValue}>{startDate.toLocaleDateString('vi-VN')}</Text>
                        </View>
                        <View style={s.metaCell}>
                            <Text style={s.metaLabel}>KẾT THÚC</Text>
                            <Text style={s.metaValue}>{endDate.toLocaleDateString('vi-VN')}</Text>
                        </View>
                    </View>
                </View>

                {/* ── Section label ─────────────────────────────────── */}
                <Text style={s.sectionLabel}>Chi tiết thuốc ({medicines.length})</Text>

                {/* ── Drug item cards ───────────────────────────────── */}
                {medicines.map((med: MedicineEntry, index: number) => (
                    <View key={med.id} style={s.drugCard}>
                        {/* Left: squircle icon */}
                        <View style={s.drugIconWrap}>
                            <MaterialCommunityIcons name="pill" size={20} color="#2563eb" />
                        </View>

                        {/* Right: info stack */}
                        <View style={s.drugInfo}>
                            {/* Row: index badge + name */}
                            <View style={s.drugNameRow}>
                                <View style={s.indexBadge}>
                                    <Text style={s.indexBadgeText}>{index + 1}</Text>
                                </View>
                                <Text style={s.drugName} numberOfLines={2}>{med.name}</Text>
                            </View>

                            {/* Dosage */}
                            <Text style={s.drugDosage}>{med.quantity} {med.unit} / lần</Text>

                            {/* Meal timing chip */}
                            {med.mealTiming ? (
                                <View style={s.tagRow}>
                                    <View style={[s.tag, s.tagMeal]}>
                                        <Ionicons name="restaurant-outline" size={12} color="#374151" />
                                        <Text style={s.tagText}>{med.mealTiming}</Text>
                                    </View>
                                </View>
                            ) : null}

                            {/* Frequency chips — grouped by session */}
                            {med.frequency.length > 0 && (() => {
                                // Group times by cleaned session name
                                const grouped: Record<string, string[]> = {};
                                med.frequency.forEach(freq => {
                                    const baseSession = freq.includes('_sub_') ? freq.split('_sub_')[0] : freq;
                                    const cleanLabel = baseSession.charAt(0).toUpperCase() + baseSession.slice(1);
                                    const time = med.sessionTimes?.[freq];
                                    if (!grouped[cleanLabel]) grouped[cleanLabel] = [];
                                    if (time && !grouped[cleanLabel].includes(time)) {
                                        grouped[cleanLabel].push(time);
                                    }
                                });

                                return (
                                    <View style={s.tagRow}>
                                        {Object.entries(grouped).map(([session, times]) => {
                                            const sortedTimes = times.sort();
                                            const label = sortedTimes.length > 0
                                                ? `${session} (${sortedTimes.join(', ')})`
                                                : session;
                                            return (
                                                <View key={session} style={[s.tag, s.tagFreq]}>
                                                    <Ionicons name="time-outline" size={12} color="#2563eb" />
                                                    <Text style={[s.tagText, { color: '#2563eb' }]}>{label}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                );
                            })()}

                            {/* Optional note */}
                            {med.note ? (
                                <View style={s.noteBox}>
                                    <Ionicons name="information-circle-outline" size={14} color="#6b7280" />
                                    <Text style={s.noteText}>{med.note}</Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* ══ Sticky Bottom CTA ═════════════════════════════════ */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <PrimaryButton
                    title={saving ? 'Đang thiết lập...' : 'Hoàn tất lưu thủ công'}
                    icon="checkmark-circle"
                    onPress={handleFinalSave}
                    loading={saving}
                    disabled={saving}
                />
            </View>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f8fafc' },

    // Success screen
    successRoot: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: SP.lg },
    successIconWrap: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginBottom: SP.lg },
    successTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937', marginBottom: SP.sm, textAlign: 'center' },
    successSubtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, paddingHorizontal: SP.md },

    // Header (same as ManualAddScreen)
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: SP.md, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
        backgroundColor: '#f8fafc',
    },
    backBtn: {
        position: 'absolute', left: SP.md,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
        zIndex: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: SP.lg, paddingTop: SP.lg },

    // ── Overview Card ─────────────────────────────────────────────
    overviewCard: {
        backgroundColor: '#ffffff', borderRadius: 18,
        borderWidth: 1, borderColor: '#e5e7eb',
        padding: SP.lg, marginBottom: SP.xl,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    overviewHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SP.md },
    squircle: {
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
    },
    overviewHospital: { fontSize: 17, fontWeight: '700', color: '#1f2937' },
    overviewSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    cardDivider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: SP.md },

    // 2-col metadata grid
    metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metaCell: { width: '47%' },
    metaLabel: {
        fontSize: 11, fontWeight: '700', color: '#9ca3af',
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3,
    },
    metaValue: { fontSize: 15, fontWeight: '700', color: '#1f2937' },

    // Section label (same style as ManualAddScreen / RoutineAddScreen)
    sectionLabel: {
        fontSize: 12, fontWeight: '700', color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: SP.md,
    },

    // ── Drug item card ────────────────────────────────────────────
    drugCard: {
        backgroundColor: '#ffffff', borderRadius: 16,
        borderWidth: 1, borderColor: '#e5e7eb',
        flexDirection: 'row', alignItems: 'flex-start',
        padding: SP.md, marginBottom: SP.md,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
    },
    drugIconWrap: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
        marginRight: SP.md, flexShrink: 0,
    },
    drugInfo: { flex: 1 },

    drugNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
    indexBadge: {
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    indexBadgeText: { fontSize: 11, fontWeight: '800', color: '#2563eb' },
    drugName: { fontSize: 15, fontWeight: '700', color: '#1f2937', flex: 1 },
    drugDosage: { fontSize: 13, color: '#6b7280', marginBottom: 8 },

    // Tag row
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    tag: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    },
    tagMeal: { backgroundColor: '#f3f4f6' },
    tagFreq: { backgroundColor: '#eff6ff' },
    tagText: { fontSize: 12, fontWeight: '600', color: '#374151' },

    // Note box
    noteBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        backgroundColor: '#f9fafb', borderRadius: 10,
        padding: 10, marginTop: 4, borderWidth: 1, borderColor: '#f3f4f6',
    },
    noteText: { flex: 1, fontSize: 13, color: '#6b7280', lineHeight: 18 },

    // ── Sticky footer ─────────────────────────────────────────────
    footer: {
        paddingHorizontal: SP.lg, paddingTop: 14,
        backgroundColor: '#ffffff',
        borderTopWidth: 1, borderTopColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 8,
    },
    ctaBtn: {
        backgroundColor: '#111827', borderRadius: 50,
        paddingVertical: 16, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: SP.sm,
    },
    ctaBtnDisabled: { backgroundColor: '#9ca3af' },
    ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
