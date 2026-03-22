// 日本の祝日判定ユーティリティ

/**
 * 指定された年の日本の祝日一覧を返す
 */
export function getJapaneseHolidays(year: number): Map<string, string> {
    const holidays = new Map<string, string>();

    // 固定祝日
    holidays.set(`${year}-01-01`, "元日");
    holidays.set(`${year}-02-11`, "建国記念の日");
    holidays.set(`${year}-02-23`, "天皇誕生日");
    holidays.set(`${year}-04-29`, "昭和の日");
    holidays.set(`${year}-05-03`, "憲法記念日");
    holidays.set(`${year}-05-04`, "みどりの日");
    holidays.set(`${year}-05-05`, "こどもの日");
    holidays.set(`${year}-08-11`, "山の日");
    holidays.set(`${year}-11-03`, "文化の日");
    holidays.set(`${year}-11-23`, "勤労感謝の日");

    // ハッピーマンデー（第n月曜日）
    holidays.set(getNthWeekday(year, 1, 1, 2), "成人の日");       // 1月第2月曜
    holidays.set(getNthWeekday(year, 7, 1, 3), "海の日");         // 7月第3月曜
    holidays.set(getNthWeekday(year, 9, 1, 3), "敬老の日");       // 9月第3月曜
    holidays.set(getNthWeekday(year, 10, 1, 2), "スポーツの日");  // 10月第2月曜

    // 春分の日（概算：3月20日 or 21日）
    const vernalEquinox = calculateVernalEquinox(year);
    holidays.set(formatDate(year, 3, vernalEquinox), "春分の日");

    // 秋分の日（概算：9月22日 or 23日）
    const autumnalEquinox = calculateAutumnalEquinox(year);
    holidays.set(formatDate(year, 9, autumnalEquinox), "秋分の日");

    // 振替休日の追加（祝日が日曜の場合、翌平日が振替休日）
    const substituteHolidays: [string, string][] = [];
    for (const [dateStr, name] of holidays) {
        const date = new Date(dateStr);
        if (date.getDay() === 0) { // 日曜日
            // 翌日以降で最初の非祝日を探す
            let substitute = new Date(date);
            substitute.setDate(substitute.getDate() + 1);
            while (holidays.has(dateToString(substitute)) || substitute.getDay() === 0) {
                substitute.setDate(substitute.getDate() + 1);
            }
            substituteHolidays.push([dateToString(substitute), `振替休日（${name}）`]);
        }
    }
    for (const [dateStr, name] of substituteHolidays) {
        holidays.set(dateStr, name);
    }

    // 国民の休日（祝日と祝日に挟まれた平日）
    const sortedDates = Array.from(holidays.keys()).sort();
    for (let i = 0; i < sortedDates.length - 1; i++) {
        const current = new Date(sortedDates[i]);
        const next = new Date(sortedDates[i + 1]);
        const diff = (next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 2) {
            const between = new Date(current);
            between.setDate(between.getDate() + 1);
            const betweenStr = dateToString(between);
            if (!holidays.has(betweenStr) && between.getDay() !== 0) {
                holidays.set(betweenStr, "国民の休日");
            }
        }
    }

    return holidays;
}

/**
 * 指定された日付が祝日または日曜日かチェック
 */
export function isHolidayOrSunday(dateStr: string): { isHoliday: boolean; reason?: string } {
    const date = new Date(dateStr);
    const year = date.getFullYear();

    // 日曜日チェック
    if (date.getDay() === 0) {
        return { isHoliday: true, reason: "日曜日" };
    }

    // 祝日チェック
    const holidays = getJapaneseHolidays(year);
    const holidayName = holidays.get(dateStr);
    if (holidayName) {
        return { isHoliday: true, reason: holidayName };
    }

    return { isHoliday: false };
}

// --- ヘルパー関数 ---

/**
 * 第n番目の指定曜日の日付を返す
 * @param weekday 0=日, 1=月, ... 6=土
 */
function getNthWeekday(year: number, month: number, weekday: number, n: number): string {
    const firstDay = new Date(year, month - 1, 1);
    let dayOfWeek = firstDay.getDay();
    let diff = weekday - dayOfWeek;
    if (diff < 0) diff += 7;
    const day = 1 + diff + (n - 1) * 7;
    return formatDate(year, month, day);
}

/**
 * 春分の日の日を計算（概算）
 */
function calculateVernalEquinox(year: number): number {
    if (year >= 2000 && year <= 2099) {
        return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    }
    return 20; // デフォルト
}

/**
 * 秋分の日の日を計算（概算）
 */
function calculateAutumnalEquinox(year: number): number {
    if (year >= 2000 && year <= 2099) {
        return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    }
    return 23; // デフォルト
}

function formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateToString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
