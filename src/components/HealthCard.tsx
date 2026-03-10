import React from 'react';
import { View, Text } from 'react-native';

interface HealthCardProps {
    title: string;
    value: string;
    unit?: string;
    iconName?: string;
}

export const HealthCard = ({ title, value, unit }: HealthCardProps) => {
    return (
        <View className="bg-white p-4 rounded-xl shadow-sm flex-1 mx-1 border border-gray-100">
            <Text className="text-textSecondary text-sm mb-1">{title}</Text>
            <View className="flex-row items-baseline">
                <Text className="text-2xl font-bold text-text">{value}</Text>
                {unit && <Text className="text-textSecondary text-xs ml-1">{unit}</Text>}
            </View>
        </View>
    );
};
