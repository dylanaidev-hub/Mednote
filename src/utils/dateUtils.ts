export const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Safe Date parser for SQLite values.
 * Handles: Date objects, ms timestamps, second timestamps (×1000), ISO strings, space-separated date strings.
 */
export const parseSQLiteDate = (dbDate: string | number | Date): Date => {
    if (!dbDate) return new Date();
    if (dbDate instanceof Date) return dbDate;

    if (typeof dbDate === 'number') {
        // If timestamp is 10 digits (seconds), multiply by 1000 to get ms for JS
        return new Date(dbDate < 10000000000 ? dbDate * 1000 : dbDate);
    }

    if (typeof dbDate === 'string') {
        // Fix Invalid Date on iOS: replace space with 'T'
        const safeDateStr = dbDate.replace(' ', 'T');
        return new Date(safeDateStr);
    }
    return new Date();
};
