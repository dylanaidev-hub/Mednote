import React, { useEffect, useRef, useState } from 'react';
import {
    View, Modal, Pressable, Keyboard,
    TouchableWithoutFeedback, StyleSheet,
    Animated, Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const OPEN_DURATION = 300;
const CLOSE_DURATION = 250;

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
 * 1. `hasKeyboard=false` (default): transparent overlay + animated sheet
 *    → Overlay fades in, sheet slides up independently
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
    // Internal state keeps Modal mounted during close animation
    const [modalVisible, setModalVisible] = useState(false);
    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const isAnimating = useRef(false);

    useEffect(() => {
        if (hasKeyboard) return;

        if (visible && !modalVisible) {
            // ── OPEN: show Modal first, then animate in ──
            setModalVisible(true);
        } else if (!visible && modalVisible && !isAnimating.current) {
            // ── CLOSE: animate out, then hide Modal ──
            animateClose();
        }
    }, [visible]);

    // Run open animation after Modal mounts
    useEffect(() => {
        if (modalVisible && visible && !hasKeyboard) {
            requestAnimationFrame(() => {
                Animated.parallel([
                    Animated.timing(overlayOpacity, {
                        toValue: 1,
                        duration: OPEN_DURATION,
                        useNativeDriver: true,
                    }),
                    Animated.spring(sheetTranslateY, {
                        toValue: 0,
                        damping: 20,
                        stiffness: 200,
                        mass: 0.8,
                        useNativeDriver: true,
                    }),
                ]).start();
            });
        }
    }, [modalVisible]);

    const animateClose = () => {
        isAnimating.current = true;
        Animated.parallel([
            Animated.timing(sheetTranslateY, {
                toValue: SCREEN_HEIGHT,
                duration: CLOSE_DURATION,
                useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
                toValue: 0,
                duration: CLOSE_DURATION,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setModalVisible(false);
            isAnimating.current = false;
            // Reset values for next open
            overlayOpacity.setValue(0);
            sheetTranslateY.setValue(SCREEN_HEIGHT);
        });
    };

    const handleBackdropPress = () => {
        Keyboard.dismiss();
        // Animate close, then notify parent
        isAnimating.current = true;
        Animated.parallel([
            Animated.timing(sheetTranslateY, {
                toValue: SCREEN_HEIGHT,
                duration: CLOSE_DURATION,
                useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
                toValue: 0,
                duration: CLOSE_DURATION,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setModalVisible(false);
            isAnimating.current = false;
            overlayOpacity.setValue(0);
            sheetTranslateY.setValue(SCREEN_HEIGHT);
            onClose();
        });
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
    // MODE 2: No Keyboard → Animated overlay + slide-up sheet
    // Overlay fades in, sheet slides up with spring animation
    // ────────────────────────────────────────────────────────
    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            onRequestClose={handleBackdropPress}
        >
            <View style={bs.animatedContainer}>
                {/* Backdrop — fades in */}
                <Animated.View
                    style={[bs.overlay, { opacity: overlayOpacity }]}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
                </Animated.View>

                {/* Sheet — slides up from bottom */}
                <Animated.View
                    style={[
                        bs.sheetWrapper,
                        { maxHeight: maxHeight as any },
                        { transform: [{ translateY: sheetTranslateY }] },
                    ]}
                >
                    <Pressable
                        style={bs.sheet}
                        onPress={() => {}}
                    >
                        {/* Handle bar */}
                        <View style={bs.handle} />
                        {children}
                    </Pressable>
                </Animated.View>
            </View>
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

    // ── Mode 2: Animated overlay + slide-up ──
    animatedContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetWrapper: {
        // positioned at bottom via flex-end parent
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
