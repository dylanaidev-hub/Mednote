import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface FloatingFABProps {
    onPress: () => void;
}

export const FloatingFAB = ({ onPress }: FloatingFABProps) => {
    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
    };

    return (
        <View style={styles.container} pointerEvents="box-none">
            <TouchableOpacity
                style={styles.fabMain}
                onPress={handlePress}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={36} color="white" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 30, // Positioned slightly above the tab bar
        left: 0,
        right: 0,
        flexDirection: 'row', // Horizontal container
        justifyContent: 'center', // Center the FAB horizontally
        alignItems: 'center',
        zIndex: 1000,
        elevation: 10,
    },
    fabMain: {
        width: 65,
        height: 65,
        borderRadius: 33,
        backgroundColor: '#f97316', // Vibrant orange
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 12,
    },
});
