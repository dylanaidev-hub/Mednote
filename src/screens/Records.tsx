import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, Platform, ScrollView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import BottomSheet from '../components/BottomSheet';
import { useMedContext } from '../context/MedContext';
import { PrescriptionCard } from '../components/PrescriptionCard';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PrimaryButton from '../components/PrimaryButton';
import FilterChip from '../components/FilterChip';

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
    { id: 'active',    label: 'Đang điều trị' },
    { id: 'completed', label: 'Đã hoàn thành' },
];

const TYPE_FILTERS = [
    { id: 'prescription', label: 'Đơn bác sĩ' },
    { id: 'routine',      label: 'Thuốc định kỳ' },
];

// ─── Component ──────────────────────────────────────────────────

export default function Records() {
    const { records, deletePrescription } = useMedContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);
    const [fromDate, setFromDate] = useState<Date | null>(null);
    const [toDate, setToDate] = useState<Date | null>(null);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);
    const [showFilterModal, setShowFilterModal] = useState(false);
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const hasActiveFilters = statusFilter !== null || typeFilter !== null || fromDate !== null || toDate !== null;
    const [quickDateRange, setQuickDateRange] = useState<string | null>(null);

    const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    /** Convert Date to timezone-safe integer YYYYMMDD for comparison */
    const dateToInt = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

    // ── Smart Date Selection: auto-swap instead of silent failure ──
    const onFromDateChange = (_event: DateTimePickerEvent, date?: Date) => {
        if (Platform.OS === 'android') setShowFromPicker(false);
        if (date) {
            const d = stripTime(date);
            setQuickDateRange(null); // manual pick clears chip
            if (toDate && dateToInt(d) > dateToInt(toDate)) {
                setFromDate(d);
                setToDate(null);
            } else {
                setFromDate(d);
            }
        }
    };

    const onToDateChange = (_event: DateTimePickerEvent, date?: Date) => {
        if (Platform.OS === 'android') setShowToPicker(false);
        if (date) {
            const d = stripTime(date);
            setQuickDateRange(null); // manual pick clears chip
            if (fromDate && dateToInt(d) < dateToInt(fromDate)) {
                setFromDate(d);
                setToDate(null);
            } else {
                setToDate(d);
            }
        }
    };

    // ── Quick Date Range Selection ──
    const QUICK_RANGES = [
        { id: 'today', label: 'Hôm nay' },
        { id: '7days', label: '7 ngày qua' },
        { id: '30days', label: '30 ngày qua' },
        { id: 'month', label: 'Tháng này' },
    ];

    const handleQuickSelect = useCallback((rangeId: string) => {
        const today = stripTime(new Date());
        // Toggle: deselect if already active
        if (quickDateRange === rangeId) {
            setQuickDateRange(null);
            setFromDate(null);
            setToDate(null);
            return;
        }
        setQuickDateRange(rangeId);

        switch (rangeId) {
            case 'today':
                setFromDate(today);
                setToDate(today);
                break;
            case '7days': {
                const from = new Date(today);
                from.setDate(from.getDate() - 7);
                setFromDate(from);
                setToDate(today);
                break;
            }
            case '30days': {
                const from = new Date(today);
                from.setDate(from.getDate() - 30);
                setFromDate(from);
                setToDate(today);
                break;
            }
            case 'month': {
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                setFromDate(firstDay);
                setToDate(today);
                break;
            }
        }
    }, [quickDateRange]);

    const formatDateVN = (d: Date): string => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    };

    // ── Filtered records (Timezone-safe integer comparison) ───
    const filteredRecords = useMemo(() => {
        const normalizedQuery = removeVietnameseTones(searchQuery.trim());
        return records.filter(record => {
            if (statusFilter && checkRecordStatus(record) !== statusFilter) return false;
            if (typeFilter && checkRecordType(record) !== typeFilter) return false;

            // Date range filter — timezone-safe using integer YYYYMMDD
            if (fromDate || toDate) {
                const [year, month, day] = record.date.split('-').map(Number);
                const recordInt = year * 10000 + month * 100 + day;
                if (fromDate && recordInt < dateToInt(fromDate)) return false;
                if (toDate && recordInt > dateToInt(toDate)) return false;
            }

            if (normalizedQuery) {
                const recordNameMatch = removeVietnameseTones(record.recordTitle || '').includes(normalizedQuery);
                const hospitalMatch = removeVietnameseTones(record.hospital || '').includes(normalizedQuery);
                const medMatch = record.medicines.some(m =>
                    removeVietnameseTones(m.name || '').includes(normalizedQuery)
                );
                if (!recordNameMatch && !hospitalMatch && !medMatch) return false;
            }
            return true;
        });
    }, [records, searchQuery, statusFilter, typeFilter, fromDate, toDate]);

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
        if (statusFilter) {
            parts.push(STATUS_FILTERS.find(f => f.id === statusFilter)?.label || '');
        }
        if (typeFilter) {
            parts.push(TYPE_FILTERS.find(f => f.id === typeFilter)?.label || '');
        }
        if (fromDate || toDate) {
            const from = fromDate ? formatDateVN(fromDate) : '...';
            const to = toDate ? formatDateVN(toDate) : '...';
            parts.push(`${from} → ${to}`);
        }
        return parts.join(' · ');
    }, [statusFilter, typeFilter, fromDate, toDate]);

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
                            placeholder="Tìm theo bệnh án, bệnh viện, thuốc..."
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
                        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 80 }}
                    />
                </>
            )}

            <BottomSheet visible={showFilterModal} onClose={() => setShowFilterModal(false)} maxHeight="85%">
                <View style={{ paddingHorizontal: 20 }}>
                    {/* Modal Header */}
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>Bộ lọc</Text>
                        <TouchableOpacity
                            onPress={() => setShowFilterModal(false)}
                            style={s.modalCloseBtn}
                        >
                            <Ionicons name="close" size={20} color="#374151" />
                        </TouchableOpacity>
                    </View>

                        {/* Section 1: Date Range (TOP) */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionLabel}>Thời gian tạo</Text>
                            <View style={s.dateRangeRow}>
                                <TouchableOpacity
                                    style={[s.datePickerBtn, fromDate && s.datePickerBtnActive]}
                                    onPress={() => { setShowFilterModal(false); setTimeout(() => { setShowToPicker(false); setShowFromPicker(true); }, 300); }}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="calendar-outline" size={14} color={fromDate ? '#3B82F6' : '#9ca3af'} />
                                    <Text style={[s.datePickerText, fromDate && s.datePickerTextActive]}>
                                        {fromDate ? formatDateVN(fromDate) : 'Từ ngày'}
                                    </Text>
                                    {fromDate && (
                                        <TouchableOpacity onPress={() => setFromDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Ionicons name="close-circle" size={14} color="#93c5fd" />
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>

                                <Ionicons name="arrow-forward" size={14} color="#d1d5db" />

                                <TouchableOpacity
                                    style={[s.datePickerBtn, toDate && s.datePickerBtnActive]}
                                    onPress={() => { setShowFilterModal(false); setTimeout(() => { setShowFromPicker(false); setShowToPicker(true); }, 300); }}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="calendar-outline" size={14} color={toDate ? '#3B82F6' : '#9ca3af'} />
                                    <Text style={[s.datePickerText, toDate && s.datePickerTextActive]}>
                                        {toDate ? formatDateVN(toDate) : 'Đến ngày'}
                                    </Text>
                                    {toDate && (
                                        <TouchableOpacity onPress={() => setToDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Ionicons name="close-circle" size={14} color="#93c5fd" />
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Quick Date Range Chips */}
                            <View style={s.quickChipsRow}>
                                {QUICK_RANGES.map(r => {
                                    const isActive = quickDateRange === r.id;
                                    return (
                                        <FilterChip
                                            key={r.id}
                                            label={r.label}
                                            isActive={isActive}
                                            onPress={() => handleQuickSelect(r.id)}
                                        />
                                    );
                                })}
                            </View>
                        </View>

                        {/* Section 2: Status */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionLabel}>Trạng thái</Text>
                            <View style={s.modalChipGrid}>
                                {STATUS_FILTERS.map(f => {
                                    const isSelected = statusFilter === f.id;
                                    const count = counts.status[f.id] ?? 0;
                                    return (
                                        <FilterChip
                                            key={f.id}
                                            label={f.label}
                                            isActive={isSelected}
                                            onPress={() => setStatusFilter(isSelected ? null : f.id)}
                                            badgeCount={count}
                                        />
                                    );
                                })}
                            </View>
                        </View>

                        {/* Section 3: Type */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionLabel}>Loại đơn</Text>
                            <View style={s.modalChipGrid}>
                                {TYPE_FILTERS.map(f => {
                                    const isSelected = typeFilter === f.id;
                                    const count = counts.type[f.id] ?? 0;
                                    return (
                                        <FilterChip
                                            key={f.id}
                                            label={f.label}
                                            isActive={isSelected}
                                            onPress={() => setTypeFilter(isSelected ? null : f.id)}
                                            badgeCount={count}
                                        />
                                    );
                                })}
                            </View>
                        </View>

                        {/* Footer */}
                        <View style={[s.modalFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                            <PrimaryButton
                                variant="outline"
                                title="Xóa bộ lọc"
                                icon="refresh-outline"
                                iconSize={18}
                                onPress={() => { setStatusFilter(null); setTypeFilter(null); setFromDate(null); setToDate(null); setShowFromPicker(false); setShowToPicker(false); setQuickDateRange(null); }}
                                style={{ flex: 1 }}
                            />
                            <PrimaryButton
                                variant="solid"
                                title="Áp dụng"
                                onPress={() => { setShowFilterModal(false); setShowFromPicker(false); setShowToPicker(false); }}
                                style={{ flex: 1 }}
                            />
                        </View>
                </View>
            </BottomSheet>

            {/* ── Date Picker BottomSheet ── */}
            <BottomSheet
                visible={showFromPicker || showToPicker}
                onClose={() => { setShowFromPicker(false); setShowToPicker(false); setTimeout(() => setShowFilterModal(true), 350); }}
                maxHeight="50%"
            >
                <View style={s.datePickerSheetContent}>
                    <Text style={s.dateOverlayTitle}>
                        {showFromPicker ? 'Chọn ngày bắt đầu' : 'Chọn ngày kết thúc'}
                    </Text>
                    <DateTimePicker
                        value={showFromPicker ? (fromDate || new Date()) : (toDate || new Date())}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={showFromPicker ? onFromDateChange : onToDateChange}
                        minimumDate={showToPicker && fromDate ? fromDate : undefined}
                        locale="vi"
                        style={{ height: 160 }}
                    />
                    <PrimaryButton
                        variant="solid"
                        title="Xong"
                        onPress={() => { setShowFromPicker(false); setShowToPicker(false); setTimeout(() => setShowFilterModal(true), 350); }}
                        style={{ marginTop: 16, width: '100%' }}
                    />
                </View>
            </BottomSheet>
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
        marginBottom: 24,
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
        marginBottom: 16,
    },
    modalSectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    modalChipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },

    // Modal footer
    modalFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 12,
        marginTop: 2,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },

    // ── Date Range Filter ──
    dateRangeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    datePickerBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    datePickerBtnActive: {
        backgroundColor: '#eff6ff',
        borderColor: '#93c5fd',
    },
    datePickerText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '500',
        color: '#9ca3af',
    },
    datePickerTextActive: {
        color: '#3B82F6',
        fontWeight: '600',
    },

    // ── Quick Date Chips ──
    quickChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },

    // ── Date Picker BottomSheet ──
    datePickerSheetContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        alignItems: 'center',
    },
    dateOverlayTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 12,
    },
});
