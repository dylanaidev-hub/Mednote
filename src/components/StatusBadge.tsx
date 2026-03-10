import React from 'react';
import { View, Text } from 'react-native';

interface StatusBadgeProps {
    status: 'taken' | 'pending';
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
    const isTaken = status === 'taken';
    return (
        <View className={`px-3 py-1 rounded-full ${isTaken ? 'bg-green-100' : 'bg-amber-100'}`}>
            <Text className={`text-xs font-bold ${isTaken ? 'text-green-600' : 'text-amber-600'}`}>
                {isTaken ? 'Đã uống' : 'Chưa uống'}
            </Text>
        </View>
    );
};
