import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Keyboard, Alert, Modal, Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import AppCalendar from '../components/AppCalendar';
import BottomSheet from '../components/BottomSheet';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AutocompleteInput from '../components/AutocompleteInput';

import { MedicineEntry, SESSIONS, SESSION_DEFAULTS } from '../types/medicine';
import { formatLocalDate } from '../utils/dateUtils';
import { useMedContext, Prescription } from '../context/MedContext';
import PrimaryButton from '../components/PrimaryButton';
import SessionTimeSelector from '../components/SessionTimeSelector';

const blankMed = (): MedicineEntry => ({
    id: Date.now().toString(),
    name: '', quantity: '', unit: 'Viên',
    frequency: [], sessionTimes: {}, mealTiming: '', note: '', hasError: false,
});

// Spacing tokens moved to SP constant

// ─── Spacing system (mirrors RoutineAddScreen) ────────────────────
const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export default function ManualAddScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { updatePrescription } = useMedContext();

    // ── Edit mode detection ───────────────────────────────────────
    const editMode = route.params?.mode === 'edit';
    const editPrescription: Prescription | undefined = route.params?.prescription;

    // ── Prescription-level state ──────────────────────────────────
    const [hospital, setHospital] = useState(editPrescription?.hospital || '');
    const [recordTitle, setRecordTitle] = useState(editPrescription?.recordTitle || '');
    const [date, setDate] = useState<Date | null>(
        editPrescription ? new Date(editPrescription.date) : null
    );
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tempDate, setTempDate] = useState<Date | null>(null);
    const [duration, setDuration] = useState(
        editPrescription ? String(editPrescription.duration) : ''
    );

    // ── Medicine list state (multi-med loop) ──────────────────────
    const [medicines, setMedicines] = useState<MedicineEntry[]>(
        editPrescription?.medicines || [blankMed()]
    );
    const [currentMedIndex, setCurrentMedIndex] = useState(0);

    const units = ['Viên', 'Gói', 'Lọ', 'ml', 'Ống'];
    const mealTimings = ['Trước ăn', 'Sau ăn', 'Khi đói', 'Tùy ý'];

    const endDate = new Date(date || new Date());
    endDate.setDate(endDate.getDate() + (parseInt(duration) || 0));

    // ── Current med helpers ───────────────────────────────────────
    const med = medicines[currentMedIndex];
    const updateMed = <K extends keyof MedicineEntry>(field: K, value: MedicineEntry[K]) => {
        setMedicines(prev => prev.map((m, i) =>
            i === currentMedIndex ? { ...m, [field]: value, hasError: false } : m
        ));
    };
    const updateMedSessions = (frequency: string[], sessionTimes: Record<string, string>) => {
        setMedicines(prev => prev.map((m, i) =>
            i === currentMedIndex ? { ...m, frequency, sessionTimes, hasError: false } : m
        ));
    };

    // ── Validate current med ──────────────────────────────────────
    const validateCurrentMed = (): boolean => {
        if (!med.name.trim() || !med.quantity.trim() || !med.mealTiming || !date || !duration.trim() || !recordTitle.trim()) {
            setMedicines(prev => prev.map((m, i) =>
                i === currentMedIndex ? { ...m, hasError: true } : m
            ));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return false;
        }
        return true;
    };

    // ── "Lưu & Thêm thuốc khác" ───────────────────────────────────
    const handleSaveAndAddMore = () => {
        Keyboard.dismiss();
        if (!validateCurrentMed()) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const newMed = blankMed();
        setMedicines(prev => [...prev, newMed]);
        setCurrentMedIndex(medicines.length); // point to newly added
    };

    // ── Xóa thuốc đang active (tối thiểu phải còn 1) ─────────────
    const handleRemoveMed = () => {
        if (medicines.length <= 1) return; // guard: cannot delete last one
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setMedicines(prev => prev.filter((_, i) => i !== currentMedIndex));
        setCurrentMedIndex(prev => Math.max(0, prev - 1));
    };

    // ── "Xác nhận đơn thuốc" / "Lưu thay đổi" ────────────────────
    const [isSaving, setIsSaving] = useState(false);
    const handleSubmit = async () => {
        Keyboard.dismiss();
        if (!validateCurrentMed()) return;

            if (!recordTitle.trim()) {
                Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên bệnh án.');
            return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (editMode && editPrescription) {
            // EDIT MODE: call updatePrescription directly
            setIsSaving(true);
            try {
                const updated: Prescription = {
                    ...editPrescription,
                    recordTitle,
                    hospital,
                    date: formatLocalDate(date!),
                    duration: parseInt(duration) || 7,
                    medicines,
                };
                await updatePrescription(updated);
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
                Alert.alert('Lỗi', 'Không thể cập nhật đơn thuốc.');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
                setIsSaving(false);
            }
        } else {
            // CREATE MODE: navigate to review
            navigation.navigate('ManualAddReview', {
                recordTitle,
                hospital,
                date: formatLocalDate(date!),
                duration: parseInt(duration) || 7,
                medicines,
            });
        }
    };

    const showError = med.hasError && (!med.name.trim() || !med.quantity.trim() || !med.mealTiming || !date || !duration.trim() || !recordTitle.trim());

    return (
        <View style={[s.root, { paddingTop: 18 }]}>

            {/* ══ Header ══════════════════════════════════════════ */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Ionicons name="close" size={22} color="#374151" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>{editMode ? 'Cập nhật đơn thuốc' : 'Thêm đơn thuốc'}</Text>
            </View>

            {/* ══ Scrollable Form ══════════════════════════════════ */}
            <KeyboardAwareScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                extraScrollHeight={120}
                enableOnAndroid
            >

                {/* ─── SECTION 1: THÔNG TIN BỆNH ÁN ─────────────── */}
                <Text style={s.sectionLabel}>Thông tin bệnh án <Text style={{ color: '#ef4444' }}>*</Text></Text>

                {/* Tên bệnh án */}
                <View style={[s.inputWrap, !recordTitle.trim() && showError && s.inputWrapError]}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Tên bệnh án / Chẩn đoán (VD: Viêm họng)"
                        placeholderTextColor="#d1d5db"
                        value={recordTitle}
                        onChangeText={setRecordTitle}
                        returnKeyType="next"
                    />
                    {recordTitle.length > 0 && (
                        <TouchableOpacity onPress={() => setRecordTitle('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Nơi khám */}
                <View style={s.inputWrap}>
                    <MaterialCommunityIcons name="office-building-outline" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Nơi khám / Bệnh viện (Tùy chọn)"
                        placeholderTextColor="#d1d5db"
                        value={hospital}
                        onChangeText={setHospital}
                        returnKeyType="next"
                    />
                    {hospital.length > 0 && (
                        <TouchableOpacity onPress={() => setHospital('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Ngày bắt đầu uống — one-tap calendar modal */}
                <TouchableOpacity
                    style={[s.inputWrap, showError && !date && s.inputWrapError]}
                    onPress={() => { Keyboard.dismiss(); setTempDate(date); setShowDatePicker(true); }}
                    activeOpacity={0.7}
                >
                    <MaterialCommunityIcons name="calendar-edit" size={18} color="#9ca3af" style={s.inputIcon} />
                    <Text style={[s.inputText, { paddingVertical: 13, color: date ? '#1f2937' : '#9ca3af' }]}>
                        {date ? date.toLocaleDateString('vi-VN') : 'Chọn ngày bắt đầu'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#d1d5db" />
                </TouchableOpacity>



                {/* Số ngày uống — full width */}
                <View style={[s.inputWrap, showError && !duration.trim() && s.inputWrapError]}>
                    <Ionicons name="time-outline" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Số ngày uống (VD: 7)"
                        placeholderTextColor="#d1d5db"
                        keyboardType="numeric"
                        value={duration}
                        onChangeText={setDuration}
                    />
                    {duration.length > 0 && (
                        <TouchableOpacity onPress={() => setDuration('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 4 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
                    <Text style={s.inputSuffix}>ngày</Text>
                </View>

                {/* End-date preview */}
                {duration !== '' && parseInt(duration) > 0 && (
                    <View style={s.dateBanner}>
                        <Ionicons name="calendar-outline" size={14} color="#2563eb" />
                        <Text style={s.dateBannerText}>
                            Dự kiến đến hết: {endDate.toLocaleDateString('vi-VN')}
                        </Text>
                    </View>
                )}

                {/* Med tabs — only rendered when > 1 medicine */}
                {medicines.length > 1 && (
                    <View style={s.medTabs}>
                        {medicines.map((m, i) => {
                            const isActive = i === currentMedIndex;
                            return (
                                <TouchableOpacity
                                    key={m.id}
                                    style={[s.medTab, isActive && s.medTabActive]}
                                    onPress={() => setCurrentMedIndex(i)}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[s.medTabText, isActive && s.medTabTextActive]}>
                                        Thuốc {i + 1}
                                    </Text>
                                    {/* X icon: visible on ALL tabs, hidden only when 1 total */}
                                    <TouchableOpacity
                                        onPress={() => {
                                            setCurrentMedIndex(i);
                                            // Small delay so setCurrentMedIndex registers first
                                            requestAnimationFrame(() => handleRemoveMed());
                                        }}
                                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                                        style={[
                                            s.tabRemoveBtn,
                                            !isActive && s.tabRemoveBtnInactive,
                                        ]}
                                    >
                                        <Ionicons
                                            name="close"
                                            size={12}
                                            color={isActive ? '#ffffff' : '#6b7280'}
                                        />
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* ─── Section label with optional trash button ─── */}
                <View style={s.sectionLabelRow}>
                    <Text style={[s.sectionLabel, s.sectionGap]}>
                        Thông tin thuốc số {currentMedIndex + 1} <Text style={{ color: '#ef4444' }}>*</Text>
                    </Text>
                </View>

                {/* Tên thuốc — Autocomplete */}
                <AutocompleteInput
                    value={med.name}
                    onChangeText={v => updateMed('name', v)}
                    placeholder="Tên thuốc (VD: Paracetamol 500mg)"
                    placeholderTextColor="#d1d5db"
                    returnKeyType="next"
                    icon={<MaterialCommunityIcons name="pill" size={18} color="#9ca3af" style={s.inputIcon} />}
                    error={showError && !med.name.trim()}
                    errorStyle={s.inputWrapError}
                    containerStyle={{ zIndex: 10 }}
                />

                {/* Liều lượng — full width */}
                <View style={[s.inputWrap, showError && !med.quantity.trim() && s.inputWrapError]}>
                    <Ionicons name="calculator-outline" size={18} color="#9ca3af" style={s.inputIcon} />
                    <TextInput
                        style={s.inputText}
                        placeholder="Liều lượng (VD: 1, 2)"
                        placeholderTextColor="#d1d5db"
                        keyboardType="numeric"
                        value={med.quantity}
                        onChangeText={v => updateMed('quantity', v)}
                    />
                    {med.quantity.length > 0 && (
                        <TouchableOpacity onPress={() => updateMed('quantity', '')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Đơn vị — horizontal chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.unitRow}
                    style={s.unitScroll}
                >
                    {units.map(u => (
                        <TouchableOpacity
                            key={u}
                            style={[s.unitChip, med.unit === u && s.unitChipActive]}
                            onPress={() => updateMed('unit', u)}
                        >
                            <Text style={[s.unitText, med.unit === u && s.unitTextActive]}>{u}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ─── SECTION 2: THỜI ĐIỂM UỐNG ─────────────── */}

                <SessionTimeSelector
                    frequency={med.frequency}
                    sessionTimes={med.sessionTimes}
                    onUpdate={updateMedSessions}
                    showError={showError}
                />

                {/* Cách uống so với bữa ăn */}
                <Text style={[s.sectionLabel, s.sectionGap]}>Cách uống so với bữa ăn <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <View style={[s.mealGrid, showError && !med.mealTiming && s.gridError]}>
                    {mealTimings.map(t => (
                        <TouchableOpacity
                            key={t}
                            style={[s.mealChip, med.mealTiming === t && s.mealChipActive]}
                            onPress={() => updateMed('mealTiming', t)}
                            activeOpacity={0.75}
                        >
                            <Text style={[s.mealLabel, med.mealTiming === t && s.mealLabelActive]}>{t}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Ghi chú */}
                <Text style={[s.sectionLabel, s.sectionGap]}>
                    Ghi chú bác sĩ <Text style={s.optionalTag}>(Tùy chọn)</Text>
                </Text>
                <View style={s.inputWrap}>
                    <Ionicons name="pencil-outline" size={18} color="#9ca3af" style={[s.inputIcon, { alignSelf: 'flex-start', marginTop: 13 }]} />
                    <TextInput
                        style={[s.inputText, { minHeight: 56 }]}
                        placeholder="VD: Uống sau khi ăn no..."
                        placeholderTextColor="#d1d5db"
                        value={med.note}
                        onChangeText={v => updateMed('note', v)}
                        multiline
                        textAlignVertical="top"
                    />
                    {(med.note || '').length > 0 && (
                        <TouchableOpacity onPress={() => updateMed('note', '')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ alignSelf: 'flex-start', marginTop: 13 }}>
                            <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
                </View>

                {showError && (
                    <View style={s.errorBanner}>
                        <Ionicons name="alert-circle" size={15} color="#ef4444" />
                        <Text style={s.errorText}>Vui lòng điền đầy đủ: Tên thuốc, Liều lượng, Thời điểm và Cách uống.</Text>
                    </View>
                )}

                <View style={{ height: 130 }} />
            </KeyboardAwareScrollView>

            {/* ══ Sticky Bottom CTAs ═══════════════════════════════ */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                {/* Secondary: Save current med + add another */}
                <PrimaryButton
                    variant="outline"
                    title="Thêm loại thuốc khác"
                    icon="add-circle-outline"
                    onPress={handleSaveAndAddMore}
                />

                {/* Primary: Submit all */}
                <PrimaryButton
                    title={isSaving ? 'Đang lưu...' : editMode ? 'Lưu thay đổi' : 'Kiểm tra lại'}
                    icon="checkmark-circle-outline"
                    onPress={handleSubmit}
                    loading={isSaving}
                    disabled={isSaving}
                />
            </View>

            {/* ══ Calendar Bottom Sheet ═══════════════════════════ */}
            <BottomSheet
                visible={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                maxHeight="70%"
            >
                <View style={{ paddingHorizontal: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1f2937', textAlign: 'center', marginBottom: 8 }}>Chọn ngày bắt đầu</Text>
                    <AppCalendar
                        mode="single"
                        selectedDate={tempDate}
                        onDateSelect={(d) => setTempDate(d)}
                    />
                    <View style={{ flexDirection: 'row', marginTop: 16, paddingBottom: insets.bottom + 8 }}>
                        <PrimaryButton
                            title="Xác nhận"
                            variant="solid"
                            icon="checkmark-circle-outline"
                            disabled={!tempDate}
                            onPress={() => {
                                if (tempDate) {
                                    setDate(tempDate);
                                    setShowDatePicker(false);
                                }
                            }}
                            style={{ flex: 1 }}
                        />
                    </View>
                </View>
            </BottomSheet>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f8fafc' },

    // Header (mirrors RoutineAddScreen exactly)
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: SP.md, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
        backgroundColor: '#f8fafc',
    },
    closeBtn: {
        position: 'absolute', left: SP.md,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
        zIndex: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: SP.lg, paddingTop: SP.lg }, // 24px

    // Section labels
    sectionLabel: {
        fontSize: 12, fontWeight: '700', color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: SP.sm, // 8px below label
    },
    sectionGap: { marginTop: SP.lg }, // 24px between sections
    optionalTag: { fontSize: 11, fontWeight: '500', color: '#9ca3af', textTransform: 'none' },

    // Inputs
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
        paddingHorizontal: 14, marginBottom: SP.md, // 16px between inputs
    },
    inputWrapError: { borderColor: '#ef4444', backgroundColor: '#fff5f5' },
    inputIcon: { marginRight: 8, flexShrink: 0 },
    inputText: { flex: 1, fontSize: 15, color: '#1f2937', paddingVertical: 13 },
    inputSuffix: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },

    // Date banner
    dateBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#eff6ff', borderRadius: 10, padding: 10,
        marginBottom: SP.md, marginTop: -SP.sm,
    },
    dateBannerText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },

    // Med tabs (multi-drug navigation pills)
    medTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SP.lg, marginBottom: 4 },
    medTab: {
        flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap',
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50,
        backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
        gap: 6, // space between text and X
    },
    medTabActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
    medTabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
    medTabTextActive: { color: '#ffffff' },
    tabRemoveBtn: {
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center', justifyContent: 'center',
    },
    tabRemoveBtnInactive: {
        backgroundColor: '#e5e7eb', // light gray bg for X on inactive tabs
    },

    // Section label row (flex row for label + optional trash)
    sectionLabelRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },

    // Unit chips
    unitScroll: { marginBottom: SP.md },
    unitRow: { flexDirection: 'row', gap: SP.sm, paddingHorizontal: 2 },
    unitChip: {
        paddingHorizontal: 18, paddingVertical: 9, borderRadius: 50,
        backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
    },
    unitChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
    unitText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
    unitTextActive: { color: '#ffffff' },

    // Time grid
    timeGrid: {
        flexDirection: 'row', justifyContent: 'space-between', gap: SP.sm,
    },
    timeChip: {
        flex: 1, flexDirection: 'column', alignItems: 'center',
        paddingVertical: 14, borderRadius: 14,
        backgroundColor: '#f3f4f6',
        borderWidth: 1.5, borderColor: 'transparent',
    },
    timeLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 2 },

    // Meal grid
    mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
    mealChip: {
        width: '48%', height: 46, borderRadius: 12,
        backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#e5e7eb',
    },
    mealChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
    mealLabel: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
    mealLabelActive: { color: '#ffffff', fontWeight: '700' },

    // Grid error
    gridError: { borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14, padding: SP.xs, backgroundColor: '#fff5f5' },

    // Error banner
    errorBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm,
        backgroundColor: '#fff5f5', borderRadius: 12, padding: 12, marginTop: SP.md,
        borderWidth: 1, borderColor: '#fecaca',
    },
    errorText: { flex: 1, fontSize: 13, color: '#ef4444', lineHeight: 18 },

    // Sticky bottom CTAs
    footer: {
        paddingHorizontal: SP.md, paddingTop: 14, gap: 12,
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
        alignItems: 'center', justifyContent: 'center', gap: SP.sm,
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
    secondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: 14,
        borderWidth: 1.5, borderColor: '#bfdbfe', backgroundColor: '#eff6ff',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
});
