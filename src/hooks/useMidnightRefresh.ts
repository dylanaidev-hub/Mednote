/**
 * useMidnightRefresh
 * ──────────────────
 * Fires `onNewDay()` automatically via three complementary strategies:
 *
 *  1. AppState listener  – detects app coming back from background after midnight.
 *  2. Midnight setTimeout – fires at exactly 00:00:01 for always-on sessions.
 *  3. useFocusEffect     – called by the *consumer* screen (not here) so we
 *     export a dateKey helper for the check.
 *
 * Usage:
 *   useMidnightRefresh({ onNewDay: () => resetDailyState() });
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// ─── Helpers ──────────────────────────────────────────────────────

/** Returns a stable YYYY-MM-DD string for "today" */
export const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Milliseconds from now until the next 00:00:01 */
const msUntilMidnight = (): number => {
    const now = new Date();
    const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // tomorrow
        0, 0, 1,           // 00:00:01
    );
    return midnight.getTime() - now.getTime();
};

// ─── Hook ─────────────────────────────────────────────────────────

interface Options {
    /** Called whenever a date change is detected. Should reset all daily state. */
    onNewDay: () => void;
}

export function useMidnightRefresh({ onNewDay }: Options) {
    // Track which calendar date was active when the hook last ran
    const lastDateRef = useRef<string>(todayKey());

    const checkAndRefresh = useCallback(() => {
        const current = todayKey();
        if (current !== lastDateRef.current) {
            lastDateRef.current = current;
            onNewDay();
        }
    }, [onNewDay]);

    // ── Strategy 1: AppState (background → foreground) ────────────
    useEffect(() => {
        const onChange = (nextState: AppStateStatus) => {
            if (nextState === 'active') {
                checkAndRefresh();
            }
        };
        const sub = AppState.addEventListener('change', onChange);
        return () => sub.remove();
    }, [checkAndRefresh]);

    // ── Strategy 2: Midnight setTimeout ──────────────────────────
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const scheduleNextCheck = () => {
            const ms = msUntilMidnight();
            timeoutId = setTimeout(() => {
                lastDateRef.current = todayKey(); // advance the ref first
                onNewDay();                        // then trigger refresh
                scheduleNextCheck();               // re-arm for the day after
            }, ms);
        };

        scheduleNextCheck();
        return () => clearTimeout(timeoutId);
    }, [onNewDay]);

    /**
     * Call this inside a useFocusEffect in the consumer screen
     * to handle navigation-based date checks (Strategy 3).
     */
    return { checkAndRefresh };
}
