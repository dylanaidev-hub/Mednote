import React from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TermsAndPrivacyScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />

            {/* ── Header ── */}
            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={s.backBtn}
                    activeOpacity={0.7}
                >
                    <Ionicons name="chevron-back" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Điều khoản & Bảo mật</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* ── Content ── */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ═══ ĐIỀU KHOẢN SỬ DỤNG ═══ */}
                <Text style={s.sectionTitle}>ĐIỀU KHOẢN SỬ DỤNG</Text>

                <Text style={s.heading}>1. Chấp nhận điều khoản</Text>
                <Text style={s.body}>
                    Bằng việc tải xuống, cài đặt và sử dụng ứng dụng, bạn đồng ý tuân thủ các Điều khoản sử dụng này. Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng ngưng sử dụng ứng dụng.
                </Text>

                <Text style={s.heading}>2. Tuyên bố miễn trừ trách nhiệm y tế</Text>
                <Text style={s.body}>
                    Ứng dụng này được thiết kế để hỗ trợ bạn ghi nhớ lịch uống thuốc. Chúng tôi không cung cấp lời khuyên y tế, chẩn đoán hay điều trị. Thông tin trong ứng dụng không thể thay thế cho chỉ định của Bác sĩ. Bạn hoàn toàn chịu trách nhiệm về việc nhập đúng thông tin đơn thuốc của mình.
                </Text>

                <Text style={s.heading}>3. Giới hạn trách nhiệm</Text>
                <Text style={s.body}>
                    Chúng tôi không chịu trách nhiệm cho bất kỳ tổn thất hay thiệt hại sức khỏe nào phát sinh từ việc sử dụng sai ứng dụng, thiết bị hết pin, hoặc hệ điều hành chặn thông báo dẫn đến việc quên uống thuốc.
                </Text>

                {/* Divider */}
                <View style={s.divider} />

                {/* ═══ CHÍNH SÁCH BẢO MẬT ═══ */}
                <Text style={s.sectionTitle}>CHÍNH SÁCH BẢO MẬT</Text>

                <Text style={s.heading}>1. Dữ liệu lưu trữ cục bộ (Local Storage)</Text>
                <Text style={s.body}>
                    Chúng tôi tôn trọng tuyệt đối quyền riêng tư của bạn. Toàn bộ dữ liệu bạn nhập (tên thuốc, lịch uống, ghi chú) đều được lưu trữ cục bộ (Local) ngay trên thiết bị của bạn. Chúng tôi KHÔNG thu thập, KHÔNG đồng bộ lên máy chủ, và KHÔNG chia sẻ thông tin sức khỏe của bạn cho bên thứ ba.
                </Text>

                <Text style={s.heading}>2. Quyền truy cập thiết bị</Text>
                <Text style={s.body}>
                    Ứng dụng chỉ yêu cầu Quyền Thông báo (Notifications) để gửi lời nhắc uống thuốc và Quyền Thư viện ảnh (nếu bạn dùng tính năng thêm ảnh thuốc).
                </Text>

                <Text style={s.heading}>3. Xóa dữ liệu</Text>
                <Text style={s.body}>
                    Bạn có toàn quyền kiểm soát dữ liệu. Khi xóa (Uninstall) ứng dụng khỏi thiết bị, toàn bộ dữ liệu đi kèm sẽ bị xóa vĩnh viễn không thể khôi phục.
                </Text>

                {/* Footer */}
                <View style={s.footer}>
                    <View style={s.footerDivider} />
                    <Ionicons name="shield-checkmark" size={24} color="#d1d5db" style={{ marginBottom: 8 }} />
                    <Text style={s.footerText}>
                        MedNote — Dữ liệu của bạn, quyền riêng tư của bạn.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 14,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111827',
    },

    // Scroll
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 28,
    },

    // Typography
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
        letterSpacing: 0.3,
        marginBottom: 20,
    },
    heading: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1f2937',
        marginTop: 18,
        marginBottom: 8,
    },
    body: {
        fontSize: 15,
        fontWeight: '400',
        color: '#4b5563',
        lineHeight: 24,
    },

    // Divider
    divider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginVertical: 28,
    },

    // Footer
    footer: {
        alignItems: 'center',
        marginTop: 36,
        paddingBottom: 12,
    },
    footerDivider: {
        width: 40,
        height: 3,
        borderRadius: 2,
        backgroundColor: '#e5e7eb',
        marginBottom: 16,
    },
    footerText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#9ca3af',
        textAlign: 'center',
    },
});
