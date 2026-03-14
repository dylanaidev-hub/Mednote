import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert, Platform, FlatList, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageView from 'react-native-image-viewing';
import { useMedContext } from '../context/MedContext';
import PrimaryButton from '../components/PrimaryButton';
import { formatLocalDate } from '../utils/dateUtils';
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
    const { records, archivePrescription } = useMedContext();
    const { prescriptionId } = route.params;
    const insets = useSafeAreaInsets();

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
    const isActive = prescription.duration !== 0 && now >= startDate && now <= endDate;

    const isRoutine = prescription.hospital?.toLowerCase().includes('định kỳ') || false;
    const medicineNames = prescription.medicines.map(m => m.name).filter(Boolean);
    const pageTitle = isRoutine
        ? (medicineNames.join(', ') || 'Thuốc định kỳ')
        : (prescription.hospital || 'Chi tiết đơn thuốc');

    // Design System Color Tokens (Clinical Utility Sync)
    const PRIMARY_BLUE = '#2563eb';
    const DANGER_RED = '#ef4444';
    const NAVY_TEXT = '#111827';
    const GRAY_500 = '#6b7280';
    const GRAY_100 = '#E5E7EB';
    const BG_OFF_WHITE = '#F9FAFB';

    const statusTag = isRoutine ? 'Thuốc bổ định kỳ' : (isActive ? '● Đang điều trị' : ' Đã hoàn thành');
    const statusBg = isRoutine ? 'bg-green-50' : (isActive ? 'bg-blue-50' : 'bg-gray-100');
    const statusText = isRoutine ? 'text-green-600' : (isActive ? 'text-blue-600' : 'text-gray-500');

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
    const weekRangeText = `${currentWeekDays[0].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - ${currentWeekDays[6].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;

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
                    <Ionicons name="ellipsis-vertical" size={24} color={NAVY_TEXT} />
                </TouchableOpacity>
            </View>

            <ScrollView
                className="flex-1 px-5"
                contentContainerStyle={{ paddingBottom: 180 }}
                showsVerticalScrollIndicator={false}
            >

                {/* 1. Title Block */}
                <View className="mt-4 mb-0">
                    <Text className="text-[32px] font-black leading-[38px] mb-2" style={{ color: NAVY_TEXT }} numberOfLines={2}>
                        {pageTitle}
                    </Text>
                    <View className={`self-start px-2 py-1 rounded-full mb-4 ${statusBg}`}>
                        <Text className={`text-[13px] font-bold ${statusText}`}>
                            {statusTag}
                        </Text>
                    </View>

                    {/* 2. Highlight Card - Consolidated Single Card with Divider */}
                    {isRoutine && prescription.medicines[0] && (
                        <View
                            className="bg-white p-5 rounded-[24px] flex-row items-center"
                            style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}
                        >
                            <View className="flex-1 items-center justify-center">
                                <Ionicons name="time-outline" size={26} color={PRIMARY_BLUE} />
                                <Text className="text-[22px] font-black mt-1" style={{ color: NAVY_TEXT }}>
                                    {Object.values(prescription.medicines[0].sessionTimes || {})[0] || '08:00'}
                                </Text>
                                <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY_500 }}>Giờ uống</Text>
                            </View>

                            <View style={{ width: 1, height: 40, backgroundColor: GRAY_100 }} />

                            <View className="flex-1 items-center justify-center">
                                <MaterialCommunityIcons name="pill" size={26} color={PRIMARY_BLUE} />
                                <Text className="text-[20px] font-black mt-1" style={{ color: NAVY_TEXT }}>
                                    {prescription.medicines[0].quantity} {prescription.medicines[0].unit}
                                </Text>
                                <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GRAY_500 }}>Liều dùng</Text>
                            </View>
                        </View>
                    )}


                    {/* 3. Status & Progress Card - Consolidated with Divider (Non-routine) */}
                    {!isRoutine && (
                        <View
                            className="bg-white p-5 rounded-[24px] flex-row items-center"
                            style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}
                        >
                            <View className="flex-1 items-center justify-center">
                                <Ionicons name="pulse-outline" size={26} color={PRIMARY_BLUE} />
                                <Text className={`text-[16px] font-black mt-1 ${statusText}`}>{isActive ? 'Đang uống' : 'Hoàn thành'}</Text>
                                <Text className="text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: GRAY_500 }}>Trạng thái</Text>
                            </View>

                            <View style={{ width: 1, height: 40, backgroundColor: GRAY_100 }} />

                            <View className="flex-1 items-center justify-center">
                                <Ionicons name="calendar-outline" size={26} color={PRIMARY_BLUE} />
                                <Text className="text-[16px] font-black mt-1" style={{ color: NAVY_TEXT }}>
                                    Ngày {Math.floor((now.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1}/{prescription.duration}
                                </Text>
                                <Text className="text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: GRAY_500 }}>Tiến độ</Text>
                            </View>
                        </View>
                    )}

                    {/* 4. TIẾN ĐỘ TUẦN NÀY - Section Header (Dynamic) */}
                    <View className="flex-row justify-between items-end" style={{ marginTop: 24, marginBottom: 8 }}>
                        <Text
                            className="font-bold uppercase ml-1"
                            style={{ fontSize: 13, color: '#6B7280', letterSpacing: 1 }}
                        >
                            Tiến độ {weekOffset === 0 ? 'tuần này' : weekRangeText}
                        </Text>
                        <View className="flex-row items-center space-x-4">
                            <TouchableOpacity onPress={() => {
                                flatListRef.current?.scrollToIndex({ index: 1, animated: true });
                                setWeekOffset(-1);
                            }}>
                                <Ionicons name="chevron-back" size={20} color={GRAY_500} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => {
                                flatListRef.current?.scrollToIndex({ index: 0, animated: true });
                                setWeekOffset(0);
                            }} disabled={weekOffset === 0}>
                                <Ionicons name="chevron-forward" size={20} color={weekOffset === 0 ? GRAY_100 : GRAY_500} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View
                        className="bg-white rounded-[24px] overflow-hidden"
                        style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}
                    >
                        <View className="p-5 pb-0">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-[16px] font-black" style={{ color: NAVY_TEXT }}>Chuỗi ngày uống</Text>
                                {currentStreak > 0 && (
                                    <View className="bg-orange-50 px-3 py-1 rounded-full flex-row items-center border border-orange-100">
                                        <MaterialCommunityIcons name="fire" size={16} color="#ea580c" />
                                        <Text className="text-[12px] font-bold text-orange-600 ml-1">{currentStreak} ngày liên tiếp</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        <FlatList
                            ref={flatListRef}
                            data={[0, -1]} // Current and Last week
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(item) => item.toString()}
                            onMomentumScrollEnd={(e) => {
                                const offset = e.nativeEvent.contentOffset.x;
                                const index = Math.round(offset / (SCREEN_WIDTH - 40));
                                setWeekOffset(index === 0 ? 0 : -1);
                            }}
                            renderItem={({ item: offset }) => {
                                const history = offset === 0 ? weekHistory : lastWeekHistory;

                                return (
                                    <View style={{ width: SCREEN_WIDTH - 40 }} className="flex-row justify-between items-center px-4 pb-5">
                                        {history.map(({ date, status }, idx) => {
                                            const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
                                            const isMissed = status === 'MISSED';
                                            const isDone = status === 'COMPLETED';
                                            const isFuture = status === 'FUTURE';
                                            const isNotApplicable = status === 'NOT_APPLICABLE';

                                            return (
                                                <View
                                                    key={date.toISOString()}
                                                    className="items-center flex-1"
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
                                );
                            }}
                        />

                        <View className="p-5 pt-0">
                            <Text className="text-[13px] mt-2 font-bold italic text-center" style={{ color: GRAY_500 }}>
                                Tỷ lệ tuân thủ: {compliance}% — {motivationalText}
                            </Text>
                        </View>
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
                        className="bg-white rounded-[20px] p-4 flex-row items-center mt-4"
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

                {/* 6. CHI TIẾT LIỀU DÙNG - Section Header (Profile Style) */}
                <Text
                    className="font-bold uppercase ml-1"
                    style={{ fontSize: 13, color: '#6B7280', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}
                >
                    Chi tiết liều dùng
                </Text>

                {prescription.medicines.map((med, index) => {
                    const iconBg = isActive ? 'bg-blue-50' : 'bg-gray-100';
                    const iconColor = isActive ? PRIMARY_BLUE : '#9ca3af';

                    // Dynamic icon based on med type (same logic as Dashboard)
                    const getIconConfig = () => {
                        if (isRoutine || med.source === 'routine') {
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
                    };
                    const iconCfg = getIconConfig();

                    return (
                        <View
                            key={med.id}
                            className="bg-white rounded-[24px] p-6 mb-4"
                            style={[{ borderColor: GRAY_100, borderWidth: 1 }, LIGHT_SHADOW]}
                        >
                            <View className="flex-row items-center mb-6">
                                <View className="w-14 h-14 rounded-[18px] items-center justify-center mr-4"
                                    style={{ backgroundColor: iconCfg.bgColor }}>
                                    {iconCfg.family === 'Ionicons' ? (
                                        <Ionicons name={iconCfg.name as any} size={28} color={iconCfg.color} />
                                    ) : (
                                        <MaterialCommunityIcons name={iconCfg.name as any} size={28} color={iconCfg.color} />
                                    )}
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[18px] font-black" style={{ color: NAVY_TEXT }}>{med.name}</Text>
                                    <Text className="text-[14px] font-bold" style={{ color: GRAY_500 }}>{med.quantity} {med.unit} / lần uống</Text>
                                </View>
                            </View>

                            <View className="border-t pt-5" style={{ borderColor: '#F3F4F6' }}>
                                {(() => {
                                    // Group times by session (merge sub-times with parent)
                                    const grouped: Record<string, string[]> = {};
                                    Object.entries(med.sessionTimes || {}).forEach(([key, time]) => {
                                        const baseSession = key.includes('_sub_') ? key.split('_sub_')[0] : key;
                                        const displayKey = baseSession.charAt(0).toUpperCase() + baseSession.slice(1);
                                        if (!grouped[displayKey]) grouped[displayKey] = [];
                                        grouped[displayKey].push(time);
                                    });

                                    // Session color/icon lookup
                                    const SESSION_THEME: Record<string, { icon: string; color: string }> = {
                                        'Sáng': { icon: 'weather-sunny', color: '#f59e0b' },
                                        'Trưa': { icon: 'weather-partly-cloudy', color: '#f97316' },
                                        'Chiều': { icon: 'weather-sunset', color: '#ef4444' },
                                        'Tối': { icon: 'moon-waning-crescent', color: '#6366f1' },
                                    };

                                    return Object.entries(grouped).map(([session, times]) => {
                                        const theme = SESSION_THEME[session] || { icon: 'clock-outline', color: GRAY_500 };
                                        return (
                                            <View key={session} className="flex-row items-center justify-between mb-4 last:mb-0">
                                                <View className="flex-row items-center">
                                                    <MaterialCommunityIcons name={theme.icon as any} size={18} color={theme.color} style={{ marginRight: 8 }} />
                                                    <Text className="text-[15px] font-bold" style={{ color: theme.color }}>{session}</Text>
                                                </View>
                                                <View className="bg-gray-50 px-4 py-2 rounded-xl">
                                                    <Text className="text-[17px] font-black" style={{ color: NAVY_TEXT }}>
                                                        {times.sort().join(', ')}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    });
                                })()}
                            </View>

                            {/* Meal Timing */}
                            {med.mealTiming ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#FDBA74', marginTop: 12 }}>
                                    <Ionicons name="restaurant-outline" size={16} color="#EA580C" />
                                    <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#EA580C' }}>{med.mealTiming}</Text>
                                </View>
                            ) : null}

                            {/* Note */}
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
                })}
            </ScrollView>

            {/* Sticky Bottom Bar - Clinical Utility: 44pt Touch Targets */}
            <View
                className="absolute bottom-0 w-full bg-white px-5 pt-4 border-t"
                style={{
                    paddingBottom: Math.max(34, insets.bottom),
                    borderColor: GRAY_100
                }}
            >
                <Text className="text-center text-[12px] mb-3 font-bold" style={{ color: GRAY_500 }}>
                    Đã lưu vào ngày {startDate.toLocaleDateString('vi-VN')}
                </Text>

                <PrimaryButton
                    title="Cập nhật đơn thuốc"
                    icon="create-outline"
                    onPress={handleEdit}
                    style={{ marginBottom: 12 }}
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
                        className="w-full h-12 items-center justify-center"
                        style={{ height: 48 }}
                    >
                        <Text className="font-bold text-[16px]" style={{ color: DANGER_RED }}>
                            {isRoutine ? 'Dừng uống thuốc này' : 'Kết thúc đợt điều trị'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

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
