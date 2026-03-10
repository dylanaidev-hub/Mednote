import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Keyboard, Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMedContext, Prescription } from '../context/MedContext';
import { MedicineEntry } from '../types/medicine';
import SessionTimeSelector from '../components/SessionTimeSelector';

// ─── Default blank form state ────────────────────────────────────
const blankForm = (): MedicineEntry => ({
    id: Date.now().toString(),
    name: '',
    quantity: '',
    unit: 'Viên',
    frequency: [],
    sessionTimes: {},
    mealTiming: '',
    note: '',
    hasError: false,
});

// ─── Routine Add Screen ──────────────────────────────────────────
export default function RoutineAddScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { addPrescription } = useMedContext();

    const [form, setForm] = useState<MedicineEntry>(blankForm());
    const [hasError, setHasError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const units = ['Viên', 'Gói', 'Lọ', 'ml', 'ống'];
    const mealTimings = ['Trước ăn', 'Sau ăn', 'Khi đói', 'Tùy ý'];
    const times = []; // Sessions now managed by SessionTimeSelector

    // ─── Form Helpers ──────────────────────────────────────────
    const update = <K extends keyof MedicineEntry>(field: K, value: MedicineEntry[K]) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (hasError) setHasError(false);
    };

    const updateSessions = (frequency: string[], sessionTimes: Record<string, string>) => {
        setForm(prev => ({ ...prev, frequency, sessionTimes }));
        if (hasError) setHasError(false);
    };

    // ─── Validation ───────────────────────────────────────────
    const validate = (): boolean => {
        if (!form.name.trim() || !form.quantity.trim() || form.frequency.length === 0 || !form.mealTiming) {
            setHasError(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return false;
        }
        return true;
    };

    // ─── Build Payload (1 medicine → 1 record) ───────────────
    const buildRecord = (): Prescription => ({
        id: `routine_${Date.now()}`,
        hospital: 'Thuốc định kỳ',
        date: new Date().toISOString(),
        duration: 999,
        medicines: [{ ...form, id: Date.now().toString() }],
        createdAt: new Date().toISOString(),
    });

    // ─── Save & Go Back ───────────────────────────────────────
    const handleSave = async () => {
        Keyboard.dismiss();
        if (!validate()) return;
        setIsSaving(true);
        try {
            await addPrescription(buildRecord());
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.goBack();
        } catch {
            Alert.alert('Lỗi', 'Không thể lưu thuốc. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Save & Add Another ───────────────────────────────────
    const handleSaveAndAddMore = async () => {
        Keyboard.dismiss();
        if (!validate()) return;
        setIsSaving(true);
        try {
            await addPrescription(buildRecord());
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setForm({ ...blankForm(), id: Date.now().toString() });
            setHasError(false);
        } catch {
            Alert.alert('Lỗi', 'Không thể lưu thuốc. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    const showError = hasError && (!form.name.trim() || !form.quantity.trim() || form.frequency.length === 0 || !form.mealTiming);

    return (
        <View style={[s.root, { paddingTop: 18 }]}>

            {/* ── Header ──────────────────────────────────── */}
            <View style={s.header}>
                {/* Absolute left — keeps title centred across full width */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Ionicons name="close" size={22} color="#374151" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Thuốc định kỳ</Text>
            </View>

            {/* ── Scrollable Form ─────────────────────────── */}
            <KeyboardAwareScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Info Banner */}
                <View style={s.infoBanner}>
                    <MaterialCommunityIcons name="leaf" size={16} color="#16a34a" />
                    <Text style={s.infoText}>
                        Mỗi lần lưu tạo 1 bản ghi riêng. Dùng "Lưu & Thêm" để nhập nhiều loại nhanh hơn.
                    </Text>
                </View>

                {/* ═══ SECTION 1: Thông tin thuốc ══════════ */}
                <Text style={s.sectionLabel}>Thông tin thuốc</Text>

                {/* Tên thuốc */}
                <View style={[s.inputWrap, showError && !form.name.trim() && s.inputWrapError]}>
                    <MaterialCommunityIcons name="pill" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Tên thuốc / TPCN (VD: Omega 3)"
                        placeholderTextColor="#d1d5db"
                        value={form.name}
                        onChangeText={v => update('name', v)}
                        returnKeyType="next"
                    />
                </View>

                {/* Liều lượng — full width */}
                <View style={[s.inputWrap, showError && !form.quantity.trim() && s.inputWrapError]}>
                    <Ionicons name="calculator-outline" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Liều lượng (VD: 1, 2.5)"
                        placeholderTextColor="#d1d5db"
                        value={form.quantity}
                        onChangeText={v => update('quantity', v)}
                        keyboardType="numeric"
                    />
                </View>

                {/* Đơn vị — horizontal chips, full width below quantity */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.unitRow}
                    style={s.unitScroll}
                >
                    {units.map(u => (
                        <TouchableOpacity
                            key={u}
                            style={[s.unitChip, form.unit === u && s.unitChipActive]}
                            onPress={() => update('unit', u)}
                        >
                            <Text style={[s.unitText, form.unit === u && s.unitTextActive]}>{u}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ═══ SECTION 2: Thời điểm uống ══════════ */}
                <Text style={[s.sectionLabel, s.sectionGap]}>Thời điểm uống</Text>
                <SessionTimeSelector
                    frequency={form.frequency}
                    sessionTimes={form.sessionTimes}
                    onUpdate={updateSessions}
                    showError={showError}
                />

                {/* ═══ SECTION 3: Cách uống ════════════════ */}
                <Text style={[s.sectionLabel, s.sectionGap]}>Cách uống so với bữa ăn</Text>
                <View style={[s.mealGrid, showError && !form.mealTiming && s.gridError]}>
                    {mealTimings.map(t => (
                        <TouchableOpacity
                            key={t}
                            style={[s.mealChip, form.mealTiming === t && s.mealChipActive]}
                            onPress={() => update('mealTiming', t)}
                            activeOpacity={0.75}
                        >
                            <Text style={[s.mealLabel, form.mealTiming === t && s.mealLabelActive]}>{t}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ═══ SECTION 4: Ghi chú (optional) ══════ */}
                <Text style={[s.sectionLabel, s.sectionGap]}>Ghi chú <Text style={s.optionalTag}>(Tùy chọn)</Text></Text>
                <View style={s.inputWrap}>
                    <Ionicons name="pencil-outline" size={18} color="#9ca3af" style={[s.inputIcon, { alignSelf: 'flex-start', marginTop: 13 }]} />
                    <TextInput
                        style={[s.inputText, { minHeight: 60 }]}
                        placeholder="Dặn dò thêm (VD: Uống trước khi ngủ)"
                        placeholderTextColor="#d1d5db"
                        value={form.note}
                        onChangeText={v => update('note', v)}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                {/* Error banner */}
                {showError && (
                    <View style={s.errorBanner}>
                        <Ionicons name="alert-circle" size={15} color="#ef4444" />
                        <Text style={s.errorText}>Vui lòng điền đầy đủ: Tên thuốc, Liều lượng, Thời điểm và Cách uống.</Text>
                    </View>
                )}

                {/* Scroll spacer so content clears sticky footer */}
                <View style={{ height: 130 }} />
            </KeyboardAwareScrollView>

            {/* ── Sticky Bottom CTAs ──────────────────────── */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={handleSaveAndAddMore}
                    disabled={isSaving}
                    activeOpacity={0.75}
                >
                    <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
                    <Text style={s.secondaryBtnText}>Lưu & Thêm loại khác</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[s.primaryBtn, isSaving && s.btnDisabled]}
                    onPress={handleSave}
                    disabled={isSaving}
                    activeOpacity={0.85}
                >
                    <MaterialCommunityIcons name="leaf" size={20} color="#fff" />
                    <Text style={s.primaryBtnText}>Lưu thuốc này</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────
const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f8fafc' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: SPACING.md, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
        backgroundColor: '#f8fafc',
    },
    closeBtn: {
        // Absolute left so title stays centred across full width
        position: 'absolute', left: SPACING.md,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
        zIndex: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: SPACING.lg, // 24px side padding
        paddingTop: SPACING.lg,
    },

    // Info banner
    infoBanner: {
        flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
        backgroundColor: '#f0fdf4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        marginBottom: SPACING.md, borderWidth: 1, borderColor: '#bbf7d0', // 16px below banner
    },
    infoText: { flex: 1, fontSize: 13, color: '#15803d', lineHeight: 18 },

    // Section labels
    sectionLabel: {
        fontSize: 12, fontWeight: '700', color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: SPACING.sm, // 8px below label to first input
    },
    sectionGap: { marginTop: SPACING.lg }, // 24px between major sections
    optionalTag: { fontSize: 11, fontWeight: '500', color: '#9ca3af', textTransform: 'none' },

    // Inputs
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
        paddingHorizontal: 14, marginBottom: SPACING.md, // 16px between inputs
    },
    inputWrapError: { borderColor: '#ef4444', backgroundColor: '#fff5f5' },
    inputIcon: { marginRight: 8, flexShrink: 0 },
    inputText: { flex: 1, fontSize: 15, color: '#1f2937', paddingVertical: 13 },

    // Unit chips (horizontal scroll, sits directly below quantity)
    unitScroll: { marginBottom: SPACING.md },
    unitRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: 2 },
    unitChip: {
        paddingHorizontal: 18, paddingVertical: 9, borderRadius: 50,
        backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
    },
    unitChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    unitText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
    unitTextActive: { color: '#ffffff' },

    // Meal chips (2×2 grid via flex-wrap)
    mealGrid: {
        flexDirection: 'row', flexWrap: 'wrap',
        gap: SPACING.sm, // 8px between chips
    },
    mealChip: {
        width: '48%', height: 46, borderRadius: 12,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#e5e7eb',
    },
    mealChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    mealLabel: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
    mealLabelActive: { color: '#ffffff', fontWeight: '700' },

    // Grid error highlight
    gridError: { borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14, padding: SPACING.xs, backgroundColor: '#fff5f5' },

    // Error banner
    errorBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
        backgroundColor: '#fff5f5', borderRadius: 12, padding: 12, marginTop: SPACING.md,
        borderWidth: 1, borderColor: '#fecaca',
    },
    errorText: { flex: 1, fontSize: 13, color: '#ef4444', lineHeight: 18 },

    // Sticky bottom CTAs
    footer: {
        paddingHorizontal: SPACING.md, paddingTop: 14,
        gap: 12, // 12px between the two buttons
        backgroundColor: '#ffffff',
        borderTopWidth: 1, borderTopColor: '#f1f5f9',
        // Subtle upward shadow to lift bar from content
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 8,
    },
    primaryBtn: {
        backgroundColor: '#1d4ed8', borderRadius: 16,
        paddingVertical: 16, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
    secondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 14,
        borderWidth: 1.5, borderColor: '#bfdbfe', backgroundColor: '#eff6ff',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
    btnDisabled: { opacity: 0.55 },
});
