import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../context/ToastContext';
import { NotificationService } from '../services/notificationService';
import { formatLocalDate } from '../utils/dateUtils';

export const useNotificationResponse = () => {
    const { showToast } = useToast();

    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
            const { actionIdentifier, notification } = response;
            const data = notification.request.content.data;

            if (actionIdentifier === 'TAKE_ACTION') {
                await handleTakeAction(data);
            } else if (actionIdentifier === 'SNOOZE_ACTION') {
                await handleSnoozeAction(data);
            }
        });

        return () => subscription.remove();
    }, [showToast]);

    const handleTakeAction = async (data: any) => {
        if (!data || !data.time || !data.medIds) return;

        try {
            const CONFIRMED_MEDS_KEY = '@mednote_confirmed_meds_today';
            const stored = await AsyncStorage.getItem(CONFIRMED_MEDS_KEY);
            const todayStr = new Date().toDateString();
            let progress = { date: todayStr, slots: {} as Record<string, string[]> };

            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.date === todayStr) {
                    progress = parsed;
                }
            }

            const slotKey = data.slotKey; // Sáng/Trưa/Chiều/Tối
            const currentConfirmed = progress.slots[slotKey] || [];
            const newConfirmed = Array.from(new Set([...currentConfirmed, ...data.medIds]));

            progress.slots[slotKey] = newConfirmed;
            await AsyncStorage.setItem(CONFIRMED_MEDS_KEY, JSON.stringify(progress));

            // Kill Switch: Cancel any remaining notifications for this slot
            const dateStr = formatLocalDate(new Date());
            await NotificationService.cancelSpecificSlot(dateStr, slotKey);

            showToast({ message: '✅ Đã xác nhận uống thuốc thành công!' });
        } catch (e) {
            console.error('Failed to update progress from notification', e);
        }
    };

    const handleSnoozeAction = async (data: any) => {
        try {
            const seconds = 10 * 60; // 10 minutes

            await Notifications.scheduleNotificationAsync({
                content: {
                    ...data, // Reuse old content
                    title: '⏳ Nhắc lại: Đến giờ uống thuốc',
                    // Specify channelId for Android compatibility
                    ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds,
                    channelId: Platform.OS === 'android' ? 'default' : undefined,
                } as any,
            });

            showToast({ message: '⏳ Sẽ nhắc lại sau 10 phút' });
        } catch (e) {
            console.error('Failed to snooze notification', e);
        }
    };
};
