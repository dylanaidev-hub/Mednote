export interface MedicineEntry {
    id: string;
    name: string;
    quantity: string;
    unit: string;
    frequency: string[]; // ['sáng', 'trưa', etc.]
    sessionTimes: Record<string, string>; // { 'sáng': '08:00', 'custom_123': '22:00' }
    mealTiming?: string;
    note: string;
    hasError: boolean;
    // UI-specific properties
    time?: string;
    status?: 'taken' | 'pending';
    doctorNote?: string;
    dosage?: string;
    source?: 'prescription' | 'routine';
    prescriptionId?: string;
    weekdays?: number[]; // 0=CN, 1=T2, 2=T3 ... 6=T7 (JS Date.getDay())
}

export const SESSION_DEFAULTS: Record<string, string> = {
    'sáng': '08:00',
    'trưa': '12:00',
    'chiều': '17:00',
    'tối': '20:00',
};

export interface SessionType {
    id: string;
    label: string;
    icon: string;
    iconColor: string;
    activeBg: string;
    activeBorder: string;
    activeColor: string;
}

export const SESSIONS: SessionType[] = [
    { id: 'sáng', label: 'Sáng', icon: 'weather-sunny', iconColor: '#f59e0b', activeBg: '#fef3c7', activeBorder: '#fbbf24', activeColor: '#d97706' },
    { id: 'trưa', label: 'Trưa', icon: 'weather-partly-cloudy', iconColor: '#f97316', activeBg: '#ffedd5', activeBorder: '#fb923c', activeColor: '#c2410c' },
    { id: 'chiều', label: 'Chiều', icon: 'weather-sunset', iconColor: '#ef4444', activeBg: '#fee2e2', activeBorder: '#f87171', activeColor: '#b91c1c' },
    { id: 'tối', label: 'Tối', icon: 'moon-waning-crescent', iconColor: '#6366f1', activeBg: '#e0e7ff', activeBorder: '#818cf8', activeColor: '#4338ca' },
];
