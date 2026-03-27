
export function getJstDate(date: Date = new Date()): Date {
    // Keep the same time but shifted to JST for string conversion if needed, 
    // or just use Intl.DateTimeFormat
    return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

export function getJstDateString(date: Date = new Date()): string {
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return jstDate.toISOString().split('T')[0];
}

export function getJstTime(date: Date = new Date()): string {
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const h = String(jstDate.getUTCHours()).padStart(2, '0');
    const m = String(jstDate.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}
