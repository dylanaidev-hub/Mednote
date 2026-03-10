import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useMedContext } from '../context/MedContext';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from '../components/StatusBadge';

export default function MedicineDetail() {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { medicines } = useMedContext();

    const id = route.params?.id;
    const medicine = medicines.find(m => m.id === id);

    if (!medicine) {
        return (
            <View className="flex-1 items-center justify-center bg-background">
                <Text>Không tìm thấy thuốc</Text>
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-background">
            <View className="bg-white p-6 pb-8 rounded-b-3xl shadow-sm mb-6">
                <View className="flex-row justify-between items-start mb-4">
                    <View className="flex-1 pr-4">
                        <Text className="text-3xl font-bold text-text mb-2">{medicine.name}</Text>
                        <Text className="text-xl text-primary font-medium">{medicine.time}</Text>
                    </View>
                    <StatusBadge status={medicine.status as 'taken' | 'pending'} />
                </View>
            </View>

            <View className="p-4">
                <Text className="text-xl font-bold text-text mb-4">Hướng dẫn của Bác sĩ</Text>
                <View className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-row items-start">
                    <Ionicons name="information-circle" size={24} color="#2563eb" />
                    <Text className="text-text text-lg ml-3 flex-1">{medicine.doctorNote || "Không có ghi chú"}</Text>
                </View>

                <TouchableOpacity
                    className="bg-primary p-4 rounded-xl mt-8 flex-row items-center justify-center shadow-sm"
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="checkmark-circle" size={24} color="white" />
                    <Text className="text-white font-bold text-lg ml-2">Đánh mark đã uống</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}
