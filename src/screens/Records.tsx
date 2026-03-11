import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useMedContext } from '../context/MedContext';
import { PrescriptionCard } from '../components/PrescriptionCard';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function Records() {
    const { records, deletePrescription } = useMedContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const navigation = useNavigation<any>();

    const filters = [
        { id: 'all', label: 'Tất cả' },
        { id: 'active', label: 'Đang điều trị' },
        { id: 'completed', label: 'Đã hoàn thành' },
    ];

    const filteredRecords = records.filter(record => {
        // Text Match
        const query = searchQuery.toLowerCase();
        const hospitalMatch = record.hospital.toLowerCase().includes(query);
        const medMatch = record.medicines.some(m => m.name.toLowerCase().includes(query));
        const matchesSearch = hospitalMatch || medMatch;

        // Filter Match
        const startDate = new Date(record.date + 'T00:00:00'); // local midnight
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + record.duration);
        endDate.setHours(23, 59, 59, 999);
        const now = new Date();
        const isActive = now >= startDate && now <= endDate;

        if (activeFilter === 'active') return matchesSearch && isActive;
        if (activeFilter === 'completed') return matchesSearch && !isActive;
        return matchesSearch;
    });

    return (
        <View className="flex-1 bg-white">
            {/* Minimal Header */}
            <View className="pt-16 pb-4 bg-white z-10 w-full border-b border-gray-100">
                <View className="flex-row items-center mb-4 mt-2 px-5">
                    <Text className="text-[28px] font-extrabold text-gray-900 tracking-tight">Đơn thuốc của tôi</Text>
                </View>

                {/* Search Bar */}
                <View className="px-5">
                    <View className="flex-row items-center bg-gray-50 border border-gray-100 rounded-[12px] px-3 py-3">
                        <Ionicons name="search-outline" size={20} color="#9ca3af" />
                        <TextInput
                            className="flex-1 text-gray-900 text-[15px] ml-2"
                            placeholder="Tìm theo bệnh, bác sĩ hoặc thuốc..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery !== '' && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={20} color="#9ca3af" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Filter Chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-4 px-5"
                    contentContainerStyle={{ paddingRight: 40 }}
                >
                    {filters.map(filter => {
                        const isSelected = activeFilter === filter.id;
                        return (
                            <TouchableOpacity
                                key={filter.id}
                                onPress={() => setActiveFilter(filter.id)}
                                className={`mr-2 px-4 py-2 rounded-full border ${isSelected ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`text-[14px] font-semibold ${isSelected ? 'text-white' : 'text-gray-600'}`}>
                                    {filter.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {records.length === 0 ? (
                <View className="flex-1 items-center justify-center p-6 bg-gray-50/50">
                    <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-4">
                        <Ionicons name="folder-open-outline" size={32} color="#9ca3af" />
                    </View>
                    <Text className="text-[17px] font-bold text-gray-900 mb-1 text-center">Bạn chưa có đơn thuốc nào</Text>
                    <Text className="text-gray-500 text-center text-[14px] leading-5 mb-6">
                        Lưu trữ và theo dõi tiến trình uống thuốc ngay hôm nay.
                    </Text>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('Scanner')}
                        className="bg-gray-900 px-6 py-3 rounded-full flex-row items-center"
                    >
                        <Ionicons name="add" size={20} color="white" className="mr-1" />
                        <Text className="text-white font-bold ml-1">Thêm đơn thuốc</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    className="flex-1 bg-white"
                    data={filteredRecords}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <PrescriptionCard
                            prescription={item}
                            onDelete={deletePrescription}
                            onPress={(id) => {
                                navigation.navigate('PrescriptionDetail', { prescriptionId: id });
                            }}
                        />
                    )}
                    initialNumToRender={5}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                />
            )}
        </View>
    );
}
