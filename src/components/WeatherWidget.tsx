import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    WeatherData,
    getWeatherAdvice,
    getWeatherIconName,
    getGreeting,
} from '../services/weatherService';

interface WeatherWidgetProps {
    weather: WeatherData | null;
    isLoading: boolean;
    errorMessage?: string;
}

export const WeatherWidget = ({ weather, isLoading, errorMessage }: WeatherWidgetProps) => {
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isLoading) {
            Animated.loop(
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.ease,
                    useNativeDriver: true,
                })
            ).start();
        }
    }, [isLoading, shimmerAnim]);

    // ─── Loading Skeleton ──────────────────
    if (isLoading) {
        const opacity = shimmerAnim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0.3, 0.7, 0.3],
        });
        return (
            <View style={styles.card}>
                <Animated.View style={[styles.skeletonLine, { width: '45%', opacity }]} />
                <Animated.View style={[styles.skeletonLine, { width: '30%', marginTop: 8, opacity }]} />
                <Animated.View style={[styles.skeletonLine, { width: '25%', height: 24, marginTop: 12, opacity }]} />
            </View>
        );
    }

    // ─── Error / No data fallback ──────────
    if (!weather) {
        const greeting = getGreeting();
        return (
            <View style={styles.card}>
                <Text style={styles.dateText}>{greeting}</Text>
                <Text style={styles.conditionText}>
                    {errorMessage || 'Hãy luôn uống thuốc đúng giờ nhé!'}
                </Text>
            </View>
        );
    }

    // ─── Format date ──────────────────────
    const now = new Date();
    const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    const dateStr = `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const iconName = getWeatherIconName(weather.condition);
    const advice = getWeatherAdvice(weather);

    return (
        <View style={styles.card}>
            {/* Main content row */}
            <View style={styles.row}>
                {/* Left: date, location, condition, temp */}
                <View style={styles.leftCol}>
                    <Text style={styles.dateText}>{dateStr}</Text>
                    <Text style={styles.conditionText}>{weather.description}</Text>
                    <Text style={styles.tempText}>{weather.temp}°C</Text>
                </View>

                {/* Right: weather icon */}
                <View style={styles.iconContainer}>
                    <Ionicons
                        name={iconName as any}
                        size={56}
                        color="#f59e0b"
                    />
                    <Text style={styles.locationText}>{weather.cityName}</Text>
                </View>
            </View>

            {/* Advice line */}
            <Text style={styles.adviceText} numberOfLines={2}>{advice}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#f3f4f6',
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 18,
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    leftCol: {
        flex: 1,
        marginRight: 16,
    },
    dateText: {
        fontSize: 12,
        fontWeight: '400',
        color: '#9ca3af',
        marginBottom: 2,
    },
    locationText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#6b7280',
        marginBottom: 4,
    },
    conditionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        textTransform: 'capitalize',
        marginBottom: 8,
    },
    tempText: {
        fontSize: 34,
        fontWeight: '700',
        color: '#111827',
        letterSpacing: -1,
    },
    iconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 4,
    },
    adviceText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#6b7280',
        lineHeight: 17,
        marginTop: 12,
    },
    // Skeleton
    skeletonLine: {
        height: 12,
        borderRadius: 6,
        backgroundColor: '#d1d5db',
    },
});
