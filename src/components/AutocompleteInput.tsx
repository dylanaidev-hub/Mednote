import React, { useState, useMemo, useRef } from 'react';
import {
    View, Text, TextInput, ScrollView, TouchableOpacity,
    StyleSheet, Platform, TextInputProps, ViewStyle, Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COMMON_MEDICINES } from '../constants/medicines';

interface AutocompleteInputProps extends Omit<TextInputProps, 'onChangeText'> {
    value: string;
    onChangeText: (text: string) => void;
    onSelect?: (item: string) => void;
    icon?: React.ReactNode;
    containerStyle?: ViewStyle;
    error?: boolean;
    errorStyle?: ViewStyle;
}

export default function AutocompleteInput({
    value,
    onChangeText,
    onSelect,
    icon,
    containerStyle,
    error,
    errorStyle,
    ...inputProps
}: AutocompleteInputProps) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const filtered = useMemo(() => {
        if (!value || value.trim().length < 2) return [];
        const q = value.toLowerCase();
        return COMMON_MEDICINES.filter(m => m.toLowerCase().includes(q)).slice(0, 10);
    }, [value]);

    const handleChangeText = (text: string) => {
        onChangeText(text);
        setShowSuggestions(text.trim().length >= 2);
    };

    const handleSelect = (item: string) => {
        onChangeText(item);
        onSelect?.(item);
        setShowSuggestions(false);
        Keyboard.dismiss();
    };

    const handleBlur = () => {
        // Delay to allow tap on suggestion item
        setTimeout(() => setShowSuggestions(false), 200);
    };

    const handleFocus = () => {
        if (value.trim().length >= 2) {
            setShowSuggestions(true);
        }
    };

    return (
        <View style={[styles.container, containerStyle]}>
            {/* Input row */}
            <View style={[styles.inputWrap, error && errorStyle]}>
                {icon}
                <TextInput
                    ref={inputRef}
                    style={[styles.inputText, value.length > 0 && { paddingRight: 4 }]}
                    value={value}
                    onChangeText={handleChangeText}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                    {...inputProps}
                />
                {value.length > 0 && (
                    <TouchableOpacity
                        onPress={() => { onChangeText(''); setShowSuggestions(false); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Dropdown suggestions */}
            {showSuggestions && filtered.length > 0 && (
                <View style={styles.dropdown}>
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {filtered.map((item) => (
                            <TouchableOpacity
                                key={item}
                                style={styles.suggestionItem}
                                onPress={() => handleSelect(item)}
                                activeOpacity={0.6}
                            >
                                <MaterialCommunityIcons name="pill" size={16} color="#6b7280" style={{ marginRight: 10 }} />
                                <Text style={styles.suggestionText} numberOfLines={1}>{item}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        zIndex: 10,
        marginBottom: 16, // SP.md — same gap as other inputs
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        paddingHorizontal: 14,
    },
    inputText: {
        flex: 1,
        fontSize: 15,
        color: '#1f2937',
        paddingVertical: 13,
    },
    dropdown: {
        position: 'absolute',
        top: 56,
        left: 0,
        right: 0,
        maxHeight: 220,
        backgroundColor: '#ffffff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            },
        }),
        zIndex: 100,
        overflow: 'hidden',
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    suggestionText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
});
