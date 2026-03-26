"use client";
import { useState, useEffect, useCallback } from "react";
import type { UserSession } from "@/app/page";
import styles from "./AttendanceHistory.module.css";

interface DayRecord {
    date: string;
    dayOfWeek: number;
    attendance: {
        clockIn: string | null;
        clockOut: string | null;
        actualWorkHours: number;
        breakHours: number;
        overtimeHours: number;
        overtimeReason: string | null;
        overtimeMemo: string | null;
        shortTimeValue: number;
        mealCount: number;
        hourlyLeave: number;
        dayType: string;
        status: string;
        memo: string | null;
        specialLeaveNote: string | null;
        isLate: boolean;
        isEarlyLeave: boolean;
        dutyType?: string | null;
    } | null;
    leave: {
        leaveType: string;
        leaveHours: number | null;
        sickDayNumber: number | null;
        reason: string | null;
    } | null;
    effectiveSchedule: {
        title: string;
        startTime: string;
        endTime: string;
    } | null;
}

interface HistoryData {
    period: {
        year: number;
        month: number;
        closingDay: number;
        startDate: string;
        endDate: string;
        label: string;
    };
    staff: {
        id: string;
        name: string;
        employeeNo: string;
        employmentType: string;
    };
    days: DayRecord[];
    summary: {
        workDays: number;
        totalWorkHours: number;
        totalOvertime: number;
        totalShortTime: number;
        publicHolidays: number;
        paidLeave: number;
        sickLeave: number;
        totalHourlyLeave: number;
        totalMeals: number;
        lateCount: number;
        earlyLeaveCount: number;
    };
    error?: string;
}

interface Props {
    user: UserSession;
    highlightDate?: string | null;
    onClearHighlight?: () => void;
}

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
const OVERTIME_REASONS = ["くま1", "くま2", "くま3", "くま4", "くま5", "くま6", "会議", "行事準備", "その他"];

interface Duty {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

export default function AttendanceHistory({ user, highlightDate, onClearHighlight }: Props) {
    const [data, setData] = useState<HistoryData | null>(null);
    const [loading, setLoading] = useState(true);

    const getInitialYM = () => {
        if (highlightDate) {
            const d = new Date(highlightDate);
            return { y: d.getFullYear(), m: d.getMonth() + 1 };
        }
        const now = new Date();
        const dNum = now.getDate();
        let y = now.getFullYear();
        let m = now.getMonth() + 1;
        // 10日締めなので11日からは翌月分
        if (dNum > 10) {
            m += 1;
            if (m > 12) { m = 1; y += 1; }
        }
        return { y, m };
    };

    const initial = getInitialYM();
    const [year, setYear] = useState(initial.y);
    const [month, setMonth] = useState(initial.m);

    const [editingDay, setEditingDay] = useState<DayRecord | null>(null);
    const [editClockIn, setEditClockIn] = useState("");
    const [editClockOut, setEditClockOut] = useState("");
    const [editReason, setEditReason] = useState("");
    const [editMealCount, setEditMealCount] = useState(0);
    const [editMemo, setEditMemo] = useState("");
    const [editOvertimeReason, setEditOvertimeReason] = useState("");
    const [editDutyType, setEditDutyType] = useState("NONE");
    const [editOvertimeMemo, setEditOvertimeMemo] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [duties, setDuties] = useState<Duty[]>([]);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/attendance/history?year=${year}&month=${month}`);
            const d = await res.json();
            setData(d);
            
            // ついでに当番マスターも取得
            const dRes = await fetch("/api/admin/duty");
            const dData = await dRes.json();
            if (dData.duties) setDuties(dData.duties);
        } catch {
            // エラー処理
        }
        setLoading(false);
    }, [year, month]);

    const handleSaveEdit = async () => {
        if (!editingDay) return;
        setEditSaving(true);
        const finalOvertimeReason = editOvertimeReason;

        try {
            const res = await fetch("/api/attendance/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: editingDay.date,
                    clockIn: editClockIn || null,
                    clockOut: editClockOut || null,
                    reason: editReason,
                    mealCount: editMealCount,
                    memo: editMemo,
                    overtimeReason: finalOvertimeReason || null,
                    dutyType: editDutyType,
                    overtimeMemo: editOvertimeMemo || null
                }),
            });
            if (res.ok) {
                setEditingDay(null);
                if (onClearHighlight) onClearHighlight();
                fetchHistory(); // 再取得
            } else {
                alert("エラーが発生しました");
            }
        } catch (e) {
            alert("通信エラーが発生しました");
        }
        setEditSaving(false);
    };

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    function prevMonth() {
        if (month === 1) { setYear(year - 1); setMonth(12); }
        else setMonth(month - 1);
    }

    function nextMonth() {
        if (month === 12) { setYear(year + 1); setMonth(1); }
        else setMonth(month + 1);
    }

    function getDayTypeLabel(day: DayRecord): string {
        if (day.attendance?.dayType === "PUBLIC_HOLIDAY") return "特休";
        if (day.attendance?.dayType === "SPECIAL_SICK") return "感染特休";
        if (day.leave?.leaveType === "FULL_DAY") return "有休";
        if (day.leave?.leaveType === "HALF_DAY") return "半休";
        if (day.leave?.leaveType === "HOURLY") return `時間休 ${day.leave.leaveHours}h`;
        if (day.leave?.leaveType === "SPECIAL_OTHER") return "特休";
        if (day.leave?.leaveType === "SPECIAL_SICK") {
            return `感染特休${day.leave.sickDayNumber ? ` ${day.leave.sickDayNumber}/3` : ""}`;
        }
        return "";
    }

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>読み込み中...</p>
            </div>
        );
    }

    if (!data) return null;

    if (data.error) {
        return (
            <div className={styles.container}>
                <div className={styles.monthNav}>
                    <button className={styles.navBtn} onClick={prevMonth}>◀</button>
                    <div className={styles.monthLabel}>
                        <span className={styles.monthYear}>{year}年</span>
                        <span className={styles.monthNumber}>{month}月</span>
                    </div>
                    <button className={styles.navBtn} onClick={nextMonth}>▶</button>
                </div>
                <div className={styles.infoBox} style={{ color: "var(--color-danger)" }}>
                    {data.error}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* 月ナビゲーション */}
            <div className={styles.monthNav}>
                <button className={styles.navBtn} onClick={prevMonth}>◀</button>
                <div className={styles.monthLabel}>
                    <span className={styles.monthYear}>{year}年</span>
                    <span className={styles.monthNumber}>{month}月</span>
                    <span className={styles.periodLabel}>({data.period?.label})</span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                    <button className={styles.navBtn} onClick={nextMonth} aria-label="翌月">▶</button>
                    <button className={styles.printBtn} onClick={() => window.print()} title="印刷・PDF保存">🖨️ 印刷</button>
                </div>
            </div>

            {/* 職員情報 */}
            <div className={styles.staffInfo}>
                <span className={styles.staffName}>{data.staff?.name}</span>
                <span className={styles.staffType}>
                    {data.staff?.employmentType === "REGULAR" && "正規"}
                    {data.staff?.employmentType === "SHORT_TIME" && "時短"}
                    {data.staff?.employmentType === "PART_TIME" && "パート"}
                </span>
            </div>

            {/* 集計サマリーカード */}
            <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>出勤</span>
                    <span className={styles.summaryValue}>{data.summary?.workDays || 0}日</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>実労働</span>
                    <span className={styles.summaryValue}>{data.summary?.totalWorkHours.toFixed(1) || "0.0"}h</span>
                </div>
                {user.employmentType !== "PART_TIME" && data.summary && (
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>残業</span>
                        <span className={styles.summaryValue} style={data.summary.totalOvertime > 0 ? { color: "var(--color-danger)" } : {}}>
                            {data.summary.totalOvertime.toFixed(2)}h
                        </span>
                    </div>
                )}
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>食事</span>
                    <span className={styles.summaryValue}>{data.summary?.totalMeals || 0}回</span>
                </div>
            </div>

            {/* 勤怠テーブル */}
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.thDate}>日付</th>
                            <th className={styles.thDay}>曜</th>
                            <th>出勤</th>
                            <th>退勤</th>
                            {user.employmentType !== "PART_TIME" && <th>残業</th>}
                            {user.employmentType === "SHORT_TIME" && <th>時短</th>}
                            <th>休憩</th>
                            <th>食事</th>
                            <th>備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.days.map((day) => {
                            const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                            const isSunday = day.dayOfWeek === 0;
                            const isSaturday = day.dayOfWeek === 6;
                            const dayLabel = getDayTypeLabel(day);
                            const hasAttendance = day.attendance && day.attendance.status !== "MISSING";
                            const dateNum = new Date(day.date).getDate();

                            const isHighlighted = day.date === highlightDate;
                            const memoText = day.attendance?.memo || "";
                            const isLateMemo = memoText.includes("遅刻");
                            const isEarlyMemo = memoText.includes("早退");
                            const isHighlightedRow = isLateMemo || isEarlyMemo;

                            return (
                                <tr
                                    key={day.date}
                                    className={`${isWeekend ? styles.weekendRow : ""} ${dayLabel ? styles.leaveRow : ""}`}
                                    onClick={() => {
                                        setEditingDay(day);
                                        setEditClockIn(day.attendance?.clockIn || "");
                                        setEditClockOut(day.attendance?.clockOut || "");
                                        setEditMealCount(day.attendance?.mealCount || 0);
                                        setEditMemo(day.attendance?.memo || "");
                                        setEditOvertimeReason(day.attendance?.overtimeReason || "");
                                        setEditDutyType(day.attendance?.dutyType || "NONE");
                                        setEditOvertimeMemo(day.attendance?.overtimeMemo || "");
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        ...(isHighlighted ? { border: "3px solid var(--color-danger)", backgroundColor: "rgba(231, 76, 60, 0.1)" } : {}),
                                        ...(isHighlightedRow ? { backgroundColor: "rgba(231, 76, 60, 0.05)" } : {})
                                    }}
                                    title="クリックして打刻を修正"
                                >
                                    <td className={styles.tdDate}>{dateNum}</td>
                                    <td className={`${styles.tdDay} ${isSunday ? styles.sunday : ""} ${isSaturday ? styles.saturday : ""}`}>
                                        {DAY_NAMES[day.dayOfWeek]}
                                    </td>
                                    <td>{hasAttendance ? day.attendance?.clockIn || "—" : "—"}</td>
                                    <td>{hasAttendance ? day.attendance?.clockOut || "—" : "—"}</td>
                                    {user.employmentType !== "PART_TIME" && (
                                        <td className={day.attendance && day.attendance.overtimeHours > 0 ? styles.overtime : ""}>
                                            {hasAttendance && day.attendance!.overtimeHours > 0 ? day.attendance!.overtimeHours.toFixed(2) : "—"}
                                        </td>
                                    )}
                                    {user.employmentType === "SHORT_TIME" && (
                                        <td>
                                            {hasAttendance && day.attendance!.shortTimeValue !== 0 ? day.attendance!.shortTimeValue : "—"}
                                        </td>
                                    )}
                                    <td>{hasAttendance && day.attendance!.breakHours > 0 ? `${day.attendance!.breakHours}h` : "—"}</td>
                                    <td>{hasAttendance && day.attendance!.clockIn ? (day.attendance!.mealCount > 0 ? "○" : "✗") : "—"}</td>
                                    <td className={styles.tdMemo}>
                                        {dayLabel && <span className={styles.leaveTag}>{dayLabel}</span>}
                                         {day.effectiveSchedule?.title && (
                                             <span style={{ fontSize: "0.8em", color: "var(--color-accent-dark)", background: "rgba(212, 149, 106, 0.1)", padding: "1px 4px", borderRadius: "4px", marginRight: "4px" }}>
                                                 🚩 {day.effectiveSchedule.title}
                                             </span>
                                         )}
                                         {day.attendance?.dutyType && day.attendance.dutyType !== 'NONE' && (
                                             <span style={{ fontSize: "0.8em", color: "var(--color-primary)", background: "rgba(52, 152, 219, 0.1)", padding: "1px 4px", borderRadius: "4px", marginRight: "4px" }}>
                                                 {day.attendance.dutyType === 'EARLY' ? '☀️ 早当' : (day.attendance.dutyType === 'LATE' ? '🌛 遅当' : `💼 ${day.attendance.dutyType}`)}
                                             </span>
                                         )}
                                        {day.attendance?.overtimeReason && (
                                            <span style={{ fontSize: "0.8em", color: "var(--color-danger)", marginRight: "4px" }}>
                                                [{day.attendance.overtimeReason}]
                                            </span>
                                        )}
                                        {isLateMemo && (
                                            <span style={{ fontSize: "0.8em", color: "var(--color-danger)", background: "rgba(231, 76, 60, 0.1)", padding: "1px 4px", borderRadius: "4px", marginRight: "4px", fontWeight: "bold" }}>
                                                遅刻
                                            </span>
                                        )}
                                        {isEarlyMemo && (
                                            <span style={{ fontSize: "0.8em", color: "var(--color-danger)", background: "rgba(231, 76, 60, 0.1)", padding: "1px 4px", borderRadius: "4px", marginRight: "4px", fontWeight: "bold" }}>
                                                早退
                                            </span>
                                        )}
                                        {day.attendance?.overtimeMemo && (
                                            <span style={{ fontSize: "0.8em", marginRight: "4px" }}>
                                                {day.attendance.overtimeMemo}
                                            </span>
                                        )}
                                        {day.attendance?.memo && <span>{day.attendance.memo}</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 合計行 */}
            <div className={styles.totalRow}>
                <div className={styles.totalItem}>
                    <span>出勤</span><strong>{data.summary.workDays}日</strong>
                </div>
                <div className={styles.totalItem}>
                    <span>実労働</span><strong>{data.summary.totalWorkHours.toFixed(1)}h</strong>
                </div>
                {user.employmentType !== "PART_TIME" && (
                    <div className={styles.totalItem}>
                        <span>残業</span><strong>{data.summary.totalOvertime.toFixed(2)}h</strong>
                    </div>
                )}
                <div className={styles.totalItem}>
                    <span>特休</span><strong>{data.summary.publicHolidays}日</strong>
                </div>
                <div className={styles.totalItem}>
                    <span>有休</span><strong>{data.summary.paidLeave}日</strong>
                </div>
                <div className={styles.totalItem}>
                    <span>時間有休</span><strong>{data.summary.totalHourlyLeave}h</strong>
                </div>
                <div className={styles.totalItem}>
                    <span>食事</span><strong>{data.summary.totalMeals}回</strong>
                </div>
                <div className={styles.totalItem}>
                    <span>遅刻</span><strong>{data.summary.lateCount || 0}回</strong>
                </div>
                <div className={styles.totalItem}>
                    <span>早退</span><strong>{data.summary.earlyLeaveCount || 0}回</strong>
                </div>
            </div>

            {/* 打刻修正モーダル */}
            {editingDay && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000,
                    display: "flex", justifyContent: "center", alignItems: "center"
                }}>
                    <div style={{
                        background: "white", padding: "var(--space-lg)", borderRadius: "var(--radius-lg)",
                        width: "90%", maxWidth: "400px", boxShadow: "var(--shadow-lg)",
                        maxHeight: "90vh", overflowY: "auto"
                    }}>
                        <h3 style={{ marginBottom: "var(--space-md)", fontSize: "1.2rem", fontWeight: "bold" }}>打刻の修正 ({editingDay.date})</h3>
                        <div style={{ marginBottom: "var(--space-md)" }}>
                            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>出勤時間</label>
                            <input
                                type="time"
                                className="input"
                                value={editClockIn}
                                onChange={(e) => setEditClockIn(e.target.value)}
                            />
                        </div>
                        <div style={{ marginBottom: "var(--space-md)" }}>
                            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>退勤時間</label>
                            <input
                                type="time"
                                className="input"
                                value={editClockOut}
                                onChange={(e) => setEditClockOut(e.target.value)}
                            />
                        </div>

                        {/* 当番（修正時のみ表示） */}
                        <div style={{ marginBottom: "var(--space-md)" }}>
                            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>当番</label>
                             <select
                                 className="select"
                                 value={editDutyType || "NONE"}
                                 onChange={(e) => setEditDutyType(e.target.value)}
                             >
                                 <option value="NONE">なし</option>
                                 {duties.map((opt) => (
                                     <option key={opt.id} value={opt.name}>{opt.name}</option>
                                 ))}
                             </select>
                        </div>

                        {user.employmentType !== "PART_TIME" && (
                            <div style={{ marginBottom: "var(--space-md)", background: "var(--bg-card-hover)", padding: "var(--space-sm)", borderRadius: "var(--radius-md)" }}>
                                <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>残業理由（任意）</label>
                                <select
                                    className="select"
                                    value={editOvertimeReason}
                                    onChange={(e) => setEditOvertimeReason(e.target.value)}
                                    style={{ marginBottom: editOvertimeReason ? "var(--space-sm)" : 0 }}
                                >
                                    <option value="">（残業なしの場合は空欄）</option>
                                    {OVERTIME_REASONS.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>

                                {editOvertimeReason && (
                                    <div>
                                        <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "2px" }}>詳細メモ</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="詳細を入力"
                                            value={editOvertimeMemo}
                                            onChange={(e) => setEditOvertimeMemo(e.target.value)}
                                            style={{ padding: "8px" }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ marginBottom: "var(--space-md)" }}>
                            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>食事</label>
                            <div className="toggle-group" style={{ display: "flex", gap: "var(--space-sm)" }}>
                                <button
                                    className={`toggle-btn ${editMealCount > 0 ? "active" : ""}`}
                                    onClick={() => setEditMealCount(1)}
                                >
                                    🟢 あり
                                </button>
                                <button
                                    className={`toggle-btn ${editMealCount === 0 ? "active" : ""}`}
                                    onClick={() => setEditMealCount(0)}
                                >
                                    ⚪ なし
                                </button>
                            </div>
                        </div>
                        <div style={{ marginBottom: "var(--space-md)" }}>
                            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>備考欄</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="備考を入力"
                                value={editMemo}
                                onChange={(e) => setEditMemo(e.target.value)}
                            />
                        </div>
                        <div style={{ marginBottom: "var(--space-lg)" }}>
                            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>修正理由</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="打刻忘れなど"
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                            />
                        </div>
                        <div style={{ display: "flex", gap: "var(--space-md)", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => setEditingDay(null)}
                                style={{
                                    padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)",
                                    background: "var(--bg-main)", color: "var(--text-primary)", border: "none", cursor: "pointer"
                                }}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={editSaving}
                                style={{
                                    padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)",
                                    background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer"
                                }}
                            >
                                {editSaving ? "保存中..." : "保存する"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
