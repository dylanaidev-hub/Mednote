/**
 * ─── MedContext (Hybrid: SQLite + AsyncStorage fallback) ─────────
 * Tries SQLite first. If migration/init fails, falls back to
 * the original AsyncStorage approach so the app never breaks.
 */

import React, { createContext, useState, useContext, ReactNode, useEffect, useMemo, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MedicineEntry } from '../types/medicine';
import { NotificationService } from '../services/notificationService';
import { initDB } from '../database/database';
import { migrateFromAsyncStorage } from '../database/migration';
import {
    insertPrescription as sqlInsertPrescription,
    deletePrescriptionById as sqlDeletePrescription,
    getAllPrescriptions as sqlGetAllPrescriptions,
    PrescriptionRecord,
} from '../database/medicationDAO';
import {
    getConfirmedMedsForDate as sqlGetConfirmedMedsForDate,
    confirmMedicines as sqlConfirmMedicines,
    undoConfirmMedicines as sqlUndoConfirmMedicines,
    getMedicationLogsLegacy as sqlGetMedicationLogsLegacy,
    setMedicationDateStatus as sqlSetMedicationDateStatus,
    getDoseLogSessionsForDate as sqlGetDoseLogSessionsForDate,
    ensureAllDoseLogsForDate as sqlEnsureAllTodayDoseLogs,
} from '../database/doseLogDAO';
import { formatLocalDate } from '../utils/dateUtils';
import { useSettingsStore } from '../stores/settingsStore';

// ─── Constants ───────────────────────────────────────────────────

const STORAGE_KEY = '@mednote_prescriptions';
const LOGS_STORAGE_KEY = '@mednote_medication_logs';
const CONFIRMED_MEDS_KEY = '@mednote_confirmed_meds_today';

// ─── Types ───────────────────────────────────────────────────────

export interface Prescription {
    id: string;
    hospital: string;
    date: string;
    duration: number;
    medicines: MedicineEntry[];
    images?: string[];
    createdAt: string;
}

export type MedicationStatus = 'taken' | 'missed';

interface MedContextType {
    medicines: MedicineEntry[];
    records: Prescription[];
    medicationLogs: Record<string, Record<string, MedicationStatus>>;
    addPrescription: (prescription: Prescription) => Promise<void>;
    deletePrescription: (id: string) => Promise<void>;
    updateMedicationLog: (prescriptionId: string, date: string, status: MedicationStatus | null) => Promise<void>;
    notificationsEnabled: boolean;
    naggingMode: boolean;
    setNotificationsEnabled: (enabled: boolean) => Promise<void>;
    setNaggingMode: (enabled: boolean) => Promise<void>;
    isLoading: boolean;
    confirmedMedsToday: Record<string, string[]>;
    updateConfirmedMed: (slotKey: string, medIds: string[], isUndo?: boolean) => Promise<void>;
    clearConfirmedMeds: () => Promise<void>;
}

const MedContext = createContext<MedContextType | undefined>(undefined);

// ─── Helper: extract active medicines from prescriptions ─────────
// Data-Driven: filters sessions based on actual dose_logs in SQLite
//
// doseLogKeys = null   → still loading, return [] (don't flash wrong data)
// doseLogKeys = Set()  → loaded, filter by keys in the Set

function extractActiveMedicines(
    prescriptions: Prescription[],
    doseLogKeys: Set<string> | null,   // Set of "medId_SlotKey" from dose_logs
    usingSQLite: boolean
): MedicineEntry[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ★ SQLite mode but keys not loaded yet → return empty (wait for loadFromSQLite to finish)
    if (usingSQLite && doseLogKeys === null) {
        return [];
    }

    return prescriptions.flatMap(rx => {
        const start = new Date(rx.date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + rx.duration - 1);

        if (today < start || today > end) return [];

        const result: MedicineEntry[] = [];
        for (const med of rx.medicines) {
            let filteredSessionTimes: Record<string, string> = {};
            let filteredFrequency: string[] = [];

            if (usingSQLite && doseLogKeys) {
                // ★ Data-Driven: ONLY include sessions with actual dose_log records
                Object.entries(med.sessionTimes || {}).forEach(([slot, time]) => {
                    const normalizedSlot = slot.charAt(0).toUpperCase() + slot.slice(1).toLowerCase();
                    const key = `${med.id}_${normalizedSlot}`;
                    if (doseLogKeys.has(key)) {
                        filteredSessionTimes[slot] = time;
                        filteredFrequency.push(slot);
                    }
                });
            } else {
                // Fallback (AsyncStorage mode): include all sessions
                filteredSessionTimes = { ...med.sessionTimes };
                filteredFrequency = [...med.frequency];
            }

            if (Object.keys(filteredSessionTimes).length === 0) {
                continue;
            }

            result.push({
                ...med,
                sessionTimes: filteredSessionTimes,
                frequency: filteredFrequency,
                prescriptionId: rx.id,
                source: (rx.duration === 999 ? 'routine' : 'prescription') as 'routine' | 'prescription',
            });
        }
        return result;
    });
}

// ─── Provider ────────────────────────────────────────────────────

export const MedProvider = ({ children }: { children: ReactNode }) => {
    const [records, setRecords] = useState<Prescription[]>([]);
    const [medicationLogs, setMedicationLogs] = useState<Record<string, Record<string, MedicationStatus>>>({});
    const [confirmedMedsToday, setConfirmedMedsToday] = useState<Record<string, string[]>>({});
    const [todayDoseLogKeys, setTodayDoseLogKeys] = useState<Set<string> | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Track whether SQLite is working
    const useSQLite = useRef(false);

    // Suppress scheduling during prescription creation
    const suppressScheduleRef = useRef(false);

    // Settings from Zustand store
    const {
        notificationsEnabled,
        naggingMode,
        isLoaded: settingsLoaded,
        loadSettings,
        setNotificationsEnabled: setNotifEnabled,
        setNaggingMode: setNagging,
    } = useSettingsStore();

    // ─── Derive medicines from records (data-driven) ─────────
    const medicines = useMemo(
        () => extractActiveMedicines(records, todayDoseLogKeys, useSQLite.current),
        [records, todayDoseLogKeys]
    );

    // ─── Load from AsyncStorage (fallback) ───────────────────
    const loadFromAsyncStorage = useCallback(async () => {
        try {
            const [rawPrescriptions, rawLogs, rawConfirmed] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEY),
                AsyncStorage.getItem(LOGS_STORAGE_KEY),
                AsyncStorage.getItem(CONFIRMED_MEDS_KEY),
            ]);

            const prescriptions: Prescription[] = rawPrescriptions ? JSON.parse(rawPrescriptions) : [];
            setRecords(prescriptions);

            const logs = rawLogs ? JSON.parse(rawLogs) : {};
            setMedicationLogs(logs);

            if (rawConfirmed) {
                const parsed = JSON.parse(rawConfirmed);
                const today = new Date().toDateString();
                if (parsed.date === today && parsed.slots) {
                    setConfirmedMedsToday(parsed.slots);
                }
            }
        } catch (e) {
            console.error('Failed to load from AsyncStorage:', e);
        }
    }, []);

    // ─── Load from SQLite ────────────────────────────────────
    const loadFromSQLite = useCallback(async () => {
        try {
            const allPrescriptions = await sqlGetAllPrescriptions();
            setRecords(allPrescriptions);

            const logs = await sqlGetMedicationLogsLegacy();
            setMedicationLogs(logs);

            const todayStr = formatLocalDate(new Date());
            const confirmed = await sqlGetConfirmedMedsForDate(todayStr);
            setConfirmedMedsToday(confirmed);

            // ★ Step 1: Ensure dose_logs exist for ALL active meds today (Day-1 aware)
            await sqlEnsureAllTodayDoseLogs(todayStr);

            // ★ Step 2: THEN load dose_log keys (now includes all active meds)
            const doseLogKeys = await sqlGetDoseLogSessionsForDate(todayStr);
            setTodayDoseLogKeys(doseLogKeys);
        } catch (e) {
            console.error('Failed to load from SQLite:', e);
            throw e; // propagate to fallback
        }
    }, []);

    // ─── Initial Load ────────────────────────────────────────
    useEffect(() => {
        const initialize = async () => {
            try {
                // Load settings
                await loadSettings();

                // Try SQLite
                try {
                    await initDB();
                    await migrateFromAsyncStorage();
                    await loadFromSQLite();
                    useSQLite.current = true;
                    console.log('MedNote: ✅ Using SQLite backend');
                } catch (sqliteError) {
                    console.warn('MedNote: ⚠️ SQLite failed, falling back to AsyncStorage:', sqliteError);
                    useSQLite.current = false;
                    await loadFromAsyncStorage();
                }

                // Boot cleanup
                await NotificationService.cancelAll();
                await NotificationService.init();
            } catch (e) {
                console.error('Failed to initialize MedContext:', e);
            } finally {
                setIsLoading(false);
            }
        };

        initialize();
    }, []);

    // ─── Notification Scheduling ─────────────────────────────
    // Only reschedule when prescriptions change or notification settings toggle.
    // Do NOT re-trigger on confirmedMedsToday/medicationLogs changes
    // because confirming already cancels the relevant slot's notifications.
    useEffect(() => {
        if (!isLoading && settingsLoaded) {
            // Skip if we're in the middle of creating a prescription
            if (suppressScheduleRef.current) {
                console.log('MedNote: Scheduling suppressed (prescription creation in progress)');
                return;
            }
            const timer = setTimeout(() => {
                NotificationService.scheduleAll(records, notificationsEnabled, naggingMode, medicationLogs, confirmedMedsToday);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [records, notificationsEnabled, naggingMode, isLoading, settingsLoaded]);

    // ─── Save Prescriptions to AsyncStorage ──────────────────
    const savePrescriptionsToAS = useCallback(async (newRecords: Prescription[]) => {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newRecords));
    }, []);

    // ─── Save Logs to AsyncStorage ───────────────────────────
    const saveLogsToAS = useCallback(async (newLogs: Record<string, Record<string, MedicationStatus>>) => {
        await AsyncStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(newLogs));
    }, []);

    // ─── Save ConfirmedMeds to AsyncStorage ──────────────────
    const saveConfirmedToAS = useCallback(async (slots: Record<string, string[]>) => {
        await AsyncStorage.setItem(CONFIRMED_MEDS_KEY, JSON.stringify({
            date: new Date().toDateString(),
            slots,
        }));
    }, []);

    // ─── Add Prescription ────────────────────────────────────
    const addPrescription = useCallback(async (prescription: Prescription) => {
        try {
            // Suppress notification scheduling during creation
            suppressScheduleRef.current = true;

            const newRecords = [...records, prescription];

            if (useSQLite.current) {
                const record: PrescriptionRecord = {
                    id: prescription.id,
                    hospital: prescription.hospital,
                    date: prescription.date,
                    duration: prescription.duration,
                    medicines: prescription.medicines,
                    images: prescription.images,
                    createdAt: prescription.createdAt,
                };
                await sqlInsertPrescription(record);
                await loadFromSQLite();
            } else {
                setRecords(newRecords);
                await savePrescriptionsToAS(newRecords);
            }
        } catch (e) {
            console.error('Failed to add prescription:', e);
        } finally {
            // Re-enable scheduling after a delay
            setTimeout(() => {
                suppressScheduleRef.current = false;
            }, 3000);
        }
    }, [records, loadFromSQLite, savePrescriptionsToAS]);

    // ─── Delete Prescription ─────────────────────────────────
    const deletePrescription = useCallback(async (id: string) => {
        try {
            if (useSQLite.current) {
                await sqlDeletePrescription(id);
                await loadFromSQLite();
            } else {
                const newRecords = records.filter(r => r.id !== id);
                setRecords(newRecords);
                await savePrescriptionsToAS(newRecords);
            }
        } catch (e) {
            console.error('Failed to delete prescription:', e);
        }
    }, [records, loadFromSQLite, savePrescriptionsToAS]);

    // ─── Update Medication Log ───────────────────────────────
    const updateMedicationLog = useCallback(async (
        prescriptionId: string,
        date: string,
        status: MedicationStatus | null
    ) => {
        try {
            if (useSQLite.current) {
                const prescription = records.find(p => p.id === prescriptionId);
                if (!prescription) return;

                const sqlStatus = status === 'taken' ? 'COMPLETED' :
                    status === 'missed' ? 'MISSED' : null;

                for (const med of prescription.medicines) {
                    await sqlSetMedicationDateStatus(med.id, date, sqlStatus as any);
                }

                const logs = await sqlGetMedicationLogsLegacy();
                setMedicationLogs(logs);
            } else {
                // AsyncStorage approach
                setMedicationLogs(prev => {
                    const next = { ...prev };
                    if (status === null) {
                        if (next[prescriptionId]) {
                            delete next[prescriptionId][date];
                            if (Object.keys(next[prescriptionId]).length === 0) {
                                delete next[prescriptionId];
                            }
                        }
                    } else {
                        if (!next[prescriptionId]) next[prescriptionId] = {};
                        next[prescriptionId][date] = status;
                    }
                    saveLogsToAS(next);
                    return next;
                });
            }
        } catch (e) {
            console.error('Failed to update medication log:', e);
        }
    }, [records, saveLogsToAS]);

    // ─── Update Confirmed Med ────────────────────────────────
    const updateConfirmedMed = useCallback(async (
        slotKey: string,
        medIds: string[],
        isUndo: boolean = false
    ) => {
        try {
            if (useSQLite.current) {
                const todayStr = formatLocalDate(new Date());

                if (isUndo) {
                    await sqlUndoConfirmMedicines(slotKey, medIds, todayStr);
                } else {
                    await sqlConfirmMedicines(slotKey, medIds, todayStr);
                }

                const confirmed = await sqlGetConfirmedMedsForDate(todayStr);
                setConfirmedMedsToday(confirmed);

                // Note: medicationLogs state is fully deprecated. Adherence is queried directly from DB.
            } else {
                // AsyncStorage approach
                setConfirmedMedsToday(prev => {
                    const next = { ...prev };
                    if (isUndo) {
                        if (medIds.length === 0) {
                            delete next[slotKey];
                        } else {
                            next[slotKey] = (next[slotKey] || []).filter(id => !medIds.includes(id));
                            if (next[slotKey].length === 0) delete next[slotKey];
                        }
                    } else {
                        const existing = new Set(next[slotKey] || []);
                        medIds.forEach(id => existing.add(id));
                        next[slotKey] = Array.from(existing);
                    }
                    saveConfirmedToAS(next);
                    return next;
                });
            }

            // Directly cancel scheduled notifications for this slot
            // (instead of relying on useEffect → scheduleAll loop)
            if (!isUndo) {
                const todayLocal = formatLocalDate(new Date());
                await NotificationService.cancelSpecificSlot(todayLocal, slotKey);
            }
        } catch (e) {
            console.error('Failed to update confirmed med:', e);
        }
    }, [saveConfirmedToAS]);

    // ─── Clear Confirmed Meds ────────────────────────────────
    const clearConfirmedMeds = useCallback(async () => {
        setConfirmedMedsToday({});
        if (!useSQLite.current) {
            await AsyncStorage.removeItem(CONFIRMED_MEDS_KEY);
        }
    }, []);

    // ─── Settings Wrappers ───────────────────────────────────
    const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
        if (enabled) {
            const granted = await NotificationService.init();
            if (!granted) {
                await setNotifEnabled(false);
                return;
            }
        }
        await setNotifEnabled(enabled);
    }, [setNotifEnabled]);

    const setNaggingMode = useCallback(async (enabled: boolean) => {
        await setNagging(enabled);
    }, [setNagging]);

    // ─── Context Value ───────────────────────────────────────
    const contextValue = useMemo(() => ({
        medicines,
        records,
        medicationLogs,
        addPrescription,
        deletePrescription,
        updateMedicationLog,
        confirmedMedsToday,
        updateConfirmedMed,
        clearConfirmedMeds,
        notificationsEnabled,
        naggingMode,
        setNotificationsEnabled,
        setNaggingMode,
        isLoading
    }), [
        medicines, records, medicationLogs, confirmedMedsToday,
        addPrescription, deletePrescription,
        updateMedicationLog, updateConfirmedMed, clearConfirmedMeds,
        notificationsEnabled, naggingMode, setNotificationsEnabled, setNaggingMode,
        isLoading
    ]);

    return (
        <MedContext.Provider value={contextValue}>
            {children}
        </MedContext.Provider>
    );
};

export const useMedContext = () => {
    const context = useContext(MedContext);
    if (context === undefined) {
        throw new Error('useMedContext must be used within a MedProvider');
    }
    return context;
};
