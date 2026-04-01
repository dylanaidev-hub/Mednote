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
import MedicineDetailCard from '../components/MedicineDetailCard';

// ─── Spacing tokens (mirrors ManualAddScreen / RoutineAddScreen) ──
const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export default function ManualAddReviewScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { recordTitle, hospital, date, duration, medicines } = route.params as {
        recordTitle?: string; hospital: string; date: string; duration: number; medicines: MedicineEntry[];
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
            recordTitle: recordTitle || undefined,
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

                {/* ── Overview Card ────────────────────────────────── */}
                <View style={s.overviewCard}>
                    <View style={s.overviewHeaderRow}>
                        <View style={s.squircle}>
                            <MaterialCommunityIcons name="clipboard-text" size={22} color="#2563eb" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={s.overviewTitle} numberOfLines={1}>
                                {recordTitle || hospital || 'Chưa có tên bệnh án'}
                            </Text>
                            <Text style={s.overviewSubtitle}>{hospital || 'Đơn thuốc chỉ định'}</Text>
                        </View>
                    </View>

                    <View style={s.cardDivider} />

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
                            <Text style={s.metaLabel}>NGÀY BẮT ĐẦU UỐNG</Text>
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

                {/* ── Medicine cards (reused component) ────────────── */}
                <View style={{ gap: 16 }}>
                    {medicines.map((med: MedicineEntry) => (
                        <MedicineDetailCard key={med.id} medicine={med} />
                    ))}
                </View>
            </ScrollView>

            {/* ══ Sticky Bottom CTA ═════════════════════════════════ */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <PrimaryButton
                    title={saving ? 'Đang thiết lập...' : 'Xác nhận & Lưu'}
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

    // Header
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
        backgroundColor: '#ffffff', borderRadius: 16,
        borderWidth: 1, borderColor: '#f1f5f9',
        padding: SP.md, marginBottom: SP.xl,
    },
    overviewHeaderRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingBottom: SP.md,
    },
    squircle: {
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
    },
    overviewTitle: { fontSize: 17, fontWeight: '700', color: '#1f2937' },
    overviewSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    cardDivider: { height: 1, backgroundColor: '#e5e7eb', marginBottom: SP.md },

    // 2-col metadata grid
    metaGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 12 },
    metaCell: { width: '47%' },
    metaLabel: {
        fontSize: 11, fontWeight: '700', color: '#9ca3af',
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3,
    },
    metaValue: { fontSize: 15, fontWeight: '600', color: '#1f2937' },

    // Section label
    sectionLabel: {
        fontSize: 12, fontWeight: '700', color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: SP.md,
    },

    // ── Sticky footer ─────────────────────────────────────────────
    footer: {
        paddingHorizontal: SP.lg, paddingTop: 14,
        backgroundColor: '#ffffff',
        borderTopWidth: 1, borderTopColor: '#f1f5f9',
        shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 8,
    },
});
