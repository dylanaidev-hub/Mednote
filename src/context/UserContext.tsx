/**
 * ─── UserContext (Medical Info Only) ─────────────────────────────
 * Manages medical information (weight, height, blood type, allergies).
 * No user profile (avatar, name, email, phone) since there's no login.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MedicalInfo {
    weight: string;
    height: string;
    bloodType: string;
    rh: string;
    allergies: string;
}

interface UserContextType {
    medicalInfo: MedicalInfo | null;
    updateMedicalInfo: (info: MedicalInfo) => Promise<void>;
    isLoading: boolean;
}

const MEDICAL_STORAGE_KEY = 'mednote_medical_info_v2';

const DEFAULT_MEDICAL: MedicalInfo = {
    weight: '68',
    height: '175',
    bloodType: 'O',
    rh: '+',
    allergies: 'Dị ứng Penicillin, Lactose',
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
    const [medicalInfo, setMedicalInfo] = useState<MedicalInfo | null>(DEFAULT_MEDICAL);
    const [isLoading, setIsLoading] = useState(true);

    // Initial load
    useEffect(() => {
        const loadSavedData = async () => {
            try {
                const savedMedical = await AsyncStorage.getItem(MEDICAL_STORAGE_KEY);
                if (savedMedical) setMedicalInfo(JSON.parse(savedMedical));
            } catch (error) {
                console.error("Error loading medical data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadSavedData();
    }, []);

    const updateMedicalInfo = useCallback(async (newInfo: MedicalInfo) => {
        try {
            setMedicalInfo(newInfo);
            await AsyncStorage.setItem(MEDICAL_STORAGE_KEY, JSON.stringify(newInfo));
        } catch (error) {
            console.error("Error updating medical info:", error);
            throw error;
        }
    }, []);

    const contextValue = useMemo(() => ({
        medicalInfo,
        updateMedicalInfo,
        isLoading
    }), [medicalInfo, updateMedicalInfo, isLoading]);

    return (
        <UserContext.Provider value={contextValue}>
            {children}
        </UserContext.Provider>
    );
};
