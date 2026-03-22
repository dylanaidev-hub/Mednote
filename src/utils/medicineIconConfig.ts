/**
 * ─── Medicine Icon Config (Design System Token) ─────────────────
 * Single Source of Truth for medicine type → icon/color mapping.
 * Used by DoseSessionCard, MedicineDetailCard, and any future components.
 *
 * bgColor is auto-derived from the main color at 10% opacity.
 */

import { MedicineEntry } from '../types/medicine';

// ─── Design Tokens ───────────────────────────────────────────────

export interface MedIconConfig {
    family: 'Ionicons' | 'MaterialCommunityIcons';
    name: string;
    color: string;
    bgColor: string;
}

const MED_ICON_TOKENS = {
    routine:  { family: 'MaterialCommunityIcons' as const, name: 'leaf',         color: '#3b82f6', bgColor: '#eff6ff' },
    packet:   { family: 'Ionicons'               as const, name: 'cube-outline', color: '#f59e0b', bgColor: '#fef3c7' },
    liquid:   { family: 'Ionicons'               as const, name: 'water-outline',color: '#0ea5e9', bgColor: '#e0f2fe' },
    pill:     { family: 'MaterialCommunityIcons' as const, name: 'pill',         color: '#3b82f6', bgColor: '#eff6ff' },
    pillGray: { family: 'MaterialCommunityIcons' as const, name: 'pill',         color: '#9ca3af', bgColor: '#f3f4f6' },
} as const;

// ─── Resolver ────────────────────────────────────────────────────

/**
 * Returns icon config for a medicine entry.
 * @param med - The medicine entry
 * @param isActive - Whether the prescription is active (only affects pill default)
 */
export function getMedicineIconConfig(med: MedicineEntry, isActive = true): MedIconConfig {
    // Priority 1: Source (routine = supplement → leaf icon)
    if (med.source === 'routine') {
        return MED_ICON_TOKENS.routine;
    }

    // Priority 2: Unit-based detection for prescriptions
    const unit = (med.unit || '').toLowerCase();

    if (unit.includes('gói')) {
        return MED_ICON_TOKENS.packet;
    }

    if (unit.includes('ml') || unit.includes('lọ') || unit.includes('ống') || unit.includes('chai')) {
        return MED_ICON_TOKENS.liquid;
    }

    // Default: Pill (active = blue, inactive = gray)
    return isActive ? MED_ICON_TOKENS.pill : MED_ICON_TOKENS.pillGray;
}
