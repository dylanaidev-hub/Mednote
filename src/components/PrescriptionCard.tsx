import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { Prescription } from '../context/MedContext';
import { getPrescriptionStatus, formatFrequency } from '../utils/dateUtils';
import Badge from './Badge';
import * as Haptics from 'expo-haptics';

interface PrescriptionCardProps {
    prescription: Prescription;
    onDelete: (id: string) => void;
    onPress: (id: string) => void;
}

export const PrescriptionCard = ({ prescription, onDelete, onPress }: PrescriptionCardProps) => {

    const renderRightActions = () => {
        return (
            <TouchableOpacity
                onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onDelete(prescription.id);
                }}
                className="bg-red-500 justify-center items-center w-[80px] h-full"
            >
                <Ionicons name="trash" size={24} color="white" />
            </TouchableOpacity>
        );
    };

    const startDate = new Date(prescription.date + 'T00:00:00'); // local midnight

    const isRoutine = prescription.hospital?.toLowerCase().includes('định kỳ') || false;
    const rxStatus = getPrescriptionStatus(prescription.date, prescription.duration, isRoutine);
    const isStopped = rxStatus.status === 'stopped' || rxStatus.status === 'completed';

    const medicineNames = prescription.medicines.map(m => m.name).filter(Boolean);
    const title = isRoutine
        ? (medicineNames.join(', ') || 'Thuốc định kỳ')
        : (prescription.recordTitle || prescription.hospital || 'Đơn thuốc cá nhân');

    // Build frequency string from first medicine's weekdays
    const firstMedWeekdays = prescription.medicines[0]?.weekdays;
    const freqStr = formatFrequency(firstMedWeekdays);

    const subtitle = isRoutine
        ? `${startDate.toLocaleDateString('vi-VN')} • ${freqStr}`
        : `${startDate.toLocaleDateString('vi-VN')}${prescription.duration > 0 ? ` • ${prescription.duration} ngày` : ''}`;

    // Card leading icon
    const TagIcon = isRoutine ? 'leaf' : 'clipboard-plus';
    const iconColor = isStopped ? '#9ca3af' : '#1D4ED8';
    const iconBg = isStopped ? '#f3f4f6' : '#DBEAFE';

    return (
        <Swipeable renderRightActions={renderRightActions} friction={2}>
            <TouchableOpacity
                onPress={() => onPress(prescription.id)}
                className="bg-white flex-row items-center p-4 border-b border-gray-100"
            >
                {/* Left: 3-Layer Icon (matches Action Sheet) */}
                <View className="w-[56px] h-[56px] rounded-[16px] items-center justify-center mr-3" style={{ backgroundColor: iconBg }}>
                    <View style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: iconColor, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name={TagIcon as any} size={20} color="#FFFFFF" />
                    </View>
                </View>

                {/* Middle: Text Information */}
                <View className="flex-1 justify-center mr-2">
                    <Text className="text-[16px] font-semibold text-gray-900 mb-0.5" numberOfLines={1}>
                        {title}
                    </Text>
                    <Text className="text-[13px] text-gray-500" numberOfLines={1}>
                        {subtitle}
                    </Text>
                </View>

                {/* Right: Status Badge and Chevron */}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Badge label={rxStatus.label} variant={rxStatus.badgeVariant} />
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" style={{ marginLeft: 8 }} />
                </View>
            </TouchableOpacity>
        </Swipeable>
    );
};
