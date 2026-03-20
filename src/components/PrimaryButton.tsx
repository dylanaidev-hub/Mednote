import React from 'react';
import {
    TouchableOpacity, Text, StyleSheet, ActivityIndicator,
    ViewStyle, TextStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// ─── Design Tokens ──────────────────────────────────────────────
const SOLID_BG = '#1D4ED8';       // Primary Blue
const SOLID_TEXT = '#FFFFFF';
const OUTLINE_BORDER = '#1D4ED8'; // Primary Blue
const OUTLINE_TEXT = '#1D4ED8';
const DISABLED_BG = '#9ca3af';

type IconFamily = 'Ionicons' | 'MaterialCommunityIcons';

interface PrimaryButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'solid' | 'outline';
    icon?: string;
    iconFamily?: IconFamily;
    iconSize?: number;
    disabled?: boolean;
    loading?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
    /** Override background color (solid variant) */
    bgColor?: string;
    /** Override text/icon color */
    textColor?: string;
    /** Override border color (outline variant) */
    borderColor?: string;
}

export default function PrimaryButton({
    title,
    onPress,
    variant = 'solid',
    icon,
    iconFamily = 'Ionicons',
    iconSize = 20,
    disabled = false,
    loading = false,
    style,
    textStyle,
    bgColor,
    textColor: textColorProp,
    borderColor: borderColorProp,
}: PrimaryButtonProps) {
    const isSolid = variant === 'solid';
    const isDisabled = disabled || loading;

    const containerStyle: ViewStyle[] = [
        styles.base,
        isSolid ? styles.solid : styles.outline,
        isDisabled ? (isSolid ? styles.solidDisabled : styles.outlineDisabled) : {},
        bgColor && isSolid ? { backgroundColor: bgColor } : {},
        bgColor && !isSolid ? { backgroundColor: bgColor } : {},
        borderColorProp && !isSolid ? { borderColor: borderColorProp } : {},
        style || {},
    ] as ViewStyle[];

    const textColor = textColorProp || (isSolid ? SOLID_TEXT : OUTLINE_TEXT);
    const iconColor = textColorProp || (isSolid ? SOLID_TEXT : OUTLINE_TEXT);

    const IconComponent = iconFamily === 'MaterialCommunityIcons'
        ? MaterialCommunityIcons
        : Ionicons;

    return (
        <TouchableOpacity
            style={containerStyle}
            onPress={onPress}
            activeOpacity={0.85}
            disabled={isDisabled}
        >
            {loading ? (
                <ActivityIndicator size="small" color={textColor} />
            ) : (
                <>
                    {icon && (
                        <IconComponent
                            name={icon as any}
                            size={iconSize}
                            color={iconColor}
                            style={{ marginRight: 8 }}
                        />
                    )}
                    <Text style={[styles.text, { color: textColor }, textStyle]}>
                        {title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        height: 48,
        borderRadius: 100,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    solid: {
        backgroundColor: SOLID_BG,
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: OUTLINE_BORDER,
    },
    solidDisabled: {
        backgroundColor: DISABLED_BG,
    },
    outlineDisabled: {
        borderColor: '#d1d5db',
        opacity: 0.6,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
});
