import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';

// ─── Design Tokens ──────────────────────────────────────────────
const ACTIVE_BG = '#3B82F6';       // Primary Blue
const ACTIVE_TEXT = '#FFFFFF';
const INACTIVE_BG = '#F3F4F6';     // Gray 100
const INACTIVE_TEXT = '#4B5563';    // Gray 600
const BADGE_INACTIVE_BG = '#E5E7EB'; // Gray 200
const BADGE_ACTIVE_BG = 'rgba(255,255,255,0.2)';

interface FilterChipProps {
    label: string;
    isActive: boolean;
    onPress: () => void;
    /** Badge count to render on the right */
    badgeCount?: number;
    style?: ViewStyle;
}

export default function FilterChip({
    label,
    isActive,
    onPress,
    badgeCount,
    style,
}: FilterChipProps) {
    const textColor = isActive ? ACTIVE_TEXT : INACTIVE_TEXT;

    return (
        <TouchableOpacity
            style={[
                styles.chip,
                isActive ? styles.chipActive : styles.chipInactive,
                style,
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.label, { color: textColor }]}>
                {label}
            </Text>
            {badgeCount !== undefined && (
                <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeInactive]}>
                    <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                        {badgeCount}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 16,
        gap: 6,
    },
    chipInactive: {
        backgroundColor: INACTIVE_BG,
    },
    chipActive: {
        backgroundColor: ACTIVE_BG,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
    },
    badge: {
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 1,
        minWidth: 20,
        alignItems: 'center',
    },
    badgeInactive: {
        backgroundColor: BADGE_INACTIVE_BG,
    },
    badgeActive: {
        backgroundColor: BADGE_ACTIVE_BG,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#6b7280',
    },
    badgeTextActive: {
        color: '#fff',
    },
});
