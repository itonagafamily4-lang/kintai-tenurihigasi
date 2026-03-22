"use client";
import { useState, useEffect, useCallback } from "react";
import { UserSession } from "@/app/page";
import styles from "./Calendar.module.css";

interface CalendarProps {
    user: UserSession;
    mode?: "default" | "selector";
    onSelectDate?: (dateStr: string) => void;
}

interface DayData {
    date: string;
    dayOfWeek: number;
    attendance: {
        clockIn: string | null;
        clockOut: string | null;
        actualWorkHours: number;
        overtimeHours: number;
        breakHours: number;
        shortTimeValue: number;
        mealCount: number;
        hourlyLeave: number;
        dayType: string;
        status: string;
        memo: string | null;
    } | null;
    leave: {
        leaveType: string;
        leaveHours: number | null;
        leaveStartTime?: string | null;
        leaveEndTime?: string | null;
        halfDayPeriod: string | null;
        reason: string | null;
        status: string;
    } | null;
}

interface TeamLeaveEntry {
    staffName: string;
    employeeNo: string;
    leaveType: string;
    halfDayPeriod: string | null;
    leaveHours: number | null;
    leaveStartTime?: string | null;
    leaveEndTime?: string | null;
    reason: string | null;
}

interface CalendarEvent {
    title: string;
    description: string | null;
    isAllDay: boolean;
    startTime: string | null;
    endTime: string | null;
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
    days: DayData[];
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
}

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function getStatusInfo(dayData: DayData) {
    // 休暇データがある場合は休暇を優先表示
    if (dayData.leave) {
        const lv = dayData.leave;
        switch (lv.leaveType) {
            case "FULL_DAY": return { label: "有休", type: "leave" };
            case "HALF_DAY": return { label: `半休(${lv.halfDayPeriod === "AM" ? "午前" : "午後"})`, type: "leave" };
            case "HOURLY": return { label: "時間有給", type: "leave" };
            case "SPECIAL_OTHER": return { label: "特休", type: "holiday" };
            case "SPECIAL_SICK": return { label: "感染症特休", type: "sick" };
            default: return { label: "休暇", type: "leave" };
        }
    }
    if (dayData.attendance) {
        const att = dayData.attendance;
        if (att.dayType === "PUBLIC_HOLIDAY") return { label: "特休", type: "holiday" };
        if (att.dayType === "SPECIAL_SICK") return { label: "感染症特休", type: "sick" };
        // メモに「有休」が含まれている場合は有休として表示
        if (att.memo && att.memo.includes("有休")) return { label: "有休", type: "leave" };
        if (att.status === "MISSING") return { label: "打刻忘れ", type: "missing" };
        if (att.status === "CLOCKED_IN") return { label: "出勤中", type: "clockedIn" };
        if (att.status === "COMPLETED") return { label: "出勤", type: "work" };
        return { label: att.status, type: "work" };
    }
    return null;
}

export default function Calendar({ user, mode = "default", onSelectDate }: CalendarProps) {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [historyData, setHistoryData] = useState<HistoryData | null>(null);
    const [teamLeaves, setTeamLeaves] = useState<Record<string, TeamLeaveEntry[]>>({});
    const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent[]>>({});
    const [holidays, setHolidays] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [historyRes, teamRes, eventsRes, holidaysRes] = await Promise.all([
                fetch(`/api/attendance/history?year=${currentYear}&month=${currentMonth}&mode=calendar`),
                fetch(`/api/leave/team?year=${currentYear}&month=${currentMonth}`),
                fetch(`/api/calendar/events?year=${currentYear}&month=${currentMonth}`),
                fetch(`/api/calendar/holidays?year=${currentYear}`)
            ]);

            const historyJson = await historyRes.json();
            if (!historyJson.error) setHistoryData(historyJson);

            const teamJson = await teamRes.json();
            setTeamLeaves(teamJson.teamLeaves || {});

            const eventsJson = await eventsRes.json();
            setCalendarEvents(eventsJson.events || {});

            const holidaysJson = await holidaysRes.json();
            setHolidays(holidaysJson.holidays || {});
        } catch (error) {
            console.error("Calendar data fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [currentYear, currentMonth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    function goToPrevMonth() {
        if (currentMonth === 1) {
            setCurrentMonth(12);
            setCurrentYear(currentYear - 1);
        } else {
            setCurrentMonth(currentMonth - 1);
        }
        setSelectedDate(null);
    }

    function goToNextMonth() {
        if (currentMonth === 12) {
            setCurrentMonth(1);
            setCurrentYear(currentYear + 1);
        } else {
            setCurrentMonth(currentMonth + 1);
        }
        setSelectedDate(null);
    }

    // カレンダー用データ構築
    function buildCalendarDays() {
        const year = currentYear;
        const month = currentMonth;
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        const days: Array<{ date: string | null; dayOfWeek: number; dayNum: number | null }> = [];

        // 先頭の空白
        for (let i = 0; i < startDayOfWeek; i++) {
            days.push({ date: null, dayOfWeek: i, dayNum: null });
        }

        // 日付
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(year, month - 1, d);
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            days.push({ date: dateStr, dayOfWeek: dt.getDay(), dayNum: d });
        }

        return days;
    }

    function getDayData(dateStr: string): DayData | undefined {
        if (!historyData) return undefined;
        return historyData.days.find(d => d.date === dateStr);
    }

    function getIndicators(dateStr: string) {
        const dayData = getDayData(dateStr);
        const indicators: string[] = [];

        if (dayData) {
            // 休暇データを優先
            if (dayData.leave) {
                if (dayData.leave.leaveType === "SPECIAL_OTHER") indicators.push("holiday");
                else if (dayData.leave.leaveType === "SPECIAL_SICK") indicators.push("sick");
                else indicators.push("leave");
            } else if (dayData.attendance) {
                const att = dayData.attendance;
                if (att.dayType === "PUBLIC_HOLIDAY") indicators.push("holiday");
                else if (att.dayType === "SPECIAL_SICK") indicators.push("sick");
                else if (att.memo && att.memo.includes("有休")) indicators.push("leave");
                else if (att.status === "MISSING") indicators.push("missing");
                else if (att.status === "CLOCKED_IN") indicators.push("clockIn");
                else if (att.status === "COMPLETED") indicators.push("work");
            }
        }
        // チームメンバーの休暇
        if (teamLeaves[dateStr] && teamLeaves[dateStr].length > 0) {
            if (!indicators.includes("teamLeave")) indicators.push("teamLeave");
        }
        // Googleカレンダーイベント
        if (calendarEvents[dateStr] && calendarEvents[dateStr].length > 0) {
            if (!indicators.includes("event")) indicators.push("event");
        }
        return indicators;
    }

    const todayStr = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    })();

    const calendarDays = buildCalendarDays();
    const selectedDayData = selectedDate ? getDayData(selectedDate) : null;

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
                        カレンダーを読み込み中...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* ヘッダー */}
            <div className={styles.header}>
                <button className={styles.navButton} onClick={goToPrevMonth}>
                    ◀
                </button>
                <div style={{ textAlign: "center" }}>
                    <div className={styles.headerTitle}>
                        {currentYear}年{currentMonth}月
                    </div>
                    {mode !== "selector" && (
                        <div className={styles.headerSubtitle}>
                            {user.name}の勤怠カレンダー
                        </div>
                    )}
                </div>
                <button className={styles.navButton} onClick={goToNextMonth}>
                    ▶
                </button>
            </div>

            {/* 凡例 */}
            <div className={styles.legend}>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotWork}`}></div>
                    <span>出勤</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotLeave}`}></div>
                    <span>有休</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotTeamLeave}`}></div>
                    <span>他の人休</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotEvent}`}></div>
                    <span>行事</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotHoliday}`}></div>
                    <span>特休</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotSick}`}></div>
                    <span>感染症特休</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={`${styles.legendDot} ${styles.legendDotMissing}`}></div>
                    <span>打刻忘れ</span>
                </div>
            </div>

            {/* カレンダー本体 */}
            <div className={styles.calendarCard}>
                <div className={styles.weekHeader}>
                    {DAY_NAMES.map((name, i) => (
                        <div key={i} className={styles.weekDay}>{name}</div>
                    ))}
                </div>
                <div className={styles.calendarGrid}>
                    {calendarDays.map((day, idx) => {
                        if (!day.date) {
                            return <div key={idx} className={`${styles.dayCell} ${styles.dayCellEmpty}`}></div>;
                        }

                        const isToday = day.date === todayStr;
                        const isSunday = day.dayOfWeek === 0;
                        const isSaturday = day.dayOfWeek === 6;
                        const isSelected = day.date === selectedDate;
                        const holidayName = day.date ? holidays[day.date] : null;
                        const isHoliday = Boolean(holidayName);
                        const indicators = getIndicators(day.date);

                        const cellClasses = [
                            styles.dayCell,
                            isToday && styles.dayCellToday,
                            (isSunday || isHoliday) && styles.dayCellSunday,
                            isSaturday && !isHoliday && styles.dayCellSaturday,
                            isSelected && styles.dayCellSelected,
                        ].filter(Boolean).join(" ");

                        const numClasses = [
                            styles.dayNumber,
                            isToday && styles.dayNumberToday,
                            (isSunday || isHoliday) && styles.dayNumberSunday,
                            isSaturday && !isHoliday && styles.dayNumberSaturday,
                        ].filter(Boolean).join(" ");

                        return (
                            <div
                                key={idx}
                                className={cellClasses}
                                onClick={() => {
                                    if (mode === "selector" && day.date && onSelectDate) {
                                        onSelectDate(day.date);
                                    } else {
                                        setSelectedDate(day.date === selectedDate ? null : day.date);
                                    }
                                }}
                            >
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "2px" }}>
                                    <div className={numClasses}>{day.dayNum}</div>
                                    {holidayName && (
                                        <div style={{ fontSize: "0.55rem", color: "var(--color-danger)", whiteSpace: "nowrap", transform: "scale(0.9)" }}>
                                            {holidayName}
                                        </div>
                                    )}
                                </div>
                                {indicators.filter(t => t !== "teamLeave" && t !== "event").length > 0 && (
                                    <div className={styles.dayIndicators}>
                                        {indicators.filter(t => t !== "teamLeave" && t !== "event").map((type, i) => {
                                            const indicatorClass = {
                                                work: styles.indicatorWork,
                                                leave: styles.indicatorLeave,
                                                holiday: styles.indicatorHoliday,
                                                sick: styles.indicatorSick,
                                                missing: styles.indicatorMissing,
                                                clockIn: styles.indicatorClockIn,
                                            }[type as keyof typeof styles] || "";
                                            return <div key={i} className={`${styles.indicator} ${indicatorClass}`}></div>;
                                        })}
                                    </div>
                                )}
                                {calendarEvents[day.date] && calendarEvents[day.date].map((ev, i) => (
                                    <div key={`ev-${i}`} style={{
                                        fontSize: "0.65rem", padding: "2px", borderRadius: "2px",
                                        background: "var(--color-primary-light)", color: "var(--color-primary-dark)",
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                        marginTop: "2px", width: "95%", textAlign: "left", lineHeight: 1.1
                                    }}>
                                        {ev.title}
                                    </div>
                                ))}
                                {teamLeaves[day.date] && teamLeaves[day.date].map((tl, i) => (
                                    <div key={`tl-${i}`} style={{
                                        fontSize: "0.65rem", padding: "2px", borderRadius: "2px",
                                        background: "var(--color-warning-light)", color: "var(--color-warning-dark)",
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                        marginTop: "2px", width: "95%", textAlign: "left", lineHeight: 1.1
                                    }}>
                                        {tl.staffName}: {tl.leaveType === "HALF_DAY" ? "半休" : tl.leaveType === "HOURLY" ? "時間休" : "休"}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 選択した日の詳細パネル */}
            {selectedDate && (
                <div className={styles.detailPanel}>
                    <div className={styles.detailHeader}>
                        <div>
                            <span className={styles.detailDate}>
                                {parseInt(selectedDate.split("-")[1])}月{parseInt(selectedDate.split("-")[2])}日
                            </span>
                            <span className={styles.detailDayOfWeek}>
                                ({DAY_NAMES[new Date(selectedDate).getDay()]})
                            </span>
                        </div>
                        <button className={styles.detailClose} onClick={() => setSelectedDate(null)}>✕</button>
                    </div>
                    <div className={styles.detailBody}>
                        {selectedDayData ? (() => {
                            const statusInfo = getStatusInfo(selectedDayData);
                            return (
                                <>
                                    {statusInfo && (
                                        <div className={styles.detailRow}>
                                            <span className={styles.detailLabel}>ステータス</span>
                                            <span className={`${styles.statusBadge} ${statusInfo.type === "work" ? styles.statusWork :
                                                statusInfo.type === "leave" ? styles.statusLeave :
                                                    statusInfo.type === "holiday" ? styles.statusHoliday :
                                                        statusInfo.type === "sick" ? styles.statusSick :
                                                            statusInfo.type === "missing" ? styles.statusMissing : ""
                                                }`}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                    )}
                                    {selectedDayData.attendance && (
                                        <>
                                            {selectedDayData.attendance.clockIn && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>出勤</span>
                                                    <span className={styles.detailValue}>{selectedDayData.attendance.clockIn}</span>
                                                </div>
                                            )}
                                            {selectedDayData.attendance.clockOut && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>退勤</span>
                                                    <span className={styles.detailValue}>{selectedDayData.attendance.clockOut}</span>
                                                </div>
                                            )}
                                            {selectedDayData.attendance.actualWorkHours > 0 && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>実働時間</span>
                                                    <span className={styles.detailValue}>{selectedDayData.attendance.actualWorkHours.toFixed(1)}h</span>
                                                </div>
                                            )}
                                            {selectedDayData.attendance.overtimeHours > 0 && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>残業</span>
                                                    <span className={styles.detailValue}>{selectedDayData.attendance.overtimeHours.toFixed(1)}h</span>
                                                </div>
                                            )}
                                            {selectedDayData.attendance.breakHours > 0 && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>休憩</span>
                                                    <span className={styles.detailValue}>{selectedDayData.attendance.breakHours.toFixed(1)}h</span>
                                                </div>
                                            )}
                                            {selectedDayData.attendance.memo && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>メモ</span>
                                                    <span className={styles.detailValue}>{selectedDayData.attendance.memo}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {selectedDayData.leave && (
                                        <>
                                            {selectedDayData.leave.reason && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>理由</span>
                                                    <span className={styles.detailValue}>{selectedDayData.leave.reason}</span>
                                                </div>
                                            )}
                                            {selectedDayData.leave.leaveHours && (
                                                <div className={styles.detailRow}>
                                                    <span className={styles.detailLabel}>時間</span>
                                                    <span className={styles.detailValue}>
                                                        {selectedDayData.leave.leaveStartTime && selectedDayData.leave.leaveEndTime ? `${selectedDayData.leave.leaveStartTime}〜${selectedDayData.leave.leaveEndTime} ` : ""}
                                                        ({Math.floor(selectedDayData.leave.leaveHours) > 0 ? `${Math.floor(selectedDayData.leave.leaveHours)}時間` : ""}{selectedDayData.leave.leaveHours % 1 > 0 ? `${(selectedDayData.leave.leaveHours % 1) * 60}分` : ""})
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            );
                        })() : null}

                        {/* selectedDayDataが無い場合でも「他の人の休み」「行事」は表示する */}
                        {/* チームメンバーの休暇 */}
                        {selectedDate && teamLeaves[selectedDate] && teamLeaves[selectedDate].length > 0 && (
                            <div className={styles.teamLeaveSection}>
                                <div className={styles.teamLeaveTitle}>👥 他の職員の休暇</div>
                                {teamLeaves[selectedDate].map((tl, i) => (
                                    <div key={i} className={styles.teamLeaveItem}>
                                        <span className={styles.teamLeaveName}>{tl.staffName}</span>
                                        <span className={styles.teamLeaveType}>
                                            {tl.leaveType === "FULL_DAY" ? "全休" :
                                                tl.leaveType === "HALF_DAY" ? `半休(${tl.halfDayPeriod === "AM" ? "午前" : "午後"})` :
                                                    tl.leaveType === "HOURLY" ? `${tl.leaveStartTime && tl.leaveEndTime ? `${tl.leaveStartTime}〜${tl.leaveEndTime}` : `${Math.floor(tl.leaveHours || 0) > 0 ? `${Math.floor(tl.leaveHours || 0)}時間` : ""}${(tl.leaveHours || 0) % 1 > 0 ? `${((tl.leaveHours || 0) % 1) * 60}分` : ""}`}有給` :
                                                        tl.leaveType === "SPECIAL_SICK" ? "感染症特休" : "休暇"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Googleカレンダーイベント */}
                        {selectedDate && calendarEvents[selectedDate] && calendarEvents[selectedDate].length > 0 && (
                            <div className={styles.eventsSection}>
                                <div className={styles.eventsTitle}>📅 行事・イベント</div>
                                {calendarEvents[selectedDate].map((ev, i) => (
                                    <div key={i} className={styles.eventItem}>
                                        <span className={styles.eventDot}></span>
                                        <div>
                                            <div className={styles.eventName}>{ev.title}</div>
                                            {ev.startTime && (
                                                <div className={styles.eventTime}>
                                                    {ev.startTime}{ev.endTime ? ` 〜 ${ev.endTime}` : ""}
                                                </div>
                                            )}
                                            {ev.description && (
                                                <div className={styles.eventDesc}>{ev.description}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!selectedDayData &&
                            (!teamLeaves[selectedDate] || teamLeaves[selectedDate].length === 0) &&
                            (!calendarEvents[selectedDate] || calendarEvents[selectedDate].length === 0) && (
                                <div className={styles.noDetail}>
                                    この日のデータはありません
                                </div>
                            )}
                    </div>
                </div>
            )}

            {/* 月間サマリー */}
            {historyData && (
                <div className={styles.summaryCard}>
                    <div className={styles.summaryTitle}>
                        📊 {currentMonth}月の集計
                    </div>
                    <div className={styles.summaryGrid}>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>出勤日数</span>
                            <span className={styles.summaryItemValue}>{historyData.summary.workDays}日</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>総労働時間</span>
                            <span className={styles.summaryItemValue}>{historyData.summary.totalWorkHours.toFixed(1)}h</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>残業時間</span>
                            <span className={styles.summaryItemValue}>{historyData.summary.totalOvertime.toFixed(1)}h</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>有休使用</span>
                            <span className={styles.summaryItemValue}>{historyData.summary.paidLeave}日</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>特休</span>
                            <span className={styles.summaryItemValue}>{historyData.summary.publicHolidays}日</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>給食数</span>
                            <span className={styles.summaryItemValue}>{historyData.summary.totalMeals}食</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>遅刻</span>
                            <span className={styles.summaryItemValue}>{(historyData.summary as any).lateCount || 0}回</span>
                        </div>
                        <div className={styles.summaryItem}>
                            <span className={styles.summaryItemLabel}>早退</span>
                            <span className={styles.summaryItemValue}>{(historyData.summary as any).earlyLeaveCount || 0}回</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
