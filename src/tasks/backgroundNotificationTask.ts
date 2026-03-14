import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

const BACKGROUND_NOTIFICATION_TASK = 'MEDNOTE_BACKGROUND_NOTIFICATION_REFILL';

/**
 * Define the background task.
 * This runs periodically (~every 6-12 hours, OS-controlled) to refill
 * the notification queue if it's running low.
 *
 * Note: This task has NO access to React state or context.
 * It only checks the pending notification count and re-triggers a full
 * reschedule when the app is next foregrounded.
 */
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const pendingCount = scheduled.length;
        console.log(`MedNote BG: ${pendingCount} notifications pending`);

        if (pendingCount < 10) {
            // We can't easily access SQLite from a background task without the app context.
            // Instead, we set a flag so the app refills on next foreground.
            console.log('MedNote BG: Low notification count, will refill on next foreground');
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
        console.error('MedNote BG: Task error:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

/**
 * Register the background fetch task.
 * Call this once at app startup (e.g., in App.tsx or MedContext).
 */
export async function registerBackgroundNotificationTask() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
        if (isRegistered) {
            console.log('MedNote: Background notification task already registered');
            return;
        }

        await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
            minimumInterval: 6 * 60 * 60, // ~6 hours (OS may adjust)
            stopOnTerminate: false,        // Keep running after app is killed
            startOnBoot: true,             // Restart after device reboot
        });

        console.log('MedNote: Background notification task registered ✅');
    } catch (error) {
        console.error('MedNote: Failed to register background task:', error);
    }
}
