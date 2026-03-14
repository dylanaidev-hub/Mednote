import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Prescription } from '../context/MedContext';
import { MedicineEntry } from '../types/medicine';
import { formatLocalDate } from '../utils/dateUtils';

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Nagging Mode Offsets (minutes after base time) ─────────────
// 0 = đúng giờ, 5/15/30 = trễ bao nhiêu phút
const NAGGING_OFFSETS = [0, 5, 15, 30];

// ─── Nagging Messages ───────────────────────────────────────────
function getNaggingContent(offset: number, slotKey: string, timeSlot: string, count: number, medNames: string) {
    switch (offset) {
        case 0:
            return {
                title: '💊 Đến giờ uống thuốc rồi!',
                body: `Bạn có ${count} loại thuốc cần uống lúc ${timeSlot}: ${medNames}`,
            };
        case 5:
            return {
                title: 'Bạn quên mình rồi sao? 🥺',
                body: `Cữ thuốc [${slotKey}] lúc ${timeSlot} đang buồn.`,
            };
        case 15:
            return {
                title: 'Báo động sức khỏe! 🚨',
                body: `Đã trễ 15 phút! Uống thuốc mau: ${medNames}`,
            };
        case 30:
            return {
                title: 'MedNote bỏ cuộc đây... 💔',
                body: `Cữ ${slotKey} lúc ${timeSlot} đã trễ 30 phút. Mình sẽ ngừng gọi.`,
            };
        default:
            return {
                title: '💊 Nhắc nhở uống thuốc',
                body: `${medNames}`,
            };
    }
}

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

// ─── Generate deterministic notification ID ─────────────────────
// Format: med_{dateStr}_{slotKey}_{timeSlot}_{offset}
// Example: med_2026-03-12_Sáng_08:00_0, med_2026-03-12_Sáng_08:00_5
function makeNotificationId(dateStr: string, slotKey: string, timeSlot: string, offset: number): string {
    return `med_${dateStr}_${slotKey}_${timeSlot}_${offset}`;
}

// ─── Generate base schedule ID (without offset) ─────────────────
function makeBaseScheduleId(dateStr: string, slotKey: string, timeSlot: string): string {
    return `med_${dateStr}_${slotKey}_${timeSlot}`;
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
     * Schedule notifications for all active and future medicines.
     * Uses Date-based triggers and deterministic unique IDs.
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
            const daysToSchedule = 7; // 7-day rolling window
            let totalScheduled = 0;

            for (let i = 0; i < daysToSchedule; i++) {
                const targetDate = new Date(now);
                targetDate.setDate(now.getDate() + i);
                const dateStr = formatLocalDate(targetDate);
                const isToday = i === 0;

                const medsForThisDay: { med: MedicineEntry; time: string; slot: string; prescriptionId: string }[] = [];

                records.forEach(prescription => {
                    const prescriptionStatus = finalLogs[prescription.id]?.[dateStr];
                    if (prescriptionStatus === 'taken') {
                        console.log(`MedNote: Skip prescription ${prescription.id} for ${dateStr} — already taken`);
                        return;
                    }

                    const startDate = new Date(prescription.date + 'T00:00:00');
                    startDate.setHours(0, 0, 0, 0);

                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + (prescription.duration || 1) - 1);
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

                // Group meds by time slot (e.g., all meds at 08:00 go into one group)
                const groupedByTime: Record<string, typeof medsForThisDay> = {};
                medsForThisDay.forEach(item => {
                    if (!groupedByTime[item.time]) groupedByTime[item.time] = [];
                    groupedByTime[item.time].push(item);
                });

                for (const [timeSlot, items] of Object.entries(groupedByTime)) {
                    const [hours, minutes] = timeSlot.split(':').map(Number);

                    // Build the base trigger Date for this session
                    const baseTriggerDate = new Date(targetDate);
                    baseTriggerDate.setHours(hours, minutes, 0, 0);

                    const medNames = items.map(it => it.med.name).join(', ');
                    const count = items.length;
                    const slotKey = items[0].slot;
                    const baseScheduleId = makeBaseScheduleId(dateStr, slotKey, timeSlot);
                    const medIds = items.map(it => it.med.id);

                    // Determine which offsets to schedule
                    const offsets = naggingMode ? NAGGING_OFFSETS : [0];

                    for (const offset of offsets) {
                        // Calculate the exact trigger date by adding offset minutes
                        const triggerDate = new Date(baseTriggerDate.getTime() + offset * 60 * 1000);

                        // ── GUARD: Only schedule if triggerDate is in the FUTURE ──
                        if (triggerDate.getTime() <= Date.now()) {
                            console.log(`MedNote: Skip [${slotKey}/${offset}min] — trigger time ${triggerDate.toLocaleTimeString()} is in the past`);
                            continue;
                        }

                        // Generate deterministic unique notification ID
                        const notificationId = makeNotificationId(dateStr, slotKey, timeSlot, offset);

                        // Get appropriate content for this offset
                        const content = naggingMode
                            ? getNaggingContent(offset, slotKey, timeSlot, count, medNames)
                            : {
                                title: '💊 Đến giờ uống thuốc rồi!',
                                body: `Bạn có ${count} loại thuốc cần uống lúc ${timeSlot}: ${medNames}`,
                            };

                        const secondsUntilTrigger = Math.max(1, Math.floor((triggerDate.getTime() - Date.now()) / 1000));

                        console.log(`MedNote: Scheduling [${notificationId}] at ${triggerDate.toLocaleTimeString()} (in ${secondsUntilTrigger}s / ${Math.round(secondsUntilTrigger / 60)}min)`);

                        await Notifications.scheduleNotificationAsync({
                            identifier: notificationId,
                            content: {
                                title: content.title,
                                body: content.body,
                                data: {
                                    type: 'MED_REMINDER',
                                    date: dateStr,
                                    time: timeSlot,
                                    slotKey: slotKey,
                                    medIds: medIds,
                                    offset: offset,
                                    baseScheduleId: baseScheduleId,
                                },
                                categoryIdentifier: NOTIFICATION_CATEGORY_ID,
                                sound: true,
                                ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
                            },
                            trigger: {
                                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                                seconds: secondsUntilTrigger,
                                repeats: false,
                                channelId: Platform.OS === 'android' ? 'default' : undefined,
                            },
                        });
                        totalScheduled++;
                    }
                }
            }
            console.log(`MedNote: ✅ Successfully scheduled ${totalScheduled} notifications.`);
        } catch (error) {
            console.error("MedNote: Error during scheduling:", error);
        }
    },

    /**
     * Deterministic Kill Switch: Cancel all nagging notifications for a specific slot.
     * Loops through NAGGING_OFFSETS [0, 5, 15, 30] and cancels each unique ID.
     */
    async cancelSpecificSlot(dateStr: string, slotKey: string, timeSlot?: string) {
        try {
            if (timeSlot) {
                // ── Fast path: we know the exact timeSlot → cancel all 4 IDs directly ──
                for (const offset of NAGGING_OFFSETS) {
                    const notificationId = makeNotificationId(dateStr, slotKey, timeSlot, offset);
                    try {
                        await Notifications.cancelScheduledNotificationAsync(notificationId);
                        console.log(`MedNote: Cancelled [${notificationId}]`);
                    } catch {
                        // Notification may not exist (e.g., already fired or wasn't scheduled)
                    }
                }
            } else {
                // ── Fallback: scan all scheduled notifications and cancel by matching data ──
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                for (const notif of scheduled) {
                    const data = notif.content.data;
                    if (data?.date === dateStr && data?.slotKey === slotKey) {
                        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                        console.log(`MedNote: Cancelled (scan) [${notif.identifier}]`);
                    }
                }
            }
        } catch (error) {
            console.error('MedNote: Error cancelling notifications:', error);
        }
    },

    /**
     * Refill notifications if the queue is running low.
     * Checks how many are still pending; if below threshold, reschedules all.
     */
    async refillIfNeeded(
        records: Prescription[],
        enabled: boolean,
        naggingMode: boolean = false,
        medicationLogs: Record<string, Record<string, 'taken' | 'missed'>> = {},
        confirmedMedsToday: Record<string, string[]> = {}
    ) {
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            const pendingCount = scheduled.length;
            console.log(`MedNote: Refill check — ${pendingCount} notifications pending`);

            // Refill if fewer than 20 notifications remain
            if (pendingCount < 20) {
                console.log('MedNote: Below threshold, refilling notifications...');
                await this.scheduleAll(records, enabled, naggingMode, medicationLogs, confirmedMedsToday);
            }
        } catch (e) {
            console.error('MedNote: Refill check failed:', e);
        }
    },
};
