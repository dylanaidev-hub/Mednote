import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, Image, StyleSheet, Animated, Dimensions,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Keep the native splash visible while we load
SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get('window');

interface AnimatedSplashProps {
    /** Set to true once your app (DB, context, etc.) is ready */
    isReady: boolean;
    children: React.ReactNode;
}

export default function AnimatedSplash({ isReady, children }: AnimatedSplashProps) {
    const [showSplash, setShowSplash] = useState(true);

    // Animation values
    const logoScale = useRef(new Animated.Value(0.3)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const textTranslateY = useRef(new Animated.Value(20)).current;
    const splashOpacity = useRef(new Animated.Value(1)).current;

    // Phase 1: Entrance animation (runs immediately)
    useEffect(() => {
        Animated.parallel([
            // Logo: scale from 0.3 → 1.0 with spring
            Animated.spring(logoScale, {
                toValue: 1,
                tension: 60,
                friction: 8,
                useNativeDriver: true,
            }),
            // Logo: fade in
            Animated.timing(logoOpacity, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start(() => {
            // After logo appears, show text
            Animated.parallel([
                Animated.timing(textOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(textTranslateY, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]).start();
        });
    }, []);

    // Phase 2: Exit animation (when app is ready)
    const onReady = useCallback(async () => {
        if (!isReady) return;

        // Hide the native splash first
        await SplashScreen.hideAsync();

        // Wait a brief moment to let the user see the branding
        setTimeout(() => {
            // Logo: scale up slightly + fade out
            Animated.parallel([
                Animated.timing(logoScale, {
                    toValue: 1.15,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(splashOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setShowSplash(false);
            });
        }, 2000); // Let the splash show for ~2s after data is ready
    }, [isReady]);

    useEffect(() => {
        onReady();
    }, [onReady]);

    if (!showSplash) {
        return <>{children}</>;
    }

    return (
        <View style={{ flex: 1 }}>
            {/* Render children underneath (hidden by splash) */}
            {isReady && children}

            {/* Splash overlay */}
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    s.container,
                    { opacity: splashOpacity },
                ]}
                pointerEvents={isReady ? 'none' : 'auto'}
            >
                {/* Logo */}
                <Animated.Image
                    source={require('../../assets/splash-icon.png')}
                    style={[
                        s.logo,
                        {
                            opacity: logoOpacity,
                            transform: [{ scale: logoScale }],
                        },
                    ]}
                    resizeMode="contain"
                />

                {/* App name */}
                <Animated.View
                    style={{
                        opacity: textOpacity,
                        transform: [{ translateY: textTranslateY }],
                    }}
                >
                    <Text style={s.appName}>MedNote</Text>
                    <Text style={s.tagline}>Thêm một lời nhắc, vơi bớt âu lo</Text>
                </Animated.View>

                {/* Version at bottom */}
                <Animated.Text style={[s.version, { opacity: textOpacity }]}>
                    Phiên bản 2.1.0
                </Animated.Text>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 140,
        height: 140,
        marginBottom: 0,
    },
    appName: {
        fontSize: 32,
        fontWeight: '800',
        color: '#1E3A5F',
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    tagline: {
        fontSize: 16,
        fontWeight: '500',
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 6,
    },
    version: {
        position: 'absolute',
        bottom: 50,
        fontSize: 12,
        fontWeight: '500',
        color: '#CBD5E1',
    },
});
