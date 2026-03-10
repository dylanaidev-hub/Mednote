import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, LayoutAnimation, TouchableOpacity, Animated, AppState } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { WeatherWidget } from '../components/WeatherWidget';
import {
    DoseSessionCard,
    groupIntoDoseSessions,
    getActiveSessionKey,
} from '../components/DoseSessionCard';
import { useMedContext } from '../context/MedContext';
import { useToast } from '../context/ToastContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useMidnightRefresh } from '../hooks/useMidnightRefresh';
import {
    fetchWeather,
    getStorageWarning,
    WeatherData,
} from '../services/weatherService';
import { NotificationService } from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatLocalDate } from '../utils/dateUtils';
import { ConfettiEffect } from '../components/ConfettiEffect';

export default function Dashboard() {
    const { medicines, records, medicationLogs, updateMedicationLog, confirmedMedsToday, updateConfirmedMed, clearConfirmedMeds } = useMedContext();
    const navigation = useNavigation<any>();

    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [weatherLoading, setWeatherLoading] = useState(true);
    const [weatherError, setWeatherError] = useState<string | undefined>();
    const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
    const { showToast } = useToast();

    // Celebration states
    const [showConfetti, setShowConfetti] = useState(false);
    const [isLargeBannerVisible, setIsLargeBannerVisible] = useState(false);
    const bannerAnim = useRef(new Animated.Value(0)).current;
    const isFirstRender = useRef(true);
    const wasAlreadyDone = useRef(false);

    // ─── Group medicines into dose sessions ──────────────────
    const doseSessions = useMemo(() => groupIntoDoseSessions(medicines), [medicines]);

    // ─── Midnight Auto-Refresh logic ─────────────────────────
    // Called any time we detect the calendar date has changed.
    const handleNewDay = useCallback(async () => {
        // 1. Wipe yesterday's confirmed meds
        await clearConfirmedMeds();

        // 2. Refresh active session highlight
        const key = getActiveSessionKey(doseSessions);
        setActiveSlotKey(key);

        // 3. Brief toast so the user notices the auto-refresh
        showToast({ message: '🌅 Đã sang ngày mới — lịch thuốc đã được làm mới!' });
    }, [doseSessions, showToast, clearConfirmedMeds]);

    // Strategy 1 + 2: AppState listener & midnight setTimeout
    const { checkAndRefresh } = useMidnightRefresh({ onNewDay: handleNewDay });

    // Strategy 3: useFocusEffect — runs every time the tab gains focus
    useFocusEffect(
        useCallback(() => {
            checkAndRefresh();
        }, [checkAndRefresh])
    );

    // ─── Update Active Session based on completion logic ──────
    useEffect(() => {
        const key = getActiveSessionKey(doseSessions, confirmedMedsToday);
        setActiveSlotKey(key);
    }, [doseSessions, confirmedMedsToday]);

    // ─── Fetch Weather on Mount ──────────────────────────────
    useEffect(() => {
        loadWeather();
    }, []);

    const loadWeather = async () => {
        const HANOI_LAT = 21.0285;
        const HANOI_LON = 105.8542;
        try {
            setWeatherLoading(true);
            setWeatherError(undefined);
            const data = await fetchWeather(HANOI_LAT, HANOI_LON);
            if (data) {
                if (!data.cityName || data.cityName === 'Vị trí hiện tại') {
                    data.cityName = 'Hà Nội';
                }
                setWeather(data);
            } else {
                setWeatherError('Không thể tải dữ liệu thời tiết.');
            }
        } catch (error) {
            console.error('Weather loading error:', error);
            setWeatherError('Không thể tải dữ liệu thời tiết.');
        } finally {
            setWeatherLoading(false);
        }
    };

    const handleConfirmItems = useCallback((slotKey: string, selectedIds: string[]) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        // Track the current confirmed count for the session toast logic
        const currentConfirmedInSession = confirmedMedsToday[slotKey] || [];
        const session = doseSessions.find(s => s.slotKey === slotKey);

        updateConfirmedMed(slotKey, selectedIds);

        // Check completion for toast
        if (session && currentConfirmedInSession.length < session.medicines.length && (currentConfirmedInSession.length + selectedIds.length) >= session.medicines.length) {
            showToast({
                message: `Đã xác nhận ${session.label}`,
                actionText: 'Hoàn tác',
                onAction: () => {
                    updateConfirmedMed(slotKey, selectedIds, true);
                }
            });
        }

        // Handle notification cancellation for early intake
        const dateStr = formatLocalDate(new Date());
        NotificationService.cancelSpecificSlot(dateStr, slotKey);
    }, [doseSessions, showToast, confirmedMedsToday, updateConfirmedMed]);

    // ─── Handle Undo Medicine ─────────────────────────────
    // ─── Session Date State ─────────────────────────────────
    // All sessions on today's date are always 'today' so users
    // can confirm medications at any time during the day.
    // "Missed" status only applies to previous days (Schedule screen).
    const getSessionDateState = useCallback((_session: typeof doseSessions[0]): 'today' | 'past' => {
        return 'today';
    }, []);

    // ─── Handle Retroactive Confirm removed per user request ──────────────

    const handleUndoMedicine = useCallback((slotKey: string, medId?: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (medId) {
            const session = doseSessions.find(s => s.slotKey === slotKey);
            const medName = session?.medicines.find(m => m.id === medId)?.name;

            updateConfirmedMed(slotKey, [medId], true);
            if (medName) {
                showToast({ message: `Đã bỏ xác nhận uống thuốc ${medName}` });
            }
        } else {
            updateConfirmedMed(slotKey, [], true); // Clear whole slot if medId is undefined

        }
    }, [showToast, updateConfirmedMed]);

    // ─── Sync with MedContext Medication Logs ────────────────
    useEffect(() => {
        const todayStr = formatLocalDate(new Date());

        records.forEach(prescription => {
            // Find all medicines belonging to this prescription in today's sessions
            const pMeds = doseSessions.flatMap(s => s.medicines).filter(m => m.prescriptionId === prescription.id);
            if (pMeds.length === 0) return;

            // Check if all these medicines are confirmed in confirmedMedsToday
            const allConfirmed = pMeds.every(m => {
                const session = doseSessions.find(s => s.medicines.some(sm => sm.id === m.id));
                return session && (confirmedMedsToday[session.slotKey] || []).includes(m.id);
            });

            const anyMissed = pMeds.some(m => {
                const session = doseSessions.find(s => s.medicines.some(sm => sm.id === m.id));
                if (!session) return false;
                const dateState = getSessionDateState(session);
                const isConfirmed = (confirmedMedsToday[session.slotKey] || []).includes(m.id);
                return dateState === 'past' && !isConfirmed;
            });

            if (allConfirmed) {
                updateMedicationLog(prescription.id, todayStr, 'taken');
            } else if (anyMissed) {
                updateMedicationLog(prescription.id, todayStr, 'missed');
            } else {
                // Note: MedContext's updateMedicationLog already handles stability check/no-op if status hasn't changed
                updateMedicationLog(prescription.id, todayStr, null);
            }
        });
    }, [confirmedMedsToday, doseSessions, records, updateMedicationLog, getSessionDateState]);

    // ─── Progress ────────────────────────────────────────────
    const totalMedsToday = doseSessions.reduce((acc, curr) => acc + curr.medicines.length, 0);

    const confirmedCount = doseSessions.reduce((acc, session) => {
        const confirmedInThisSession = (confirmedMedsToday[session.slotKey] || []).filter(id =>
            session.medicines.some(m => m.id === id)
        );
        return acc + confirmedInThisSession.length;
    }, 0);

    const progress = totalMedsToday > 0 ? confirmedCount / totalMedsToday : 0;
    const allDone = confirmedCount >= totalMedsToday && totalMedsToday > 0;

    // ─── Celebration Logic ────────────────────────────────
    useEffect(() => {
        if (allDone) {
            if (isFirstRender.current) {
                // Already 100% on app start - do nothing
                wasAlreadyDone.current = true;
            } else if (!wasAlreadyDone.current) {
                // Just reached 100% in this session
                wasAlreadyDone.current = true;
                triggerCelebration();
            }
        } else {
            // If user un-checks something, reset state
            wasAlreadyDone.current = false;
            setIsLargeBannerVisible(false);
            bannerAnim.setValue(0);
        }
        isFirstRender.current = false;
    }, [allDone]);

    const triggerCelebration = () => {
        setIsLargeBannerVisible(true);
        setShowConfetti(true);

        // Scale Up & Fade In
        Animated.spring(bannerAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 7
        }).start();

        // Auto-hide after 3 seconds
        setTimeout(() => {
            Animated.timing(bannerAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start(() => {
                setIsLargeBannerVisible(false);
            });
        }, 3000);
    };

    // ─── Auto-hide toast-like behavior for All Done (optional) ───
    // We'll keep the banner persistent in the list instead of a timed popup
    // so it feels more stable as requested by the user.

    // ─── Storage Warning ─────────────────────────────────────
    const storageWarning = weather ? getStorageWarning(weather.temp) : null;

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Weather Widget */}
                <WeatherWidget
                    weather={weather}
                    isLoading={weatherLoading}
                    errorMessage={weatherError}
                />

                {/* Storage Warning Banner */}
                {storageWarning && (
                    <View style={styles.warningBanner}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#d97706" />
                        <Text style={styles.warningText}>{storageWarning}</Text>
                    </View>
                )}

                {/* Daily Progress Header */}
                {medicines.length > 0 && (
                    <View style={styles.progressHeader}>
                        <Text style={styles.sectionTitle}>Hôm nay</Text>
                        <Text style={styles.progressLabel}>
                            {confirmedCount}/{totalMedsToday} thuốc
                        </Text>
                    </View>
                )}

                {/* Progress bar */}
                {medicines.length > 0 && (
                    <View style={styles.progressBarContainer}>
                        <View style={styles.progressBarBg}>
                            <View style={[
                                styles.progressBarFill,
                                {
                                    width: `${Math.round(progress * 100)}%`,
                                    backgroundColor: allDone ? '#22c55e' : '#2563eb',
                                },
                            ]} />
                        </View>
                    </View>
                )}

                {/* Dose Session Cards and Success State */}
                {medicines.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="pill-off" size={40} color="#d1d5db" />
                        <Text style={styles.emptyText}>Chưa có thuốc cần uống hôm nay</Text>
                        <Text style={styles.emptySubtext}>
                            Thêm đơn thuốc để nhận nhắc nhở theo cữ
                        </Text>
                    </View>
                ) : (
                    <>
                        {isLargeBannerVisible && (
                            <Animated.View style={[
                                styles.allDoneHeader,
                                {
                                    opacity: bannerAnim,
                                    transform: [{
                                        scale: bannerAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.8, 1]
                                        })
                                    }]
                                }
                            ]}>
                                <View style={styles.successIconCircle}>
                                    <MaterialCommunityIcons name="check-decagram" size={32} color="#22c55e" />
                                </View>
                                <View style={styles.successTextWrap}>
                                    <Text style={styles.successTitle}>Tuyệt vời!</Text>
                                    <Text style={styles.successSub}>Bạn đã hoàn thành lịch uống thuốc hôm nay!</Text>
                                </View>
                            </Animated.View>
                        )}

                        {doseSessions.map(session => {
                            const dateState = getSessionDateState(session);
                            return (
                                <DoseSessionCard
                                    key={session.slotKey}
                                    session={session}
                                    isActive={activeSlotKey === session.slotKey}
                                    confirmedIds={confirmedMedsToday[session.slotKey] || []}
                                    onConfirmItems={handleConfirmItems}
                                    onUndoItem={handleUndoMedicine}
                                    dateState={dateState}
                                />
                            );
                        })}
                    </>
                )}

            </ScrollView>
            {showConfetti && (
                <ConfettiEffect onFinished={() => setShowConfetti(false)} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 16,
        paddingBottom: 100,
    },
    // Progress header
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
    },
    progressLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    allDoneBadge: {
        backgroundColor: '#d1fae5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    allDoneText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#065f46',
    },
    progressBarContainer: {
        marginBottom: 16,
    },
    progressBarBg: {
        height: 5,
        backgroundColor: '#e5e7eb',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: 5,
        borderRadius: 3,
    },
    // Warning
    warningBanner: {
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fde68a',
        borderRadius: 12,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    warningText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
        color: '#92400e',
        lineHeight: 18,
    },
    // Empty state
    emptyState: {
        backgroundColor: '#ffffff',
        padding: 32,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#f3f4f6',
    },
    emptyText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6b7280',
        marginTop: 10,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9ca3af',
        textAlign: 'center',
        marginTop: 4,
    },
    allDoneHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0fdf4',
        padding: 16,
        borderRadius: 20,
        marginBottom: 20,
        borderWidth: 1.5,
        borderColor: '#bbf7d0',
    },
    successIconCircle: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#dcfce7',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    successTextWrap: {
        flex: 1,
    },
    successTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#166534',
    },
    successSub: {
        fontSize: 14,
        color: '#15803d',
        marginTop: 2,
    },
});
