import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

/**
 * Battery Optimization Bypass for Android.
 * Opens the system dialog asking user to "Ignore Battery Optimizations"
 * so that scheduled notifications survive background/killed states.
 */
export const BatteryOptimization = {
    /**
     * Open the system battery optimization settings for this app.
     * On Android: Opens "Ignore Battery Optimizations" dialog.
     * On iOS: No-op (iOS doesn't have this restriction).
     */
    async requestIgnore(): Promise<void> {
        if (Platform.OS !== 'android') return;

        try {
            // Try opening the direct "Ignore Battery Optimization" intent
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                {
                    data: 'package:com.anonymous.MedNote',
                }
            );
        } catch (e) {
            console.warn('MedNote: Direct battery intent failed, opening general settings', e);
            // Fallback: open general battery optimization settings
            try {
                await IntentLauncher.startActivityAsync(
                    IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                );
            } catch (e2) {
                console.warn('MedNote: Battery settings fallback failed, opening app settings', e2);
                // Last fallback: open app settings
                Linking.openSettings();
            }
        }
    },

    /**
     * Check if battery optimization is available on this platform.
     */
    isAvailable(): boolean {
        return Platform.OS === 'android';
    },
};
