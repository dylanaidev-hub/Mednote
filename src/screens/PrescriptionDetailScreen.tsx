import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert, Platform, FlatList, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageView from 'react-native-image-viewing';
import { useMedContext } from '../context/MedContext';
import PrimaryButton from '../components/PrimaryButton';
import Badge from '../components/Badge';
import MedicineDetailCard from '../components/MedicineDetailCard';
import { formatLocalDate, getPrescriptionStatus } from '../utils/dateUtils';
import { useToast } from '../context/ToastContext';
import { getWeekDays, getMotivationalText } from '../services/doseLogService';
import {
    getWeeklyProgressFromDB,
    getStreakFromDB,
    calculateComplianceFromDB,
} from '../database/doseLogDAO';
import { DayProgress } from '../types/schema';

export default function PrescriptionDetailScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { records, archivePrescription, updatePrescription } = useMedContext();
    const { prescriptionId } = route.params;
    const insets = useSafeAreaInsets();
    const { showToast } = useToast();

    const prescription = records.find(r => r.id === prescriptionId);

    const [visible, setIsVisible] = useState(false);
    const [imageIndex, setImageIndex] = useState(0);
    const [now, setNow] = useState(new Date());

    useFocusEffect(
        useCallback(() => {
            setNow(new Date());
        }, [])
    );

    if (!prescription) {
        return (
            <View className="flex-1 bg-white items-center justify-center p-6">
                <Text>Không tìm thấy đơn thuốc</Text>
            </View>
        );
    }

    const images = prescription.images ? prescription.images.map(uri => ({ uri })) : [];

    const startDate = new Date(prescription.date + 'T00:00:00'); // local midnight
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (prescription.duration || 1) - 1);
    endDate.setHours(23, 59, 59, 999);
    // duration === 0 is definitive "STOPPED" flag from archive
    const isRoutine = prescription.hospital?.toLowerCase().includes('định kỳ') || false;
    const rxStatus = getPrescriptionStatus(prescription.date, prescription.duration, isRoutine);
    const isActive = rxStatus.status === 'active' || rxStatus.status === 'upcoming';

    const medicineNames = prescription.medicines.map(m => m.name).filter(Boolean);
    const pageTitle = isRoutine
        ? (medicineNames.join(', ') || 'Thuốc định kỳ')
        : (prescription.recordTitle || prescription.hospital || 'Chi tiết đơn thuốc');

    // Design System Color Tokens (Clinical Utility Sync)
    const PRIMARY_BLUE = '#2563eb';
    const DANGER_RED = '#ef4444';
    const NAVY_TEXT = '#111827';
    const GRAY_500 = '#6b7280';
    const GRAY_100 = '#E5E7EB';
    const BG_OFF_WHITE = '#F9FAFB';

    // Clinical Utility Design Tokens
    const LIGHT_SHADOW = Platform.select({
        ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
        },
        android: {
            elevation: 1,
        },
    });

    // --- Weekly Progress Logic (SSoT from Database) ---
    const [weekOffset, setWeekOffset] = useState(0);
    const [weekHistory, setWeekHistory] = useState<DayProgress[]>([]);
    const [lastWeekHistory, setLastWeekHistory] = useState<DayProgress[]>([]);
    const [compliance, setCompliance] = useState(0);
    const [currentStreak, setCurrentStreak] = useState(0);

    const flatListRef = useRef<FlatList>(null);
    const { width: SCREEN_WIDTH } = Dimensions.get('window');
    const CARD_WIDTH = SCREEN_WIDTH - 40;

    const currentWeekDays = useMemo(() => getWeekDays(weekOffset, now), [weekOffset, now]);
    const previousWeekDays = useMemo(() => getWeekDays(weekOffset - 1, now), [weekOffset, now]);

    // Format: DD/MM
    const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = currentWeekDays[0].getMonth();
    const monthEnd = currentWeekDays[6].getMonth();
    const monthLabel = monthStart === monthEnd
        ? `Tháng ${monthStart + 1} • `
        : '';
    const weekRangeText = `${monthLabel}${fmtDate(currentWeekDays[0])} - ${fmtDate(currentWeekDays[6])}`;

    useEffect(() => {
        const loadProgressAndStreak = async () => {
            const rxCreatedAt = prescription.createdAt;

            // Load 7-day progress for the selected week
            const historyObj = await getWeeklyProgressFromDB(
                prescriptionId,
                rxCreatedAt,
                currentWeekDays[0],
                currentWeekDays[6]
            );
            setWeekHistory(historyObj);

            // Load 7-day progress for the previous week
            const historyLastObj = await getWeeklyProgressFromDB(
                prescriptionId,
                rxCreatedAt,
                previousWeekDays[0],
                previousWeekDays[6]
            );
            setLastWeekHistory(historyLastObj);

            // Calculate compliance % from the db-driven weekHistory
            const comp = calculateComplianceFromDB(historyObj);
            setCompliance(comp);

            // Calculate overall streak
            const streakRes = await getStreakFromDB(prescriptionId, rxCreatedAt);
            setCurrentStreak(streakRes.count);
        };
        loadProgressAndStreak();
    }, [prescriptionId, prescription.createdAt, currentWeekDays, previousWeekDays]);

    const motivationalText = getMotivationalText(compliance);

    const handleEdit = () => {
        const target = isRoutine ? 'RoutineAdd' : 'ManualAdd';
        navigation.navigate(target, {
            mode: 'edit',
            prescription,
        });
    };

    return (
        <View className="flex-1" style={{ backgroundColor: BG_OFF_WHITE }}>
            {/* Minimal Navigation Header - Safe touch targets 44x44 */}
            <View
                className="px-5 pb-2 bg-transparent z-10 w-full flex-row items-center justify-between"
                style={{ paddingTop: insets.top + 12 }}
            >
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    className="w-11 h-11 items-center justify-center -ml-2"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="chevron-back" size={28} color={NAVY_TEXT} />
                </TouchableOpacity>
                <Text className="text-[17px] font-bold" style={{ color: NAVY_TEXT }}>Chi tiết đơn thuốc</Text>
                <TouchableOpacity
                    onPress={handleEdit}
                    className="w-11 h-11 items-center justify-center -mr-2"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="create-outline" size={24} color={NAVY_TEXT} />
                </TouchableOpacity>
            </View>

            <ScrollView
                className="flex-1 px-5"
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 40, paddingTop: 16, gap: 20 }}
                showsVerticalScrollIndicator={false}
            >

                <View>
                    <Text className="text-[32px] font-black leading-[38px] mb-2" style={{ color: NAVY_TEXT }} numberOfLines={2}>
                        {pageTitle}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Badge label={rxStatus.label} variant={rxStatus.badgeVariant} />
                        <Text style={{ fontSize: 13, color: '#6B7280' }}>
                            Cập nhật ngày {startDate.toLocaleDateString('vi-VN')}
                        </Text>
                    </View>
                </View>



                    {/* 3. Status & Progress Card - Hidden */}
                    {!isRoutine && false && (
                        <View
                            className="bg-white p-5 rounded-[24px] flex-row items-center"
                            style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}
                        >
                            <View className="flex-1 items-center justify-center">
                                <Ionicons name="pulse-outline" size={26} color={PRIMARY_BLUE} />
                                <Text className="text-[16px] font-black mt-1" style={{ color: isActive ? '#2563eb' : '#6b7280' }}>{isActive ? 'Đang uống' : 'Hoàn thành'}</Text>
                                <Text className="text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: GRAY_500 }}>Trạng thái</Text>
                            </View>

                            <View style={{ width: 1, height: 40, backgroundColor: GRAY_100 }} />

                            <View className="flex-1 items-center justify-center">
                                <Ionicons name="calendar-outline" size={26} color={PRIMARY_BLUE} />
                                <Text className="text-[16px] font-black mt-1" style={{ color: NAVY_TEXT }}>
                                    Ngày {Math.floor((now.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1}/{prescription?.duration}
                                </Text>
                                <Text className="text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: GRAY_500 }}>Tiến độ</Text>
                            </View>
                        </View>
                    )}

                    <View
                        className="bg-white rounded-[24px] overflow-hidden"
                        style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}>
                        <View className="p-5 pb-0">
                            {/* Row 1: Title + Badge | Hôm nay */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text className="text-[16px] font-black" style={{ color: NAVY_TEXT }}>Chuỗi ngày uống</Text>
                                    {currentStreak > 0 && (
                                        <View className="bg-orange-50 px-2.5 py-1 rounded-full flex-row items-center border border-orange-100">
                                            <MaterialCommunityIcons name="fire" size={14} color="#ea580c" />
                                            <Text className="text-[12px] font-bold text-orange-600 ml-0.5">{currentStreak}</Text>
                                        </View>
                                    )}
                                </View>
                                {weekOffset !== 0 && (
                                    <TouchableOpacity onPress={() => setWeekOffset(0)} style={{ paddingHorizontal: 6, paddingVertical: 3 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#2563eb' }}>Hôm nay</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Row 2: Date range description */}
                            <Text style={{ fontSize: 13, color: GRAY_500, marginTop: 4, marginBottom: 16 }}>
                                {weekOffset === 0 ? 'Tuần này' : weekRangeText}
                            </Text>
                        </View>

                        {/* Row 3: Carousel — < [7 days] > */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 20 }}>
                            {/* Left arrow */}
                            <TouchableOpacity
                                onPress={() => setWeekOffset(prev => prev - 1)}
                                style={{ padding: 4 }}
                            >
                                <Ionicons name="chevron-back" size={22} color={GRAY_500} />
                            </TouchableOpacity>

                            {/* 7 days strip */}
                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
                                {weekHistory.map(({ date, status }, idx) => {
                                    const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
                                    const isMissed = status === 'MISSED';
                                    const isDone = status === 'COMPLETED';
                                    const isFuture = status === 'FUTURE';
                                    const isNotApplicable = status === 'NOT_APPLICABLE';

                                    return (
                                        <View
                                            key={date.toISOString()}
                                            className="items-center"
                                            style={{ opacity: isNotApplicable ? 0.35 : 1 }}
                                        >
                                            <Text className="text-[11px] font-medium mb-0.5" style={{ color: '#9ca3af' }}>{dayLabels[idx]}</Text>
                                            <Text className="text-[14px] font-bold mb-3" style={{ color: '#374151' }}>{date.getDate()}</Text>
                                            <View
                                                className={`w-10 h-10 rounded-full items-center justify-center ${isDone ? 'bg-green-500' :
                                                    isMissed ? 'bg-red-50 border border-red-200' :
                                                        isNotApplicable ? 'bg-gray-100' :
                                                            'border-2 border-dashed'
                                                    }`}
                                                style={isFuture ? { borderColor: GRAY_100 } : {}}
                                            >
                                                {isDone && <Ionicons name="checkmark" size={22} color="white" />}
                                                {isMissed && <Ionicons name="close" size={22} color={DANGER_RED} />}
                                                {isNotApplicable && <View style={{ width: 8, height: 2, backgroundColor: '#9ca3af', borderRadius: 1 }} />}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Right arrow */}
                            <TouchableOpacity
                                onPress={() => setWeekOffset(prev => Math.min(0, prev + 1))}
                                disabled={weekOffset === 0}
                                style={{ padding: 4 }}
                            >
                                <Ionicons name="chevron-forward" size={22} color={weekOffset === 0 ? GRAY_100 : GRAY_500} />
                            </TouchableOpacity>
                        </View>

                        <View className="p-5 pt-0">
                            <Text className="text-[13px] mt-2 font-bold italic text-center" style={{ color: GRAY_500 }}>
                                Tỷ lệ tuân thủ: {compliance}% — {motivationalText}
                            </Text>
                        </View>
                    </View>

                {/* 5. Physical Attachment Card */}
                {images.length > 0 && (
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                            setImageIndex(0);
                            setIsVisible(true);
                        }}
                        className="bg-white rounded-[20px] p-4 flex-row items-center"
                        style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}
                    >
                        <Image source={images[0]} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
                        <View className="flex-1 ml-4">
                            <Text className="font-bold text-[16px]" style={{ color: NAVY_TEXT }}>Ảnh đơn thuốc gốc</Text>
                            <Text className="text-[13px] mt-1" style={{ color: GRAY_500 }}>{images.length} ảnh đính kèm</Text>
                        </View>
                        <Ionicons name="expand-outline" size={20} color={GRAY_500} />
                    </TouchableOpacity>
                )}

                <View style={{ gap: 8 }}>
                <Text
                    className="font-bold uppercase ml-1"
                    style={{ fontSize: 13, color: '#6B7280', letterSpacing: 1 }}
                >
                    Chi tiết liều dùng
                </Text>

                {prescription.medicines.map((med) => (
                    <MedicineDetailCard key={med.id} medicine={med} isActive={isActive} />
                ))}
                </View>

                {/* Action Buttons */}
                <View style={{ marginTop: 4, gap: 12 }}>
                    <PrimaryButton
                        title="Cập nhật đơn thuốc"
                        icon="create-outline"
                        onPress={handleEdit}
                    />

                    {isActive && (
                        <TouchableOpacity
                            onPress={() => {
                                const title = isRoutine ? 'Dừng uống thuốc này?' : 'Kết thúc điều trị?';
                                const message = 'Các lịch nhắc nhở trong tương lai sẽ bị hủy, nhưng lịch sử đã uống của bạn vẫn được lưu lại.';
                                Alert.alert(title, message, [
                                    { text: 'Hủy bỏ', style: 'cancel' },
                                    {
                                        text: 'Đồng ý',
                                        style: 'destructive',
                                        onPress: async () => {
                                            await archivePrescription(prescriptionId);
                                            navigation.goBack();
                                        },
                                    },
                                ]);
                            }}
                            className="w-full items-center justify-center"
                            style={{ height: 48 }}
                        >
                            <Text className="font-semibold text-[15px]" style={{ color: DANGER_RED }}>
                                {isRoutine ? 'Dừng uống thuốc này' : 'Kết thúc đợt điều trị'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {rxStatus.status === 'stopped' && (
                        <PrimaryButton
                            title="Tiếp tục uống"
                            variant="outline"
                            icon="refresh-outline"
                            onPress={() => {
                                Alert.alert(
                                    'Tiếp tục uống thuốc?',
                                    'Đơn thuốc sẽ được khôi phục và lịch nhắc nhở sẽ hoạt động trở lại.',
                                    [
                                        { text: 'Hủy bỏ', style: 'cancel' },
                                        {
                                            text: 'Tiếp tục uống',
                                            onPress: async () => {
                                                const restoredDuration = isRoutine ? 999 : 30;
                                                await updatePrescription({
                                                    ...prescription,
                                                    duration: restoredDuration,
                                                    date: formatLocalDate(new Date()),
                                                });
                                                showToast({ message: '✅ Đã khôi phục đơn thuốc!' });
                                                navigation.goBack();
                                            },
                                        },
                                    ]
                                );
                            }}
                        />
                    )}
                </View>
            </ScrollView>

            {/* Image Viewer Overlay */}
            <ImageView
                images={images}
                imageIndex={imageIndex}
                visible={visible}
                onRequestClose={() => setIsVisible(false)}
            />
        </View>
    );
}
