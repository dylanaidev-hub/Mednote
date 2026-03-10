import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from './StatusBadge';

interface MedicineItemProps {
    name: string;
    time?: string;
    status: 'taken' | 'pending';
    note?: string;
    onPress?: () => void;
    customBg?: string;
}

export const MedicineItem = ({ name, time, status, note, onPress, customBg }: MedicineItemProps) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            className={`${customBg || 'bg-white'} p-5 rounded-[24px] mb-4 flex-row items-center border border-gray-100 mt-1`}
        >
            <View className="flex-1 mr-4">
                <Text className="text-[18px] font-extrabold text-gray-900 mb-1" numberOfLines={2}>{name}</Text>

                <View className="flex-row items-center mt-1 mb-2">
                    <Ionicons name="time-outline" size={16} color="#6b7280" />
                    <Text className="text-gray-600 font-bold ml-1">{time}</Text>
                </View>

                {note && (
                    <Text className="text-gray-500 text-[13px] italic" numberOfLines={2}>
                        "{note}"
                    </Text>
                )}
            </View>
            <View>
                {/* Embedded StatusBadge equivalent but styled specifically for the new tokens */}
                <View className={`px-4 py-2 rounded-full flex-row items-center ${status === 'taken' ? 'bg-green-100' : 'bg-gray-900'}`}>
                    {status === 'taken' && <Ionicons name="checkmark-circle" size={14} color="#16a34a" className="mr-1" />}
                    <Text className={`text-xs font-bold ${status === 'taken' ? 'text-green-700' : 'text-white'}`}>
                        {status === 'taken' ? 'Đã uống' : 'Chưa uống'}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
};
