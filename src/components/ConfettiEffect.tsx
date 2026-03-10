import React, { useEffect } from 'react';
import { StyleSheet, Dimensions, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withDelay,
    Easing,
    runOnJS
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const NUM_PARTICLES = 40;
const COLORS = ['#22c55e', '#2563eb', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];

interface ParticleProps {
    index: number;
    onFinished?: () => void;
}

const Particle = ({ index, onFinished }: ParticleProps) => {
    const x = useSharedValue(Math.random() * width);
    const y = useSharedValue(-20);
    const rotation = useSharedValue(0);
    const scale = useSharedValue(Math.random() * 0.5 + 0.5);
    const opacity = useSharedValue(1);
    const color = COLORS[index % COLORS.length];

    useEffect(() => {
        const duration = 2000 + Math.random() * 2000;
        const delay = Math.random() * 1000;

        y.value = withDelay(
            delay,
            withTiming(height + 20, {
                duration,
                easing: Easing.bezier(0.1, 0, 0.5, 1),
            }, (finished) => {
                if (finished && index === NUM_PARTICLES - 1 && onFinished) {
                    runOnJS(onFinished)();
                }
            })
        );

        x.value = withDelay(
            delay,
            withTiming(x.value + (Math.random() - 0.5) * 200, {
                duration,
                easing: Easing.linear,
            })
        );

        rotation.value = withDelay(
            delay,
            withTiming(720 + Math.random() * 720, {
                duration,
                easing: Easing.linear,
            })
        );

        opacity.value = withDelay(
            delay + duration * 0.7,
            withTiming(0, { duration: duration * 0.3 })
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: x.value },
                { translateY: y.value },
                { rotate: `${rotation.value}deg` },
                { scale: scale.value },
            ],
            opacity: opacity.value,
            backgroundColor: color,
        };
    });

    return (
        <Animated.View
            style={[
                styles.particle,
                animatedStyle,
                { width: Math.random() > 0.5 ? 8 : 12, height: 8 }
            ]}
        />
    );
};

export const ConfettiEffect = ({ onFinished }: { onFinished?: () => void }) => {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: NUM_PARTICLES }).map((_, i) => (
                <Particle key={i} index={i} onFinished={onFinished} />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    particle: {
        position: 'absolute',
        borderRadius: 2,
    },
});
