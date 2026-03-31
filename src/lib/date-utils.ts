
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

/**
 * 勤怠打刻時間の丸め処理
 * @param time 打刻時間 (HH:mm)
 * @param type "IN" | "OUT"
 * @param targetTime 規定の時間 (HH:mm)
 * @returns 丸め後の時間 (HH:mm)
 */
export function roundAttendanceTime(time: string, type: "IN" | "OUT", targetTime: string): string {
    if (!time || !targetTime) return time;
    
    const [h, m] = time.split(':').map(Number);
    const [th, tm] = targetTime.split(':').map(Number);
    const currentTotal = h * 60 + m;
    const targetTotal = th * 60 + tm;

    if (type === "IN") {
        // 出勤: 規定時間の14分前〜規定時間までの打刻を規定時間にする
        // 例: 9:00規定の場合、8:46〜9:00 -> 9:00
        // (8:45以前はそのまま = 早出として扱う)
        if (currentTotal > targetTotal - 15 && currentTotal <= targetTotal) {
            return targetTime;
        }
    } else {
        // 退勤: 規定時間〜規定時間の14分後までの打刻を規定時間にする
        // 例: 17:30規定の場合、17:30〜17:44 -> 17:30
        // (17:45以降はそのまま = 残業として扱う)
        if (currentTotal >= targetTotal && currentTotal < targetTotal + 15) {
            return targetTime;
        }
    }
    return time;
}
