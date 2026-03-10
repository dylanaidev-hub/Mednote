import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Prescription } from '../context/MedContext';
import { MedicineEntry } from '../types/medicine';
import { formatLocalDate } from '../utils/dateUtils';

import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure how notifications should be handled when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        // LAST LINE OF DEFENSE: If med is already confirmed, suppress the notification
        const data = notification.request.content.data as any;
        if (data?.type === 'MED_REMINDER' && data?.slotKey) {
            try {
                const rawConfirmed = await AsyncStorage.getItem('@mednote_confirmed_meds_today');
                if (rawConfirmed) {
                    const parsed = JSON.parse(rawConfirmed);
                    const today = new Date().toDateString();
                    if (parsed.date === today && parsed.slots) {
                        const confirmedIds: string[] = parsed.slots[data.slotKey as string] || [];
                        const medIds: string[] = (data.medIds as string[]) || [];
                        // If ALL meds in this notification are confirmed, suppress it
                        if (medIds.length > 0 && medIds.every((id: string) => confirmedIds.includes(id))) {
                            console.log('MedNote: Suppressed foreground notification — meds already confirmed');
                            return {
                                shouldShowAlert: false,
                                shouldPlaySound: false,
                                shouldSetBadge: false,
                                shouldShowBanner: false,
                                shouldShowList: false,
                            };
                        }
                    }
                }
            } catch (e) {
                // On error, show the notification as fallback
            }
        }

        return {
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        };
    },
});

const NOTIFICATION_CATEGORY_ID = 'medication-reminder';

// Normalize slot key to capitalized form
function normalizeSlotKey(key: string): string {
    const map: Record<string, string> = {
        'sáng': 'Sáng', 'Sáng': 'Sáng',
        'trưa': 'Trưa', 'Trưa': 'Trưa',
        'chiều': 'Chiều', 'Chiều': 'Chiều',
        'tối': 'Tối', 'Tối': 'Tối',
    };
    return map[key] || key;
}

export const NotificationService = {
    /**
     * Request permissions and configure categories
     */
    async init() {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            return false;
        }

        // Create a default notification channel for Android
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Mặc định',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        // Set up notification categories for action buttons
        await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_ID, [
            {
                identifier: 'TAKE_ACTION',
                buttonTitle: '✅ Đã uống',
                options: {
                    opensAppToForeground: false,
                },
            },
            {
                identifier: 'SNOOZE_ACTION',
                buttonTitle: '⏳ Nhắc lại sau 10p',
                options: {
                    opensAppToForeground: false,
                },
            },
        ]);

        return true;
    },

    /**
     * Cancel all scheduled notifications
     */
    async cancelAll() {
        await Notifications.cancelAllScheduledNotificationsAsync();
    },

    /**
     * Schedule notifications for all active and future medicines
     */
    async scheduleAll(
        records: Prescription[],
        enabled: boolean,
        naggingMode: boolean = false,
        medicationLogs: Record<string, Record<string, 'taken' | 'missed'>> = {},
        confirmedMedsToday: Record<string, string[]> = {}
    ) {
        try {
            console.log("MedNote: Starting notification scheduling...");
            await this.cancelAll();

            if (!enabled || records.length === 0) {
                console.log("MedNote: Notifications disabled or no prescriptions. Cleared all.");
                return;
            }

            // ─── BULLETPROOF: Read directly from AsyncStorage ─────────
            // React state might be stale during boot. Read the source of truth.
            let storageLogs: Record<string, Record<string, 'taken' | 'missed'>> = {};
            let storageConfirmed: Record<string, string[]> = {};

            try {
                const [rawLogs, rawConfirmed] = await Promise.all([
                    AsyncStorage.getItem('@mednote_medication_logs'),
                    AsyncStorage.getItem('@mednote_confirmed_meds_today'),
                ]);

                if (rawLogs) {
                    storageLogs = JSON.parse(rawLogs);
                }

                if (rawConfirmed) {
                    const parsed = JSON.parse(rawConfirmed);
                    const today = new Date().toDateString();
                    if (parsed.date === today) {
                        storageConfirmed = parsed.slots;
                    }
                }
            } catch (e) {
                console.warn("MedNote: Could not read storage for filtering, using state fallback", e);
            }

            // Merge: use the UNION of React state and Storage data for max safety
            const finalLogs = { ...medicationLogs };
            for (const [pId, dates] of Object.entries(storageLogs)) {
                if (!finalLogs[pId]) finalLogs[pId] = {};
                for (const [d, s] of Object.entries(dates)) {
                    if (!finalLogs[pId][d]) finalLogs[pId][d] = s;
                }
            }

            const finalConfirmed = { ...confirmedMedsToday };
            for (const [slot, ids] of Object.entries(storageConfirmed)) {
                finalConfirmed[slot] = Array.from(new Set([
                    ...(finalConfirmed[slot] || []),
                    ...ids,
                ]));
            }

            console.log("MedNote: Filtering with logs:", JSON.stringify(Object.keys(finalLogs)),
                "confirmed slots:", JSON.stringify(Object.keys(finalConfirmed)));
            // ───────────────────────────────────────────────────────────

            const now = new Date();
            const daysToSchedule = 3;
            const MIN_DELAY_SECONDS = 120; // Never fire within 2 min — prevents instant spam
            let totalScheduled = 0;

            for (let i = 0; i < daysToSchedule; i++) {
                const targetDate = new Date(now);
                targetDate.setDate(now.getDate() + i);
                const triggerToday = new Date(targetDate);
                const dateStr = formatLocalDate(triggerToday);
                const isToday = i === 0;

                const medsForThisDay: { med: MedicineEntry; time: string; slot: string; prescriptionId: string }[] = [];

                records.forEach(prescription => {
                    const prescriptionStatus = finalLogs[prescription.id]?.[dateStr];
                    if (prescriptionStatus === 'taken') {
                        console.log(`MedNote: Skip prescription ${prescription.id} for ${dateStr} — already taken`);
                        return;
                    }

                    const startDate = new Date(prescription.date);
                    startDate.setHours(0, 0, 0, 0);

                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + prescription.duration - 1);
                    endDate.setHours(23, 59, 59, 999);

                    const currentDay = new Date(targetDate);
                    currentDay.setHours(0, 0, 0, 0);

                    if (currentDay >= startDate && currentDay <= endDate) {
                        prescription.medicines.forEach(med => {
                            Object.entries(med.sessionTimes || {}).forEach(([slot, time]) => {
                                const normalizedSlot = normalizeSlotKey(slot);

                                // Skip if this specific medicine was already confirmed TODAY
                                if (isToday && finalConfirmed[normalizedSlot]?.includes(med.id)) {
                                    console.log(`MedNote: Skip med ${med.name} [${normalizedSlot}] — already confirmed`);
                                    return;
                                }

                                medsForThisDay.push({
                                    med,
                                    time,
                                    slot: normalizedSlot,
                                    prescriptionId: prescription.id
                                });
                            });
                        });
                    }
                });

                // If no meds remaining for this day, skip scheduling entirely
                if (medsForThisDay.length === 0) continue;

                const groupedByTime: Record<string, typeof medsForThisDay> = {};
                medsForThisDay.forEach(item => {
                    if (!groupedByTime[item.time]) groupedByTime[item.time] = [];
                    groupedByTime[item.time].push(item);
                });

                for (const [timeSlot, items] of Object.entries(groupedByTime)) {
                    const [hours, minutes] = timeSlot.split(':').map(Number);
                    const trigger = new Date(targetDate);
                    trigger.setHours(hours, minutes, 0, 0);

                    // For TODAY: if the base session time has already passed,
                    // skip entirely — start from tomorrow for this slot
                    if (isToday && trigger.getTime() <= Date.now()) {
                        console.log(`MedNote: Skip [${items[0].slot}] ${timeSlot} today — session time already passed`);
                        continue;
                    }

                    const medNames = items.map(it => it.med.name).join(', ');
                    const count = items.length;
                    const slotKey = items[0].slot;

                    const timeline = naggingMode
                        ? [
                            { id: 'warmup', offset: -300, title: 'Nước đã rót sẵn chưa? 💧', body: `Chỉ còn 5 phút nữa là đến cữ thuốc [${slotKey}].` },
                            { id: 'cta', offset: 0, title: '💊 Đến giờ uống thuốc rồi!', body: `Bạn có ${count} loại thuốc cần uống lúc ${timeSlot}: ${medNames}` },
                            { id: 'guilt', offset: 300, title: 'Bạn quên mình rồi sao? 🥺', body: `Cữ thuốc lúc ${timeSlot} đang buồn.` },
                            { id: 'urgent', offset: 900, title: 'Báo động sức khỏe! 🚨', body: `Uống thuốc mau!` },
                            { id: 'passive', offset: 1800, title: 'MedNote bỏ cuộc đây... 💔', body: `Mình sẽ ngừng gọi.` }
                        ]
                        : [
                            { id: 'cta', offset: 0, title: '💊 Đến giờ uống thuốc rồi!', body: `Bạn có ${count} loại thuốc cần uống lúc ${timeSlot}: ${medNames}` }
                        ];

                    for (const stage of timeline) {
                        const stageTrigger = new Date(trigger.getTime() + stage.offset * 1000);
                        const seconds = Math.floor((stageTrigger.getTime() - Date.now()) / 1000);

                        // Strict filtering: skip anything in the past OR too close to now
                        if (seconds < MIN_DELAY_SECONDS) {
                            console.log(`MedNote: Skip stage [${stage.id}] — only ${seconds}s away (min: ${MIN_DELAY_SECONDS}s)`);
                            continue;
                        }

                        console.log(`MedNote: Scheduling [${slotKey}/${stage.id}] in ${seconds}s (${Math.round(seconds / 60)}min)`);

                        await Notifications.scheduleNotificationAsync({
                            content: {
                                title: stage.title,
                                body: stage.body,
                                data: {
                                    type: 'MED_REMINDER',
                                    date: dateStr,
                                    time: timeSlot,
                                    slotKey: slotKey,
                                    medIds: items.map(it => it.med.id),
                                    stage: stage.id
                                },
                                categoryIdentifier: NOTIFICATION_CATEGORY_ID,
                                sound: true,
                                ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
                            },
                            trigger: {
                                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                                seconds,
                                repeats: false,
                                ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
                            },
                        });
                        totalScheduled++;
                    }
                }
            }
            console.log(`MedNote: Successfully scheduled ${totalScheduled} notifications.`);
        } catch (error) {
            console.error("MedNote: Error during scheduling:", error);
        }
    },

    /**
     * Cancel specific notification for a slot (when taken early)
     */
    async cancelSpecificSlot(dateStr: string, slotKey: string) {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const notif of scheduled) {
            const data = notif.content.data;
            if (data?.date === dateStr && data?.slotKey === slotKey) {
                await Notifications.cancelScheduledNotificationAsync(notif.identifier);
            }
        }
    }
};
