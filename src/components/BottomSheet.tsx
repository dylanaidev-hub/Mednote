import React from 'react';
import {
    View, Modal, Pressable, Keyboard,
    TouchableWithoutFeedback, StyleSheet,
} from 'react-native';

interface BottomSheetProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Max height as percentage string, e.g. '85%'. Default: '85%' */
    maxHeight?: string;
    /**
     * If true, the Modal runs in NON-transparent mode (full-screen white).
     * This lets iOS/Android handle keyboard animation on the **native thread**,
     * eliminating the jank caused by <Modal transparent> + <KeyboardAvoidingView>.
     *
     * Use `true` when the sheet contains TextInputs.
     * Use `false` (default) for simple picker/filter sheets without keyboard.
     */
    hasKeyboard?: boolean;
}

/**
 * Reusable Bottom Sheet
 *
 * Two rendering modes:
 * 1. `hasKeyboard=false` (default): transparent overlay + slide-up sheet
 *    → Great for simple pickers, filters (no keyboard)
 * 2. `hasKeyboard=true`: full-screen non-transparent Modal
 *    → Keyboard avoidance runs on native thread, zero jank
 */
export default function BottomSheet({
    visible,
    onClose,
    children,
    maxHeight = '85%',
    hasKeyboard = false,
}: BottomSheetProps) {
    const handleBackdropPress = () => {
        Keyboard.dismiss();
        onClose();
    };

    // ────────────────────────────────────────────────────────
    // MODE 1: Has Keyboard → Full-screen non-transparent Modal
    // Keyboard avoidance handled natively by iOS/Android
    // ────────────────────────────────────────────────────────
    if (hasKeyboard) {
        return (
            <Modal
                visible={visible}
                animationType="slide"
                onRequestClose={onClose}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={bs.fullScreenContainer}>
                        {/* Header handle bar */}
                        <View style={bs.fullScreenHandle}>
                            <View style={bs.handle} />
                        </View>

                        {children}
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        );
    }

    // ────────────────────────────────────────────────────────
    // MODE 2: No Keyboard → Transparent overlay + slide-up
    // ────────────────────────────────────────────────────────
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            {/* Backdrop — tap to close */}
            <Pressable style={bs.overlay} onPress={handleBackdropPress}>
                {/* Sheet content — stops propagation */}
                <Pressable
                    style={[bs.sheet, { maxHeight: maxHeight as any }]}
                    onPress={() => {}}
                >
                    {/* Handle bar */}
                    <View style={bs.handle} />

                    {children}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const bs = StyleSheet.create({
    // ── Mode 1: Full-screen (hasKeyboard) ──
    fullScreenContainer: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    fullScreenHandle: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 4,
        backgroundColor: '#ffffff',
    },

    // ── Mode 2: Overlay (no keyboard) ──
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },

    // ── Shared ──
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
});
