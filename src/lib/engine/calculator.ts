import { prisma } from "@/lib/db";

export interface CalcSettings {
  standardWorkHours: number;      // 7.75
  breakThresholdHours: number;    // 6
  breakDeductionHours: number;    // 0.75
  overtimeThresholdTime: string;  // "17:30"
  overtimeUnitMinutes: number;    // 15
  shortTimeEnd: string;           // "16:30"
}

export interface AttendanceCalcResult {
  actualWorkHours: number;
  breakHours: number;
  overtimeHours: number;
  shortTimeValue: number;
  requiresOvertimeReason: boolean;
  isLate?: boolean;        // 遅刻判定
  isEarlyLeave?: boolean;  // 早退判定
}

export type EmploymentType = 'REGULAR' | 'PART_TIME' | 'SHORT_TIME';

export const DEFAULT_SETTINGS: CalcSettings = {
  standardWorkHours: 7.75,
  breakThresholdHours: 6,
  breakDeductionHours: 0.75,
  overtimeThresholdTime: '17:30',
  overtimeUnitMinutes: 15,
  shortTimeEnd: '16:30',
};

/**
 * 時刻文字列("HH:MM")を分に変換
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 指定単位(分)で切り捨て → 時間（h）に変換
 * 例: 0.30h (18分) → 15分単位切り捨て → 0.25h (15分)
 */
function floorToUnit(hours: number, unitMinutes: number): number {
  const totalMinutes = hours * 60;
  const floored = Math.floor(totalMinutes / unitMinutes) * unitMinutes;
  return floored / 60;
}

/**
 * メインの勤務計算ロジック
 *
 * ルール:
 * - 休憩: 拘束時間 ≥ 6h なら 0.75h (45分) 自動控除
 * - 残業: 実労働 > 7.75h AND 退勤 ≥ 17:30 の場合のみ発生
 * - 残業単位: 15分単位切り捨て (0.25, 0.5, 0.75, 1.0...)
 * - 時短: 16:30退勤→-1.0, 17:30退勤→0, 17:30以降→残業計算
 * - パート: 実労働時間のみ記録
 * - 例外: 短時間勤務（12:30出勤→18:00退勤等）は実労働≤7.75hなら残業0
 */
export function calculateAttendance(
  clockIn: string,   // "HH:MM"
  clockOut: string,  // "HH:MM"
  employmentType: EmploymentType,
  settings: CalcSettings = DEFAULT_SETTINGS,
  baseStartTime?: string, // 基準開始時刻
  baseEndTime?: string,    // 基準終了時刻
  hourlyLeave: number = 0  // 時間有休（時間）
): AttendanceCalcResult {
  const inMinutes = timeToMinutes(clockIn);
  const outMinutes = timeToMinutes(clockOut || clockIn); // 退勤未入力時は出勤時刻を仮入れ

  // 1. 拘束時間（時間）
  const totalHours = clockOut ? (outMinutes - inMinutes) / 60 : 0;

  // 2. 休憩判定
  const breakHours = totalHours >= settings.breakThresholdHours
    ? settings.breakDeductionHours
    : 0;

  // 3. 実労働時間
  const actualWorkHours = totalHours - breakHours;

  // 4. 雇用区分別計算
  let overtimeHours = 0;
  let shortTimeValue = 0;
  let requiresOvertimeReason = false;
  let isLate = false;
  let isEarlyLeave = false;

  const clockOutMinutes = outMinutes;
  const overtimeThresholdMinutes = timeToMinutes(settings.overtimeThresholdTime);
  const shortTimeEndMinutes = timeToMinutes(settings.shortTimeEnd);

  // 遅刻・早退判定（自動判定機能は廃止され、備考欄ベースの手動運用へ移行）
  isLate = false;
  isEarlyLeave = false;

  switch (employmentType) {
    case 'REGULAR':
      if (
        actualWorkHours > settings.standardWorkHours &&
        clockOutMinutes >= overtimeThresholdMinutes
      ) {
        const rawOvertime = actualWorkHours - settings.standardWorkHours;
        overtimeHours = floorToUnit(rawOvertime, settings.overtimeUnitMinutes);
        requiresOvertimeReason = overtimeHours > 0;
      }
      break;

    case 'SHORT_TIME':
      if (clockOutMinutes <= shortTimeEndMinutes) {
        // 16:30以前に退勤 → 時短値 -1.0
        shortTimeValue = -1.0;
      } else if (clockOutMinutes <= overtimeThresholdMinutes) {
        // 16:31〜17:30 → 時短値 0
        shortTimeValue = 0;
      } else {
        // 17:30以降 → 残業計算
        shortTimeValue = 0;
        if (actualWorkHours > settings.standardWorkHours) {
          const rawOvertime = actualWorkHours - settings.standardWorkHours;
          overtimeHours = floorToUnit(rawOvertime, settings.overtimeUnitMinutes);
          requiresOvertimeReason = overtimeHours > 0;
        }
      }
      break;

    case 'PART_TIME':
      // パートは実労働時間の記録のみ
      break;
  }

  return {
    actualWorkHours: Math.round(actualWorkHours * 100) / 100,
    breakHours,
    overtimeHours,
    shortTimeValue,
    requiresOvertimeReason,
    isLate,
    isEarlyLeave,
  };
}

/**
 * 締め日から集計期間を計算
 * 例: closingDay=10, year=2026, month=3
 *   → 2026/2/11 〜 2026/3/10
 */
export function getClosingPeriod(
  year: number,
  month: number,
  closingDay: number
): { startDate: string; endDate: string; label: string } {
  // 終了日: 当月の締め日
  const endDate = new Date(year, month - 1, closingDay);

  // 開始日: 前月の締め日+1
  const startDate = new Date(year, month - 2, closingDay + 1);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const label = `${startDate.getMonth() + 1}/${startDate.getDate()}〜${endDate.getMonth() + 1}/${endDate.getDate()}`;

  return {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    label,
  };
}

/**
 * 日本の年度（4月1日〜3月31日）を計算
 * @param dateStr "YYYY-MM-DD"形式の文字列またはDateオブジェクト
 * @returns 年度(number)
 */
export function getFiscalYear(dateStr: string | Date): number {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  // 4月以降なら当年、3月以前なら前年が年度
  return month >= 4 ? year : year - 1;
}

/**
 * 感染症特休の種別判定
 * 3日まで特休、4日目以降は有休に自動切替
 */
export function determineSickLeaveType(
  existingSickDays: number,
  maxSickLeaveDays: number = 3
): {
  leaveType: 'SPECIAL_SICK' | 'FULL_DAY';
  sickDayNumber: number;
  isAutoConverted: boolean;
  message: string;
} {
  const nextDay = existingSickDays + 1;

  if (nextDay <= maxSickLeaveDays) {
    return {
      leaveType: 'SPECIAL_SICK',
      sickDayNumber: nextDay,
      isAutoConverted: false,
      message: `感染症特休 ${nextDay}/${maxSickLeaveDays}日目`,
    };
  } else {
    return {
      leaveType: 'FULL_DAY',
      sickDayNumber: nextDay,
      isAutoConverted: true,
      message: `特休上限超過のため有休に切替（${nextDay}日目）`,
    };
  }
}

/**
 * 日付の配列を生成（集計期間用）
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 曜日を取得
 */
export function getDayOfWeek(dateStr: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(dateStr);
  return days[d.getDay()];
}

/**
 * 週末かどうかを判定
 */
export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}

/**
 * その日、その職員に適用される有効な勤務時間を取得する
 * 1. 特別勤務設定 (Schedule) があれば優先
 * 2. なければ職員マスターのデフォルト
 */
export async function getEffectiveSchedule(staffId: string, date: string) {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      defaultStart: true,
      defaultEnd: true,
      employmentType: true,
      assignedClass: true,
      orgId: true,
    } as any
  });

  if (!staff) return null;

  // その日の特別設定を探す（isWorkOverride = true のもの）
  const allSchedules = await prisma.schedule.findMany({
    where: {
      orgId: staff.orgId,
      date: date,
    } as any
  });
  const overrides = allSchedules.filter((s: any) => s.isWorkOverride === true);

  // 適用順序: CLASS > 雇用形態 > ALL
  let bestOverride: any = null;

  // 1. クラス指定
  if ((staff as any).assignedClass) {
    bestOverride = overrides.find(o => (o as any).targetType === 'CLASS' && (o as any).targetValue === (staff as any).assignedClass);
  }

  // 2. 雇用形態指定
  if (!bestOverride) {
    bestOverride = overrides.find(o => (o as any).targetType === staff.employmentType);
  }

  // 3. 全体設定
  if (!bestOverride) {
    bestOverride = overrides.find(o => (o as any).targetType === 'ALL');
  }

  if (bestOverride && bestOverride.startTime && bestOverride.endTime) {
    return {
      startTime: bestOverride.startTime,
      endTime: bestOverride.endTime,
      isOverride: true,
      title: bestOverride.title,
    };
  }

  return {
    startTime: staff.defaultStart,
    endTime: staff.defaultEnd,
    isOverride: false,
    title: null,
  };
}

/**
 * 備考欄（Memo）から休暇情報をパースして抽出する
 * ルール:
 * - 「有休」 または 「全休」: 1日有休
 * - 「特休」: 1日特休
 * - 「時間有休 Xh」 (Xは数字、全角半角問わず): X時間の時間有休
 */
export function extractLeaveFromMemo(memo: string | null | undefined): { 
  type: 'FULL_DAY' | 'HALF_DAY' | 'SPECIAL' | 'HOURLY' | null; 
  hours?: number; 
} | null {
  if (!memo) return null;

  // 時間有休の判定 (例: 時間有休 2h, 時間有休2.5h, 時間有給 2h)
  // 正規表現で「時間[有休|有給]\s*(\d+(?:\.\d+)?)[hHＨ]」を抽出
  const hourlyMatch = memo.match(/時間(?:有休|有給)\s*([0-9０-９]+(?:\.[0-9０-９]+)?)\s*[hHｈＨ]/);
  if (hourlyMatch) {
    // 全角数字を半角に変換
    const hoursStr = hourlyMatch[1].replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
    const hours = parseFloat(hoursStr);
    if (!isNaN(hours) && hours > 0) {
      return { type: 'HOURLY', hours };
    }
  }

  // 全日有休・半休・特休の判定
  if (memo.includes("有休") || memo.includes("全休")) {
    // 「有休」が含まれていて、かつ「半」が含まれている場合は半休
    if (memo.includes("半")) {
      return { type: 'HALF_DAY' };
    }
    return { type: 'FULL_DAY' };
  }

  if (memo.includes("半休")) {
    return { type: 'HALF_DAY' };
  }
  
  if (memo.includes("特休")) {
    return { type: 'SPECIAL' };
  }

  return null;
}
