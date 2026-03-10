/**
 * ─── Settings Store (Zustand) ────────────────────────────────────
 * App-level settings persisted via AsyncStorage.
 * Replaces the notification/nagging settings from MedContext.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
    notificationsEnabled: boolean;
    naggingMode: boolean;
    isLoaded: boolean;

    // Actions
    loadSettings: () => Promise<void>;
    setNotificationsEnabled: (enabled: boolean) => Promise<void>;
    setNaggingMode: (enabled: boolean) => Promise<void>;
}

const NOTIF_SETTINGS_KEY = '@mednote_notif_enabled';
const NAGGING_MODE_KEY = '@mednote_nagging_mode';

export const useSettingsStore = create<SettingsState>((set) => ({
    notificationsEnabled: true,
    naggingMode: false,
    isLoaded: false,

    loadSettings: async () => {
        try {
            const [notif, nagging] = await Promise.all([
                AsyncStorage.getItem(NOTIF_SETTINGS_KEY),
                AsyncStorage.getItem(NAGGING_MODE_KEY),
            ]);

            set({
                notificationsEnabled: notif !== null ? JSON.parse(notif) : true,
                naggingMode: nagging !== null ? JSON.parse(nagging) : false,
                isLoaded: true,
            });
        } catch (e) {
            console.error('Failed to load settings:', e);
            set({ isLoaded: true });
        }
    },

    setNotificationsEnabled: async (enabled: boolean) => {
        try {
            set({ notificationsEnabled: enabled });
            await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(enabled));
        } catch (e) {
            console.error('Failed to save notification settings:', e);
        }
    },

    setNaggingMode: async (enabled: boolean) => {
        try {
            set({ naggingMode: enabled });
            await AsyncStorage.setItem(NAGGING_MODE_KEY, JSON.stringify(enabled));
        } catch (e) {
            console.error('Failed to save nagging mode:', e);
        }
    },
}));
