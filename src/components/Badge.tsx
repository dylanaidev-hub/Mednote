import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

// ─── Variant Color Map ───────────────────────────────────────────
const VARIANTS = {
    info:    { bg: '#EFF6FF', text: '#2563EB' },   // blue
    success: { bg: '#DCFCE7', text: '#16A34A' },   // green
    warning: { bg: '#FEF3C7', text: '#D97706' },   // amber
    danger:  { bg: '#FEE2E2', text: '#DC2626' },   // red
    default: { bg: '#F3F4F6', text: '#6B7280' },   // gray
    purple:  { bg: '#F3E8FF', text: '#9333EA' },   // purple
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

interface BadgeProps {
    label: string;
    variant?: BadgeVariant;
    icon?: ReactNode;
    style?: ViewStyle;
}

export default function Badge({ label, variant = 'default', icon, style }: BadgeProps) {
    const colors = VARIANTS[variant];

    return (
        <View style={[styles.container, { backgroundColor: colors.bg }, style]}>
            {icon && <View style={styles.iconWrap}>{icon}</View>}
            <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    iconWrap: {
        marginRight: 4,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
    },
});
