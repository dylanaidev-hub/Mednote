import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, LayoutAnimation, TouchableOpacity, Animated, AppState, Alert } from 'react-native';
import * as Location from 'expo-location';
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
    const { medicines, records, medicationLogs, updateMedicationLog, confirmedMedsToday, completedAtMap, updateConfirmedMed, clearConfirmedMeds, todayDoseLogKeys } = useMedContext();
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

    // ─── Filter medicines by dose_logs (SSoT) ────────────────
    // Only show sessions that have actual dose_log entries for today.
    // This prevents past-time sessions from appearing on Day-1.
    const filteredMedicines = useMemo(() => {
        // null = still loading from DB → show medicines to avoid empty flash
        if (todayDoseLogKeys === null) return medicines;
        // empty Set = loaded, no dose_logs for today → return empty (correct!)

        return medicines.map(med => {
            const sessionTimes = med.sessionTimes || {};
            const filteredSessionTimes: Record<string, string> = {};
            const filteredFrequency: string[] = [];

            Object.keys(sessionTimes).forEach(key => {
                // normalizeSlotKey: "sáng_sub_123" → "sáng"
                const base = key.split('_sub_')[0].toLowerCase();
                const doseLogKey = `${med.id}_${base}`;

                if (todayDoseLogKeys.has(doseLogKey)) {
                    filteredSessionTimes[key] = sessionTimes[key];
                    filteredFrequency.push(key);
                }
            });

            // If no sessions match dose_logs, exclude this medicine
            if (Object.keys(filteredSessionTimes).length === 0) return null;

            return {
                ...med,
                sessionTimes: filteredSessionTimes,
                frequency: filteredFrequency,
            };
        }).filter(Boolean) as typeof medicines;
    }, [medicines, todayDoseLogKeys]);

    // ─── Group medicines into dose sessions ──────────────────
    const doseSessions = useMemo(() => groupIntoDoseSessions(filteredMedicines), [filteredMedicines]);

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

            let lat = HANOI_LAT;
            let lon = HANOI_LON;

            // Request permission and get actual location
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                lat = location.coords.latitude;
                lon = location.coords.longitude;
            } else {
                console.log('Location permission denied, defaulting to Hanoi');
            }

            const data = await fetchWeather(lat, lon);
            if (data) {
                // If it couldn't reverse-geocode, default to 'Hà Nội' only if we used Hanoi's coords
                if (!data.cityName || data.cityName === 'Vị trí hiện tại') {
                    if (lat === HANOI_LAT) {
                        data.cityName = 'Hà Nội';
                    }
                }
                setWeather(data);
            } else {
                setWeatherError('Không thể tải dữ liệu thời tiết.');
            }
        } catch (error) {
            console.error('Weather/Location error:', error);
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

    // ─── Legacy Sync removed ──────────────────────────────────
    // The previous useEffect here was syncing confirmedMedsToday with
    // updateMedicationLog. This was destructive: when not all items were
    // confirmed, it called updateMedicationLog(null) which DELETED dose_logs.
    // Dose tracking is now handled entirely through confirm/undo flow.

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
                {filteredMedicines.length > 0 && (() => {
                    const left = totalMedsToday - confirmedCount;
                    const badgeStyle = allDone
                        ? { bg: '#DCFCE7', text: '#15803D' }
                        : confirmedCount > 0
                            ? { bg: '#DBEAFE', text: '#1D4ED8' }
                            : { bg: '#F3F4F6', text: '#4B5563' };
                    const badgeText = allDone
                        ? '✓ Hoàn thành'
                        : confirmedCount > 0
                            ? `Còn ${left} liều`
                            : `0/${totalMedsToday} thuốc`;

                    return (
                        <View style={styles.progressHeader}>
                            <Text style={styles.sectionTitle}>Hôm nay</Text>
                            <View style={{
                                backgroundColor: badgeStyle.bg,
                                borderRadius: 16,
                                paddingHorizontal: 12,
                                paddingVertical: 5,
                            }}>
                                <Text style={{
                                    fontSize: 13,
                                    fontWeight: '700',
                                    color: badgeStyle.text,
                                }}>{badgeText}</Text>
                            </View>
                        </View>
                    );
                })()}


                {/* Dose Session Cards and Success State */}
                {filteredMedicines.length === 0 ? (
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
                                    completedAtMap={completedAtMap}
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
