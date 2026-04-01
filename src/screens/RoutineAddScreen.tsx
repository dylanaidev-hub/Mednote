import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Keyboard, Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AutocompleteInput from '../components/AutocompleteInput';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMedContext, Prescription } from '../context/MedContext';
import { MedicineEntry } from '../types/medicine';
import PrimaryButton from '../components/PrimaryButton';
import SessionTimeSelector from '../components/SessionTimeSelector';
import { formatLocalDate } from '../utils/dateUtils';

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
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { addPrescription, updatePrescription } = useMedContext();

    // Edit mode detection
    const editMode = route.params?.mode === 'edit';
    const editPrescription: Prescription | undefined = route.params?.prescription;
    const editMed = editPrescription?.medicines?.[0];

    const [form, setForm] = useState<MedicineEntry>(editMed || blankForm());
    const [hasError, setHasError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
        editMed?.weekdays || []
    );

    const units = ['Viên', 'Gói', 'Lọ', 'ml', 'Ống'];
    const mealTimings = ['Trước ăn', 'Sau ăn', 'Khi đói', 'Tùy ý'];
    const weekdayLabels = [
        { day: 1, label: 'T2' },
        { day: 2, label: 'T3' },
        { day: 3, label: 'T4' },
        { day: 4, label: 'T5' },
        { day: 5, label: 'T6' },
        { day: 6, label: 'T7' },
        { day: 0, label: 'CN' },
    ];
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

    // ─── Weekday toggle ─────────────────────────────────────────
    const toggleWeekday = (day: number) => {
        setSelectedWeekdays(prev => {
            if (prev.includes(day)) return prev.filter(d => d !== day);
            return [...prev, day];
        });
        if (hasError) setHasError(false);
    };

    // ─── Validation ───────────────────────────────────────────
    const validate = (): boolean => {
        if (!form.name.trim() || !form.quantity.trim() || !form.mealTiming) {
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
        date: formatLocalDate(new Date()),
        duration: 999,
        medicines: [{ ...form, id: Date.now().toString(), weekdays: selectedWeekdays.length > 0 ? selectedWeekdays : undefined }],
        createdAt: new Date().toISOString(),
    });

    // ─── Save & Go Back ───────────────────────────────────────
    const handleSave = async () => {
        Keyboard.dismiss();
        if (!validate()) return;
        setIsSaving(true);
        try {
            if (editMode && editPrescription) {
                const updated: Prescription = {
                    ...editPrescription,
                    medicines: [{ ...form, weekdays: selectedWeekdays.length > 0 ? selectedWeekdays : undefined }],
                };
                await updatePrescription(updated);
            } else {
                await addPrescription(buildRecord());
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.dispatch(
                CommonActions.reset({
                    index: 0,
                    routes: [{
                        name: 'MainTabs',
                        state: { routes: [{ name: 'Records' }] },
                    }],
                })
            );
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
            setSelectedWeekdays([]);
            setHasError(false);
        } catch {
            Alert.alert('Lỗi', 'Không thể lưu thuốc. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    const showError = hasError && (!form.name.trim() || !form.quantity.trim() || !form.mealTiming);

    return (
        <View style={[s.root, { paddingTop: 18 }]}>

            {/* ── Header ──────────────────────────────────── */}
            <View style={s.header}>
                {/* Absolute left — keeps title centred across full width */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Ionicons name="close" size={22} color="#374151" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>{editMode ? 'Cập nhật thuốc định kỳ' : 'Thuốc định kỳ'}</Text>
            </View>

            {/* ── Scrollable Form ─────────────────────────── */}
            <KeyboardAwareScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                extraScrollHeight={120}
                enableOnAndroid
            >
                {/* Info Banner */}
                <View style={s.infoBanner}>
                    <MaterialCommunityIcons name="leaf" size={16} color="#16a34a" />
                    <Text style={s.infoText}>
                        Nhấn '<Text style={{ fontWeight: '700' }}>Lưu & Thêm</Text>' để tiếp tục tạo đơn thuốc
                    </Text>
                </View>

                {/* ═══ SECTION 1: Thông tin thuốc ══════════ */}
                <Text style={s.sectionLabel}>Thông tin thuốc <Text style={{ color: '#ef4444' }}>*</Text></Text>

                {/* Tên thuốc — Autocomplete */}
                <AutocompleteInput
                    value={form.name}
                    onChangeText={v => update('name', v)}
                    placeholder="Tên thuốc / TPCN (VD: Omega 3)"
                    placeholderTextColor="#d1d5db"
                    returnKeyType="next"
                    icon={<MaterialCommunityIcons name="pill" size={18} color="#9ca3af" style={s.inputIcon} />}
                    error={showError && !form.name.trim()}
                    errorStyle={s.inputWrapError}
                    containerStyle={{ zIndex: 10 }}
                />

                {/* Liều lượng — full width */}
                <View style={[s.inputWrap, showError && !form.quantity.trim() && s.inputWrapError]}>
                    <Ionicons name="calculator-outline" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Liều lượng (VD: 1, 2)"
                        placeholderTextColor="#d1d5db"
                        value={form.quantity}
                        onChangeText={v => update('quantity', v)}
                        keyboardType="numeric"
                    />
                    {form.quantity.length > 0 && (
                        <TouchableOpacity onPress={() => update('quantity', '')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
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
                <Text style={[s.sectionLabel, s.sectionGap]}>Thời điểm uống <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <SessionTimeSelector
                    frequency={form.frequency}
                    sessionTimes={form.sessionTimes}
                    onUpdate={updateSessions}
                    showError={showError}
                />

                {/* ═══ SECTION 2.5: Tần suất uống (Weekdays) ═════ */}
                <Text style={[s.sectionLabel, s.sectionGap]}>Tần suất uống</Text>
                <View style={s.weekdayRow}>
                    {weekdayLabels.map(({ day, label }) => {
                        const isActive = selectedWeekdays.includes(day);
                        return (
                            <TouchableOpacity
                                key={day}
                                style={[s.weekdayChip, isActive && s.weekdayChipActive]}
                                onPress={() => toggleWeekday(day)}
                                activeOpacity={0.75}
                            >
                                <Text style={[s.weekdayText, isActive && s.weekdayTextActive]}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {selectedWeekdays.length === 0 && (
                    <Text style={s.weekdayHint}>Mỗi ngày (mặc định)</Text>
                )}
                {selectedWeekdays.length > 0 && (
                    <Text style={s.weekdayHint}>
                        {weekdayLabels.filter(w => selectedWeekdays.includes(w.day)).map(w => w.label).join(', ')}
                    </Text>
                )}

                {/* ═══ SECTION 3: Cách uống ════════════════ */}
                <Text style={[s.sectionLabel, s.sectionGap]}>Cách uống so với bữa ăn <Text style={{ color: '#ef4444' }}>*</Text></Text>
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
                    {(form.note || '').length > 0 && (
                        <TouchableOpacity onPress={() => update('note', '')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ alignSelf: 'flex-start', marginTop: 13 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
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
                {!editMode && (
                    <PrimaryButton
                        variant="outline"
                        title="Lưu & Thêm loại khác"
                        icon="add-circle-outline"
                        onPress={handleSaveAndAddMore}
                        disabled={isSaving}
                    />
                )}

                <PrimaryButton
                    title={isSaving ? 'Đang lưu...' : editMode ? 'Lưu thay đổi' : 'Lưu thuốc này'}
                    icon="leaf"
                    iconFamily="MaterialCommunityIcons"
                    onPress={handleSave}
                    loading={isSaving}
                    disabled={isSaving}
                />
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
        backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9',
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

    // Weekday chips
    weekdayRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        gap: 6, paddingHorizontal: 2,
    },
    weekdayChip: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#e5e7eb',
    },
    weekdayChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    weekdayText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
    weekdayTextActive: { color: '#ffffff' },
    weekdayHint: {
        fontSize: 12, color: '#9ca3af', marginTop: 6,
        textAlign: 'center', fontStyle: 'italic',
    },

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
        gap: 12,
        backgroundColor: '#ffffff',
        borderTopWidth: 1, borderTopColor: '#f1f5f9',
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
