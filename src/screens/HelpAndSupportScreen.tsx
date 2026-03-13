import React, { useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    StatusBar, Linking, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── FAQ Data ───────────────────────────────────────────────────

const FAQ_DATA = [
    {
        id: '1',
        question: 'Làm sao để tôi sửa giờ uống thuốc?',
        answer: 'Bạn có thể vào tab "Đơn thuốc", chọn đơn thuốc cần sửa, sau đó bấm vào biểu tượng "Chỉnh sửa" (cây bút) để thay đổi giờ uống.',
    },
    {
        id: '2',
        question: 'Ứng dụng có cần kết nối mạng để nhắc thuốc không?',
        answer: 'Không. MedNote hoạt động hoàn toàn ngoại tuyến (offline). Bạn vẫn sẽ nhận được thông báo nhắc nhở ngay cả khi không có kết nối Internet.',
    },
    {
        id: '3',
        question: 'Dữ liệu của tôi có bị đồng bộ đi đâu không?',
        answer: 'Toàn bộ dữ liệu của bạn chỉ được lưu trữ ngay trên điện thoại của bạn, đảm bảo quyền riêng tư và bảo mật tuyệt đối.',
    },
];

const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfoSFTdNFfWHcGitvnh8cpO-4UPRu-Tt_xpuqf5wW_rCcvPhg/viewform?usp=publish-editor';

// ─── Component ──────────────────────────────────────────────────

export default function HelpAndSupportScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleFAQ = (id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleOpenFeedback = () => {
        Linking.openURL(FEEDBACK_URL);
    };

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
                <Text style={s.headerTitle}>Trợ giúp & Góp ý</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* ── Content ── */}
            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ═══ FAQ Section ═══ */}
                <View style={s.sectionHeader}>
                    <MaterialCommunityIcons name="frequently-asked-questions" size={22} color="#2563eb" />
                    <Text style={s.sectionTitle}>Câu hỏi thường gặp</Text>
                </View>

                <View style={s.faqList}>
                    {FAQ_DATA.map((item, index) => {
                        const isExpanded = expandedIds.has(item.id);
                        const isLast = index === FAQ_DATA.length - 1;
                        return (
                            <View key={item.id} style={[s.faqCard, !isLast && s.faqCardBorder]}>
                                <TouchableOpacity
                                    style={s.faqQuestion}
                                    onPress={() => toggleFAQ(item.id)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={s.faqQuestionText}>{item.question}</Text>
                                    <View style={[s.faqChevron, isExpanded && s.faqChevronActive]}>
                                        <Ionicons
                                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                            size={16}
                                            color={isExpanded ? '#2563eb' : '#9ca3af'}
                                        />
                                    </View>
                                </TouchableOpacity>
                                {isExpanded && (
                                    <View style={s.faqAnswer}>
                                        <Text style={s.faqAnswerText}>{item.answer}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* ═══ Feedback CTA ═══ */}
                <View style={s.feedbackCard}>
                    <View style={s.feedbackIconRow}>
                        <View style={s.feedbackIconCircle}>
                            <MaterialCommunityIcons name="message-text-outline" size={28} color="#2563eb" />
                        </View>
                    </View>
                    <Text style={s.feedbackTitle}>Góp ý & Báo lỗi</Text>
                    <Text style={s.feedbackBody}>
                        Bạn gặp vấn đề hoặc có ý tưởng mới?{'\n'}
                        Hãy cho chúng tôi biết để cải thiện ứng dụng nhé!
                    </Text>
                    <TouchableOpacity
                        style={s.feedbackBtn}
                        onPress={handleOpenFeedback}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={s.feedbackBtnText}>Gửi Góp ý / Báo lỗi</Text>
                    </TouchableOpacity>

                    <Text style={s.feedbackNote}>
                        Phiên bản Beta — Mọi phản hồi đều quý giá
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

// ─── Styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },

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
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17, fontWeight: '700', color: '#111827',
    },

    // Scroll
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

    // Section header
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18, fontWeight: '800', color: '#111827',
    },

    // FAQ
    faqList: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#f3f4f6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    faqCard: {
        paddingHorizontal: 16,
    },
    faqCardBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    faqQuestion: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        gap: 12,
    },
    faqQuestionText: {
        flex: 1,
        fontSize: 15, fontWeight: '600', color: '#1f2937',
        lineHeight: 22,
    },
    faqChevron: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center',
    },
    faqChevronActive: {
        backgroundColor: '#eff6ff',
    },
    faqAnswer: {
        paddingBottom: 16,
        paddingRight: 40,
    },
    faqAnswerText: {
        fontSize: 14, color: '#6b7280',
        lineHeight: 22,
    },

    // Feedback CTA
    feedbackCard: {
        marginTop: 32,
        backgroundColor: '#eff6ff',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    feedbackIconRow: {
        marginBottom: 12,
    },
    feedbackIconCircle: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: '#dbeafe',
        alignItems: 'center', justifyContent: 'center',
    },
    feedbackTitle: {
        fontSize: 18, fontWeight: '800', color: '#1e40af',
        marginBottom: 8,
    },
    feedbackBody: {
        fontSize: 14, color: '#3b82f6',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    feedbackBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563eb',
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 14,
        width: '100%',
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    feedbackBtnText: {
        fontSize: 16, fontWeight: '700', color: '#fff',
    },
    feedbackNote: {
        fontSize: 12, color: '#93c5fd',
        fontWeight: '500',
        marginTop: 14,
    },
});
