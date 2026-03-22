import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Switch, TextInput, Keyboard, Platform,
    ActivityIndicator
} from 'react-native';
import BottomSheet from '../components/BottomSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { useMedContext } from '../context/MedContext';
import PrimaryButton from '../components/PrimaryButton';
import { BatteryOptimization } from '../services/BatteryOptimization';


const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

type MedicalInfo = {
    weight: string;
    height: string;
    bloodType: string;
    rh: string;
    allergies: string;
};

const BLOOD_TYPES = ['A', 'B', 'AB', 'O', 'Chưa rõ'];

export default function Profile() {
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();
    const navigation = useNavigation<any>();
    const { medicalInfo, updateMedicalInfo, isLoading: isDataLoading } = useUser();
    const { notificationsEnabled, setNotificationsEnabled, naggingMode, setNaggingMode } = useMedContext();

    // Local temp state for medical editing
    const [tempInfo, setTempInfo] = useState({
        weight: '', height: '', bloodType: 'Chưa rõ', rh: '+', allergies: ''
    });

    const [isModalVisible, setIsModalVisible] = useState(false);

    const handleFeatureNotReady = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate('ComingSoon');
    };

    const openEditModal = () => {
        setTempInfo(medicalInfo || {
            weight: '', height: '', bloodType: 'Chưa rõ', rh: '+', allergies: ''
        });
        setIsModalVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSaveMedicalInfo = async () => {
        try {
            await updateMedicalInfo(tempInfo);
            setIsModalVisible(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            showToast({ message: "Lỗi khi lưu thông tin y tế", duration: 2000 });
        }
    };

    // Reusable Section components
    const SectionHeader = ({ title }: { title: string }) => (
        <Text style={styles.sectionHeader}>{title}</Text>
    );

    const SettingsItem = ({
        icon,
        iconColor,
        iconBg,
        label,
        value,
        isSwitch = false,
        switchValue,
        onSwitchToggle,
        isDestructive = false,
        isComingSoon = false,
        onPress
    }: any) => (
        <TouchableOpacity
            style={[
                styles.settingsItem,
                isDestructive && styles.settingsItemDestructive,
            ]}
            activeOpacity={isSwitch ? 1 : 0.7}
            disabled={isSwitch && !isComingSoon}
            onPress={isComingSoon ? handleFeatureNotReady : onPress}
        >
            <View style={styles.settingsItemLeft}>
                {icon && (
                    <View style={[styles.settingIconWrap, { backgroundColor: iconBg }]}>
                        <Ionicons name={icon} size={20} color={iconColor} />
                    </View>
                )}
                <Text style={[styles.settingLabel, isDestructive && styles.settingLabelDestructive]}>
                    {label}
                </Text>
            </View>
            <View style={styles.settingsItemRight}>
                {value && <Text style={styles.settingValue}>{value}</Text>}
                {isSwitch ? (
                    <Switch
                        value={switchValue}
                        onValueChange={onSwitchToggle}
                        trackColor={{ false: '#e5e7eb', true: '#3b82f6' }}
                        thumbColor="#ffffff"
                        ios_backgroundColor="#e5e7eb"
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                        disabled={isComingSoon}
                    />
                ) : (
                    !isDestructive && <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                )}
            </View>
        </TouchableOpacity>
    );

    if (isDataLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={{ marginTop: 16, color: '#6b7280', fontSize: 14 }}>Đang tải dữ liệu...</Text>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Page Title */}
                <View style={styles.pageHeader}>
                    <Text style={styles.pageTitle}>Cài đặt</Text>
                </View>

                {/* 1. Medical ID Card */}
                <View style={styles.medicalIdWrapper}>
                    {medicalInfo ? (
                        <TouchableOpacity
                            style={styles.medicalIdCard}
                            activeOpacity={0.8}
                            onPress={openEditModal}
                        >
                            <View style={styles.medicalIdHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Ionicons name="medical" size={18} color="#3b82f6" style={{ marginRight: 6 }} />
                                    <Text style={styles.medicalIdTitle}>Thông tin Y tế khẩn cấp</Text>
                                </View>
                                <Ionicons name="pencil" size={16} color="#9ca3af" />
                            </View>
                            <View style={styles.medicalIdBody}>
                                <View style={styles.medicalCol}>
                                    <Text style={styles.medicalLabel}>Cân nặng</Text>
                                    <Text style={styles.medicalValue}>{medicalInfo.weight || '--'} kg</Text>
                                </View>
                                <View style={styles.medicalDivider} />
                                <View style={styles.medicalCol}>
                                    <Text style={styles.medicalLabel}>Chiều cao</Text>
                                    <Text style={styles.medicalValue}>{medicalInfo.height || '--'} cm</Text>
                                </View>
                                <View style={styles.medicalDivider} />
                                <View style={styles.medicalCol}>
                                    <Text style={styles.medicalLabel}>Nhóm máu</Text>
                                    <Text style={styles.medicalValue}>
                                        {medicalInfo.bloodType}{medicalInfo.bloodType !== 'Chưa rõ' ? medicalInfo.rh : ''}
                                    </Text>
                                </View>
                            </View>
                            {medicalInfo.allergies ? (
                                <View style={styles.allergyWrap}>
                                    <Text style={styles.allergyLabel}>Lưu ý dị ứng:</Text>
                                    <Text style={styles.allergyText} numberOfLines={2}>{medicalInfo.allergies}</Text>
                                </View>
                            ) : null}
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.emptyMedicalCard}>
                            <View style={styles.emptyMedicalContent}>
                                <View style={styles.emptyMedicalIconWrap}>
                                    <MaterialCommunityIcons name="card-account-details-outline" size={32} color="#3b82f6" />
                                </View>
                                <Text style={styles.emptyMedicalTitle}>Thiết lập Thẻ Y tế khẩn cấp</Text>
                                <Text style={styles.emptyMedicalSubtitle}>
                                    Cung cấp thông tin nhóm máu, dị ứng... giúp bác sĩ và người thân xử lý kịp thời.
                                </Text>
                                <PrimaryButton
                                    title="Thêm thông tin ngay"
                                    icon="add-circle-outline"
                                    onPress={openEditModal}
                                    style={{ marginTop: 4 }}
                                />
                            </View>
                        </View>
                    )}
                </View>

                {/* 2. Settings List */}
                <View style={styles.sectionContainer}>
                    <SectionHeader title="Nhắc nhở & Chuông báo" />
                    <View style={styles.settingsGroup}>
                        <SettingsItem
                            icon="notifications" iconColor="#3b82f6" iconBg="#eff6ff"
                            label="Cho phép thông báo"
                            isSwitch={true}
                            switchValue={notificationsEnabled}
                            onSwitchToggle={(val: boolean) => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setNotificationsEnabled(val);
                                if (val) {
                                    showToast({ message: "Đã bật thông báo nhắc nhở", duration: 2000 });
                                } else {
                                    showToast({ message: "Đã tắt toàn bộ thông báo", duration: 2000 });
                                }
                            }}
                        />
                        <View style={styles.separator} />
                        <SettingsItem
                            icon="musical-notes" iconColor="#8b5cf6" iconBg="#f5f3ff"
                            label="Âm báo thức"
                            value="Nhẹ nhàng"
                            isComingSoon={true}
                        />
                        <View style={styles.separator} />
                        <SettingsItem
                            icon="repeat" iconColor="#f59e0b" iconBg="#fffbeb"
                            label="Trợ lý hối thúc"
                            isSwitch={true}
                            switchValue={naggingMode}
                            onSwitchToggle={(val: boolean) => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setNaggingMode(val);
                                if (val) {
                                    showToast({ message: "Đã bật chế độ nhắc nhở liên tục", duration: 2000 });
                                } else {
                                    showToast({ message: "Đã tắt chế độ nhắc nhở liên tục", duration: 2000 });
                                }
                            }}
                        />
                        <Text style={{ fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingBottom: 12, marginTop: -4, lineHeight: 17 }}>
                            Gửi thêm 3 thông báo nhắc nhở (sau 5, 15, 30 phút) nếu bạn chưa uống thuốc.
                        </Text>
                        {Platform.OS === 'android' && (
                            <>
                                <View style={styles.separator} />
                                <SettingsItem
                                    icon="battery-half" iconColor="#22c55e" iconBg="#f0fdf4"
                                    label="Tối ưu pin (Quan trọng)"
                                    onPress={async () => {
                                        await BatteryOptimization.requestIgnore();
                                        showToast({ message: 'Hãy chọn "Không hạn chế" để nhận thông báo ổn định', duration: 3000 });
                                    }}
                                />
                                <Text style={{ fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingBottom: 12, marginTop: -4, lineHeight: 17 }}>
                                    Tắt tối ưu pin cho MedNote để đảm bảo thông báo nhắc thuốc không bị chặn.
                                </Text>
                            </>
                        )}
                    </View>
                </View>

                <View style={styles.sectionContainer}>
                    <SectionHeader title="Quản lý Dữ liệu" />
                    <View style={styles.settingsGroup}>
                        <SettingsItem
                            icon="people" iconColor="#10b981" iconBg="#ecfdf5"
                            label="Người thân quan tâm"
                            isComingSoon={true}
                        />
                        <View style={styles.separator} />
                        <SettingsItem
                            icon="document-text" iconColor="#6366f1" iconBg="#e0e7ff"
                            label="Xuất dữ liệu lịch sử (PDF)"
                            isComingSoon={true}
                        />
                    </View>
                </View>

                <View style={styles.sectionContainer}>
                    <SectionHeader title="Hỗ trợ & Khác" />
                    <View style={styles.settingsGroup}>
                        <SettingsItem
                            icon="shield-checkmark" iconColor="#64748b" iconBg="#f1f5f9"
                            label="Bảo mật & Điều khoản"
                            onPress={() => navigation.navigate('TermsAndPrivacy')}
                        />
                        <View style={styles.separator} />
                        <SettingsItem
                            icon="help-buoy" iconColor="#0ea5e9" iconBg="#e0f2fe"
                            label="Trợ giúp & Góp ý"
                            onPress={() => navigation.navigate('HelpAndSupport')}
                        />
                    </View>
                </View>

                {/* App version footer */}
                <View style={styles.versionFooter}>
                    <Text style={styles.versionText}>MedNote v3.2.0</Text>
                </View>
            </ScrollView>

            {/* Medical ID Bottom Sheet */}
            <BottomSheet visible={isModalVisible} onClose={() => setIsModalVisible(false)} hasKeyboard>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.modalCloseBtn}>
                            <Ionicons name="close" size={24} color="#1f2937" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Hồ sơ Y tế</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <ScrollView
                        style={styles.modalForm}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                    >
                        {/* Weight & Height Row */}
                        <View style={styles.formRow}>
                            <View style={[styles.formField, { marginRight: 12 }]}>
                                <Text style={styles.inputLabel}>Cân nặng</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={tempInfo.weight}
                                        onChangeText={(t) => setTempInfo({ ...tempInfo, weight: t })}
                                        placeholder="--"
                                        placeholderTextColor="#9ca3af"
                                        keyboardType="numeric"
                                    />
                                    <Text style={styles.inputUnit}>kg</Text>
                                </View>
                            </View>
                            <View style={styles.formField}>
                                <Text style={styles.inputLabel}>Chiều cao</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={tempInfo.height}
                                        onChangeText={(t) => setTempInfo({ ...tempInfo, height: t })}
                                        placeholder="--"
                                        placeholderTextColor="#9ca3af"
                                        keyboardType="numeric"
                                    />
                                    <Text style={styles.inputUnit}>cm</Text>
                                </View>
                            </View>
                        </View>

                        {/* Blood Type Chips */}
                        <Text style={styles.inputLabel}>Nhóm máu</Text>
                        <View style={styles.bloodChipsRow}>
                            {BLOOD_TYPES.map(type => (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.bloodChip,
                                        tempInfo.bloodType === type && styles.bloodChipActive
                                    ]}
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        setTimeout(() => {
                                            setTempInfo({ ...tempInfo, bloodType: type });
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }, 100);
                                    }}
                                >
                                    <Text style={[
                                        styles.bloodChipText,
                                        tempInfo.bloodType === type && styles.bloodChipTextActive
                                    ]}>
                                        {type}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Rh Toggle */}
                        {tempInfo.bloodType !== 'Chưa rõ' && (
                            <View style={styles.rhSection}>
                                <Text style={styles.inputLabel}>Hệ Rh</Text>
                                <View style={styles.rhToggleRow}>
                                    <TouchableOpacity
                                        style={[styles.rhBtn, tempInfo.rh === '+' && styles.rhBtnActive]}
                                        onPress={() => { Keyboard.dismiss(); setTimeout(() => setTempInfo({ ...tempInfo, rh: '+' }), 100); }}
                                    >
                                        <Text style={[styles.rhBtnText, tempInfo.rh === '+' && styles.rhBtnTextActive]}>Rh (+)</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.rhBtn, tempInfo.rh === '-' && styles.rhBtnActive]}
                                        onPress={() => { Keyboard.dismiss(); setTimeout(() => setTempInfo({ ...tempInfo, rh: '-' }), 100); }}
                                    >
                                        <Text style={[styles.rhBtnText, tempInfo.rh === '-' && styles.rhBtnTextActive]}>Rh (-)</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Allergies */}
                        <Text style={styles.inputLabel}>Lưu ý Dị ứng</Text>
                        <TextInput
                            style={styles.textArea}
                            value={tempInfo.allergies}
                            onChangeText={(t) => setTempInfo({ ...tempInfo, allergies: t })}
                            placeholder="Ví dụ: Dị ứng Penicillin, đậu phộng, hải sản..."
                            placeholderTextColor="#9ca3af"
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />

                        <View style={{ height: 40 }} />
                    </ScrollView>

                    {/* Save Button */}
                    <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                        <PrimaryButton
                            title="Lưu thông tin"
                            icon="checkmark-circle-outline"
                            onPress={handleSaveMedicalInfo}
                        />
                    </View>
            </BottomSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    // Page header
    pageHeader: {
        paddingHorizontal: SP.lg,
        paddingBottom: SP.lg,
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827',
    },

    // Medical ID
    medicalIdWrapper: {
        paddingHorizontal: SP.lg,
        marginBottom: SP.lg,
    },
    medicalIdCard: {
        backgroundColor: '#f0f6ff',
        borderRadius: 16,
        padding: SP.md,
        borderWidth: 1,
        borderColor: '#bfdbfe',
    },
    medicalIdHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SP.md,
    },
    medicalIdTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e3a8a',
    },
    medicalIdBody: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    medicalCol: {
        flex: 1,
        alignItems: 'center',
    },
    medicalLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        marginBottom: 4,
    },
    medicalValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e3a8a',
    },
    medicalDivider: {
        width: 1,
        backgroundColor: '#bfdbfe',
        marginHorizontal: SP.sm,
    },
    allergyWrap: {
        marginTop: SP.md,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#fff7ed',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    allergyLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#c2410c',
        marginRight: 6,
    },
    allergyText: {
        fontSize: 13,
        color: '#9a3412',
        flex: 1,
    },

    // Empty medical card
    emptyMedicalCard: {
        backgroundColor: '#f9fafb',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderStyle: 'dashed',
        padding: SP.lg,
    },
    emptyMedicalContent: {
        alignItems: 'center',
    },
    emptyMedicalIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SP.md,
    },
    emptyMedicalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 6,
        textAlign: 'center',
    },
    emptyMedicalSubtitle: {
        fontSize: 13,
        color: '#6b7280',
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: SP.md,
    },

    // Settings sections
    sectionContainer: {
        paddingHorizontal: SP.lg,
        marginBottom: SP.lg,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: SP.sm,
    },
    settingsGroup: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    settingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: SP.md,
    },
    settingsItemDestructive: {},
    settingsItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    settingIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    settingLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1f2937',
    },
    settingLabelDestructive: {
        color: '#ef4444',
    },
    settingsItemRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    settingValue: {
        fontSize: 14,
        color: '#9ca3af',
        fontWeight: '500',
    },
    separator: {
        height: 1,
        backgroundColor: '#f3f4f6',
        marginHorizontal: SP.md,
    },

    // Version footer
    versionFooter: {
        alignItems: 'center',
        paddingVertical: SP.lg,
    },
    versionText: {
        fontSize: 13,
        color: '#9ca3af',
        fontWeight: '500',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SP.md,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    modalCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
    },
    modalForm: {
        paddingHorizontal: SP.lg,
        paddingTop: SP.lg,
    },
    modalFooter: {
        paddingHorizontal: SP.lg,
        paddingTop: SP.md,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },

    // Form
    formRow: {
        flexDirection: 'row',
        marginBottom: SP.md,
    },
    formField: {
        flex: 1,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 6,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        paddingHorizontal: 12,
    },
    textInput: {
        flex: 1,
        fontSize: 15,
        color: '#1f2937',
        paddingVertical: 12,
    },
    inputUnit: {
        fontSize: 14,
        fontWeight: '600',
        color: '#9ca3af',
        marginLeft: 4,
    },
    textArea: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
        fontSize: 15,
        color: '#1f2937',
        minHeight: 80,
    },

    // Blood type chips
    bloodChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SP.sm,
        marginBottom: SP.md,
    },
    bloodChip: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#f3f4f6',
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
    },
    bloodChipActive: {
        backgroundColor: '#1d4ed8',
        borderColor: '#1d4ed8',
    },
    bloodChipText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#4b5563',
    },
    bloodChipTextActive: {
        color: '#ffffff',
    },

    // Rh
    rhSection: {
        marginBottom: SP.md,
    },
    rhToggleRow: {
        flexDirection: 'row',
        gap: SP.sm,
    },
    rhBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#f3f4f6',
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        alignItems: 'center',
    },
    rhBtnActive: {
        backgroundColor: '#1d4ed8',
        borderColor: '#1d4ed8',
    },
    rhBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#4b5563',
    },
    rhBtnTextActive: {
        color: '#ffffff',
    },

    // Save button
    saveBtn: {
        backgroundColor: '#1d4ed8',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
});
