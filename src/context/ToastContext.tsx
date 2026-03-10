import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, Easing, Platform } from 'react-native';

interface ToastData {
    message: string;
    actionText?: string;
    onAction?: () => void;
    duration?: number;
    id: number;
}

interface ToastContextType {
    toast: ToastData | null;
    showToast: (data: Omit<ToastData, 'id'>) => void;
    hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// ─── Toast Provider ────────────────────────────────────────────────
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toast, setToast] = useState<ToastData | null>(null);
    const toastIdCounter = useRef(0);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const hideToast = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        setToast(null);
    }, []);

    const showToast = useCallback((data: Omit<ToastData, 'id'>) => {
        const id = ++toastIdCounter.current;
        const duration = data.duration || 3000;

        const displayNewToast = () => {
            setToast({ ...data, id });

            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = setTimeout(() => {
                setToast(current => {
                    // Only hide if the currently showing toast is still this one
                    if (current?.id === id) {
                        return null;
                    }
                    return current;
                });
            }, duration);
        };

        setToast(current => {
            if (current) {
                // If there is already a toast, clear it first, wait for exit animation (150ms), then show new
                setTimeout(displayNewToast, 150);
                return null;
            } else {
                displayNewToast();
                return current;
            }
        });
    }, []);

    const contextValue = useMemo(() => ({
        toast,
        showToast,
        hideToast
    }), [toast, showToast, hideToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
        </ToastContext.Provider>
    );
};

// ─── Global Toast UI Component ───────────────────────────────────
export const GlobalToast = ({ bottomOffset }: { bottomOffset: number }) => {
    const { toast, hideToast } = useToast();
    const translateY = useRef(new Animated.Value(200)).current; // Start hidden below screen

    useEffect(() => {
        if (toast) {
            // Slide up
            Animated.timing(translateY, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.back(1.5)), // Overshoot slightly
                useNativeDriver: true,
            }).start();
        } else {
            // Slide down
            Animated.timing(translateY, {
                toValue: 200,
                duration: 250,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true,
            }).start();
        }
    }, [toast, translateY]);

    return (
        <Animated.View
            style={[
                styles.container,
                { bottom: bottomOffset, transform: [{ translateY }] },
            ]}
            pointerEvents={toast ? 'box-none' : 'none'}
        >
            <View style={styles.toastContent}>
                <Text style={styles.toastText} numberOfLines={2}>
                    {toast?.message || ''}
                </Text>
                {toast?.actionText && toast?.onAction && (
                    <TouchableOpacity
                        style={styles.toastUndoBtn}
                        onPress={() => {
                            toast.onAction!();
                            hideToast(); // Hide immediately after action
                        }}
                    >
                        <Text style={styles.toastUndoText}>{toast.actionText}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
};

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        alignItems: 'center',
        zIndex: 9999, // Đảm bảo luôn nằm trên Bottom Bar và FAB
    },
    toastContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1f2937', // Dark gray
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 100, // Pill shape
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
        maxWidth: 400,
        minWidth: 250,
    },
    toastText: {
        flex: 1,
        color: '#f9fafb',
        fontSize: 14,
        fontWeight: '500',
    },
    toastUndoBtn: {
        marginLeft: 16,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    toastUndoText: {
        color: '#fbbf24', // Amber
        fontSize: 14,
        fontWeight: '700',
    },
});
