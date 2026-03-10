import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MedicineEntry } from '../types/medicine';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Time Slot Config ────────────────────────────────────────────
interface DoseSlot {
    key: string;
    label: string;
    hour: number;
    minute: number;
}

const DOSE_SLOTS: DoseSlot[] = [
    { key: 'Sáng', label: 'Sáng nay', hour: 7, minute: 0 },
    { key: 'Trưa', label: 'Trưa nay', hour: 12, minute: 0 },
    { key: 'Chiều', label: 'Chiều nay', hour: 18, minute: 0 },
    { key: 'Tối', label: 'Tối nay', hour: 21, minute: 0 },
];

const WINDOW_MINUTES = 30; // ±30 minutes from dose time

// ─── Helpers ─────────────────────────────────────────────────────
function getMinutesSinceMidnight(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function slotToMinutes(slot: DoseSlot): number {
    return slot.hour * 60 + slot.minute;
}

function formatTime(hour: number, minute: number): string {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Find the active dose slot within ±30 min window
function getActiveDoseSlot(medicines: MedicineEntry[]): DoseSlot | null {
    const now = getMinutesSinceMidnight();
    for (const slot of DOSE_SLOTS) {
        const slotMin = slotToMinutes(slot);
        const hasMeds = medicines.some(m => m.frequency?.includes(slot.key));
        if (hasMeds && now >= slotMin - WINDOW_MINUTES && now <= slotMin + WINDOW_MINUTES) {
            return slot;
        }
    }
    return null;
}

// Get medicines for a specific time slot
function getMedicinesForSlot(medicines: MedicineEntry[], slotKey: string): MedicineEntry[] {
    return medicines.filter(m => m.frequency?.includes(slotKey));
}

// Get all unique dose slots for today
function getTotalDoseSlots(medicines: MedicineEntry[]): string[] {
    const allSlots = new Set<string>();
    medicines.forEach(m => {
        m.frequency?.forEach((f: string) => allSlots.add(f));
    });
    return Array.from(allSlots);
}

// ─── Exported: active slot key for Dashboard sync ────────────────
export function useActiveDoseSlot(medicines: MedicineEntry[]): string | null {
    const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);

    useEffect(() => {
        const check = () => {
            const slot = getActiveDoseSlot(medicines);
            setActiveSlotKey(slot?.key ?? null);
        };
        check();
        const interval = setInterval(check, 30_000); // Check every 30s
        return () => clearInterval(interval);
    }, [medicines]);

    return activeSlotKey;
}

// ─── Props ───────────────────────────────────────────────────────
interface NextDoseCardProps {
    medicines: MedicineEntry[];
    confirmedSlots: string[];
    onConfirm: (slotKey: string) => void;
}

export const NextDoseCard = ({ medicines, confirmedSlots, onConfirm }: NextDoseCardProps) => {
    const [activeSlot, setActiveSlot] = useState<DoseSlot | null>(null);
    const [visible, setVisible] = useState(false);
    const [showCheck, setShowCheck] = useState(false);

    // Animations
    const expandAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const checkAnim = useRef(new Animated.Value(0)).current;

    // ─── Time-based trigger: check every 30s ─────────────────
    const checkTimeWindow = useCallback(() => {
        const slot = getActiveDoseSlot(medicines);
        if (slot && !confirmedSlots.includes(slot.key)) {
            setActiveSlot(slot);
            if (!visible) {
                setVisible(true);
            }
        } else {
            if (visible && !showCheck) {
                // Hide with animation
                hideCard();
            }
        }
    }, [medicines, confirmedSlots, visible, showCheck]);

    useEffect(() => {
        checkTimeWindow();
        const interval = setInterval(checkTimeWindow, 30_000);
        return () => clearInterval(interval);
    }, [checkTimeWindow]);

    // ─── Expand animation when visible ───────────────────────
    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(expandAnim, {
                    toValue: 1,
                    tension: 60,
                    friction: 12,
                    useNativeDriver: false,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 350,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: false,
                }),
            ]).start();
        }
    }, [visible, expandAnim, opacityAnim]);

    const hideCard = () => {
        Animated.parallel([
            Animated.timing(expandAnim, {
                toValue: 0,
                duration: 300,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: false,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: false,
            }),
        ]).start(() => {
            setVisible(false);
            setActiveSlot(null);
        });
    };

    // ─── Handle Confirm ──────────────────────────────────────
    const handleConfirm = () => {
        if (!activeSlot) return;

        setShowCheck(true);

        // Checkmark animation
        Animated.timing(checkAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        // After checkmark, collapse and hide
        setTimeout(() => {
            onConfirm(activeSlot.key);

            Animated.parallel([
                Animated.timing(expandAnim, {
                    toValue: 0,
                    duration: 350,
                    easing: Easing.in(Easing.cubic),
                    useNativeDriver: false,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: false,
                }),
            ]).start(() => {
                setVisible(false);
                setShowCheck(false);
                checkAnim.setValue(0);
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            });
        }, 900);
    };

    // ─── Progress Calculation ────────────────────────────────
    const totalSlots = getTotalDoseSlots(medicines);
    const completedCount = confirmedSlots.length;
    const progress = totalSlots.length > 0 ? completedCount / totalSlots.length : 0;
    const allDone = completedCount >= totalSlots.length && totalSlots.length > 0;



    // ─── Hidden state — render nothing ───────────────────────
    if (!visible || !activeSlot) {
        // Show a slim progress bar even when card is hidden (if there are medicines)
        if (medicines.length > 0 && completedCount > 0) {
            return (
                <View style={styles.progressOnly}>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                        Đã hoàn thành {completedCount}/{totalSlots.length} liều hôm nay
                    </Text>
                </View>
            );
        }
        return null;
    }

    // ─── Active Hero Card ────────────────────────────────────
    const doseMeds = getMedicinesForSlot(medicines, activeSlot.key);
    const medsDisplay = doseMeds.length > 0
        ? doseMeds.map(m => `${m.name} (${m.quantity} ${m.unit})`).join(' & ')
        : medicines.slice(0, 2).map(m => `${m.name} (${m.quantity} ${m.unit})`).join(' & ');

    const maxHeight = expandAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 280],
    });

    return (
        <Animated.View style={[styles.cardAnimated, { maxHeight, opacity: opacityAnim }]}>
            <View style={styles.card}>
                {/* Checkmark overlay */}
                {showCheck && (
                    <Animated.View style={[styles.checkOverlay, {
                        opacity: checkAnim,
                        transform: [{
                            scale: checkAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.4, 1],
                            })
                        }],
                    }]}>
                        <Ionicons name="checkmark-circle" size={60} color="#22c55e" />
                        <Text style={styles.checkText}>Đã ghi nhận!</Text>
                    </Animated.View>
                )}

                {/* Header */}
                <Text style={styles.headerLabel}>Liều kế tiếp</Text>

                {/* Time */}
                <Text style={styles.timeText}>
                    {formatTime(activeSlot.hour, activeSlot.minute)} - {activeSlot.label}
                </Text>

                {/* Medicine list */}
                <Text style={styles.medsText} numberOfLines={2}>
                    {medsDisplay}
                </Text>

                {/* CTA Button */}
                <TouchableOpacity
                    style={styles.ctaButton}
                    onPress={handleConfirm}
                    activeOpacity={0.8}
                >
                    <Ionicons name="checkmark-done" size={18} color="#ffffff" />
                    <Text style={styles.ctaText}>Xác nhận đã uống</Text>
                </TouchableOpacity>

                {/* Progress bar */}
                <View style={styles.progressSection}>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                        Bạn đã hoàn thành {completedCount}/{totalSlots.length} liều hôm nay. Cố lên!
                    </Text>
                </View>
            </View>
        </Animated.View>
    );
};

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
    cardAnimated: {
        overflow: 'hidden',
        marginBottom: 16,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        position: 'relative',
        overflow: 'hidden',
    },
    headerLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
    },
    timeText: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1f2937',
        marginBottom: 6,
    },
    medsText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#6b7280',
        lineHeight: 20,
        marginBottom: 16,
    },
    ctaButton: {
        backgroundColor: '#2563eb',
        borderRadius: 14,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    ctaText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    // Progress
    progressSection: {
        marginTop: 16,
    },
    progressOnly: {
        marginBottom: 16,
    },
    progressBarBg: {
        height: 6,
        backgroundColor: '#f3f4f6',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: 6,
        backgroundColor: '#2563eb',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#9ca3af',
        marginTop: 6,
    },
    // Check overlay
    checkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        borderRadius: 20,
    },
    checkText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#22c55e',
        marginTop: 8,
    },

});
