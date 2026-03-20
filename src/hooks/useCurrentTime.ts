/**
 * useCurrentTime
 * ──────────────
 * Returns a `currentTime` Date that auto-updates:
 *  1. Every `intervalMs` (default 60 000 ms = 1 minute)
 *  2. Immediately when app returns from background → foreground
 *
 * Usage:
 *   const currentTime = useCurrentTime();
 *   // Any render logic depending on currentTime will re-render automatically.
 */

import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useCurrentTime(intervalMs = 60_000): Date {
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const appState = useRef<AppStateStatus>(AppState.currentState);

    useEffect(() => {
        // ── 1. Interval tick (every minute) ──
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, intervalMs);

        // ── 2. AppState listener (resume from background) ──
        const sub = AppState.addEventListener('change', (nextState) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextState === 'active'
            ) {
                setCurrentTime(new Date());
            }
            appState.current = nextState;
        });

        return () => {
            clearInterval(timer);
            sub.remove();
        };
    }, [intervalMs]);

    return currentTime;
}
