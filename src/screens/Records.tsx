import React, { useState, useMemo } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, Modal, Pressable,
} from 'react-native';
import { useMedContext } from '../context/MedContext';
import { PrescriptionCard } from '../components/PrescriptionCard';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Vietnamese Diacritics Removal ──────────────────────────────

function removeVietnameseTones(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

// ─── Status / Type Helpers ──────────────────────────────────────

type RecordStatus = 'active' | 'completed';
type RecordType = 'routine' | 'prescription';

function checkRecordStatus(record: { date: string; duration: number }): RecordStatus {
    if (record.duration === 0) return 'completed'; // Stopped via archive
    const startDate = new Date(record.date + 'T00:00:00');
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (record.duration || 1) - 1);
    endDate.setHours(23, 59, 59, 999);
    return new Date() > endDate ? 'completed' : 'active';
}

function checkRecordType(record: { duration: number; hospital: string }): RecordType {
    if (record.duration === 999) return 'routine';
    if (record.hospital?.toLowerCase().includes('định kỳ')) return 'routine';
    return 'prescription';
}

// ─── Filter Config ──────────────────────────────────────────────

const STATUS_FILTERS = [
    { id: 'all',       label: 'Tất cả',        icon: 'layers-outline' as const },
    { id: 'active',    label: 'Đang điều trị',  icon: 'pulse-outline' as const },
    { id: 'completed', label: 'Đã hoàn thành',  icon: 'checkmark-done-outline' as const },
];

const TYPE_FILTERS = [
    { id: 'all',          label: 'Tất cả',        icon: 'apps-outline' as const },
    { id: 'prescription', label: 'Đơn bác sĩ',    icon: 'document-text-outline' as const },
    { id: 'routine',      label: 'Thuốc định kỳ', icon: 'repeat-outline' as const },
];

// ─── Component ──────────────────────────────────────────────────

export default function Records() {
    const { records, deletePrescription } = useMedContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [showFilterModal, setShowFilterModal] = useState(false);
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all';

    // ── Filtered records ─────────────────────────────────────
    const filteredRecords = useMemo(() => {
        const normalizedQuery = removeVietnameseTones(searchQuery.trim());
        return records.filter(record => {
            if (statusFilter !== 'all' && checkRecordStatus(record) !== statusFilter) return false;
            if (typeFilter !== 'all' && checkRecordType(record) !== typeFilter) return false;
            if (normalizedQuery) {
                const hospitalMatch = removeVietnameseTones(record.hospital || '').includes(normalizedQuery);
                const medMatch = record.medicines.some(m =>
                    removeVietnameseTones(m.name || '').includes(normalizedQuery)
                );
                if (!hospitalMatch && !medMatch) return false;
            }
            return true;
        });
    }, [records, searchQuery, statusFilter, typeFilter]);

    // ── Counts ───────────────────────────────────────────────
    const counts = useMemo(() => {
        let active = 0, completed = 0, routine = 0, prescription = 0;
        records.forEach(r => {
            if (checkRecordStatus(r) === 'active') active++; else completed++;
            if (checkRecordType(r) === 'routine') routine++; else prescription++;
        });
        return {
            status: { all: records.length, active, completed } as Record<string, number>,
            type: { all: records.length, prescription, routine } as Record<string, number>,
        };
    }, [records]);

    // ── Active filter summary text ───────────────────────────
    const filterSummary = useMemo(() => {
        const parts: string[] = [];
        if (statusFilter !== 'all') {
            parts.push(STATUS_FILTERS.find(f => f.id === statusFilter)?.label || '');
        }
        if (typeFilter !== 'all') {
            parts.push(TYPE_FILTERS.find(f => f.id === typeFilter)?.label || '');
        }
        return parts.join(' · ');
    }, [statusFilter, typeFilter]);

    return (
        <View style={s.container}>
            {/* ── Compact Header ── */}
            <View style={[s.header, { paddingTop: insets.top + 16 }]}>
                <Text style={s.title}>Đơn thuốc của tôi</Text>

                {/* Search + Filter Row */}
                <View style={s.searchRow}>
                    <View style={s.searchContainer}>
                        <Ionicons name="search-outline" size={18} color="#9ca3af" />
                        <TextInput
                            style={s.searchInput}
                            placeholder="Tìm theo bệnh viện, thuốc..."
                            placeholderTextColor="#9ca3af"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery !== '' && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color="#9ca3af" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Filter Button */}
                    <TouchableOpacity
                        style={[s.filterBtn, hasActiveFilters && s.filterBtnActive]}
                        onPress={() => setShowFilterModal(true)}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name="options-outline"
                            size={20}
                            color={hasActiveFilters ? '#fff' : '#374151'}
                        />
                        {hasActiveFilters && <View style={s.filterDot} />}
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Content ── */}
            {records.length === 0 ? (
                <View style={s.emptyState}>
                    <View style={s.emptyIcon}>
                        <Ionicons name="folder-open-outline" size={32} color="#9ca3af" />
                    </View>
                    <Text style={s.emptyTitle}>Bạn chưa có đơn thuốc nào</Text>
                    <Text style={s.emptySubtext}>
                        Lưu trữ và theo dõi tiến trình uống thuốc ngay hôm nay.
                    </Text>
                </View>
            ) : filteredRecords.length === 0 ? (
                <View style={s.noResults}>
                    <MaterialCommunityIcons name="file-search-outline" size={40} color="#d1d5db" />
                    <Text style={s.noResultsTitle}>Không tìm thấy</Text>
                    <Text style={s.noResultsText}>
                        Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
                    </Text>
                </View>
            ) : (
                <>
                    <FlatList
                        style={s.list}
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
                </>
            )}

            {/* ── Filter Bottom Sheet Modal ── */}
            <Modal
                visible={showFilterModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowFilterModal(false)}
            >
                <Pressable style={s.modalOverlay} onPress={() => setShowFilterModal(false)}>
                    <Pressable style={s.modalSheet} onPress={() => {}}>
                        {/* Handle bar */}
                        <View style={s.modalHandle} />

                        {/* Modal Header */}
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Bộ lọc</Text>
                            <TouchableOpacity
                                onPress={() => setShowFilterModal(false)}
                                style={s.modalCloseBtn}
                            >
                                <Ionicons name="close" size={22} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        {/* Section: Status */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionLabel}>Trạng thái</Text>
                            <View style={s.modalChipGrid}>
                                {STATUS_FILTERS.map(f => {
                                    const isSelected = statusFilter === f.id;
                                    const count = counts.status[f.id] ?? 0;
                                    return (
                                        <TouchableOpacity
                                            key={f.id}
                                            onPress={() => setStatusFilter(f.id)}
                                            style={[s.modalChip, isSelected && s.modalChipSelectedDark]}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={f.icon}
                                                size={16}
                                                color={isSelected ? '#fff' : '#6b7280'}
                                            />
                                            <Text style={[s.modalChipText, isSelected && s.modalChipTextSelected]}>
                                                {f.label}
                                            </Text>
                                            <View style={[s.modalChipBadge, isSelected && s.modalChipBadgeSelected]}>
                                                <Text style={[s.modalChipBadgeText, isSelected && s.modalChipBadgeTextSelected]}>
                                                    {count}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Section: Type */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionLabel}>Loại đơn</Text>
                            <View style={s.modalChipGrid}>
                                {TYPE_FILTERS.map(f => {
                                    const isSelected = typeFilter === f.id;
                                    const count = counts.type[f.id] ?? 0;
                                    return (
                                        <TouchableOpacity
                                            key={f.id}
                                            onPress={() => setTypeFilter(f.id)}
                                            style={[s.modalChip, isSelected && s.modalChipSelectedBlue]}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={f.icon}
                                                size={16}
                                                color={isSelected ? '#fff' : '#6b7280'}
                                            />
                                            <Text style={[s.modalChipText, isSelected && s.modalChipTextSelected]}>
                                                {f.label}
                                            </Text>
                                            <View style={[s.modalChipBadge, isSelected && s.modalChipBadgeSelectedBlue]}>
                                                <Text style={[s.modalChipBadgeText, isSelected && s.modalChipBadgeTextSelected]}>
                                                    {count}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Footer */}
                        <View style={s.modalFooter}>
                            <TouchableOpacity
                                style={s.modalResetBtn}
                                onPress={() => { setStatusFilter('all'); setTypeFilter('all'); }}
                            >
                                <Ionicons name="refresh-outline" size={16} color="#6b7280" />
                                <Text style={s.modalResetText}>Xóa bộ lọc</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={s.modalApplyBtn}
                                onPress={() => setShowFilterModal(false)}
                            >
                                <Text style={s.modalApplyText}>Áp dụng</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: {
        // paddingTop set inline via insets.top + 16
        paddingBottom: 12,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827',
        letterSpacing: -0.3,
        marginBottom: 14,
    },

    // Search + Filter row
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        marginLeft: 8,
    },
    filterBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterBtnActive: {
        backgroundColor: '#111827',
        borderColor: '#111827',
    },
    filterDot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
        borderWidth: 1.5,
        borderColor: '#111827',
    },

    // Active filter bar
    activeFilterBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#eff6ff',
        borderRadius: 8,
    },
    activeTagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    activeTagText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2563eb',
    },
    clearText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#ef4444',
    },

    // Result bar
    resultBar: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: '#f9fafb',
    },
    resultText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6b7280',
    },
    list: { flex: 1, backgroundColor: '#fff' },

    // Empty
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    emptyIcon: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4, textAlign: 'center' },
    emptySubtext: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    emptyBtn: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#111827', paddingHorizontal: 24, paddingVertical: 12,
        borderRadius: 100, gap: 4,
    },
    emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // No results
    noResults: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    noResultsTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 12 },
    noResultsText: { fontSize: 14, color: '#9ca3af', marginTop: 4, textAlign: 'center' },

    // ── Modal ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingBottom: 36,
        maxHeight: '70%',
    },
    modalHandle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#d1d5db',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    modalCloseBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center',
    },

    // Modal sections
    modalSection: {
        marginTop: 20,
    },
    modalSectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 10,
    },
    modalChipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    modalChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 6,
    },
    modalChipSelectedDark: {
        backgroundColor: '#111827',
        borderColor: '#111827',
    },
    modalChipSelectedBlue: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    modalChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    modalChipTextSelected: {
        color: '#fff',
    },
    modalChipBadge: {
        backgroundColor: '#e5e7eb',
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 1,
        minWidth: 22,
        alignItems: 'center',
    },
    modalChipBadgeSelected: {
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    modalChipBadgeSelectedBlue: {
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    modalChipBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6b7280',
    },
    modalChipBadgeTextSelected: {
        color: '#fff',
    },

    // Modal footer
    modalFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 28,
    },
    modalResetBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: '#f3f4f6',
    },
    modalResetText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6b7280',
    },
    modalApplyBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: '#111827',
    },
    modalApplyText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
});
