"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "./AdminPanel.module.css";

interface Schedule {
    id: string;
    date: string;
    title: string;
    startTime: string | null;
    endTime: string | null;
    type: string | null;
}

interface TeamLeaveEntry {
    staffName: string;
    employeeNo: string;
    leaveType: string;
    halfDayPeriod: string | null;
    leaveHours: number | null;
    reason: string | null;
}

interface Props {
    orgId?: string;
}

export default function CalendarAdmin({ orgId: initialOrgId }: Props) {
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [teamLeaves, setTeamLeaves] = useState<Record<string, TeamLeaveEntry[]>>({});
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Modal states
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [editingSchedule, setEditingSchedule] = useState<Partial<Schedule> | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            const currentOrgId = initialOrgId || "1";
            const [schedRes, teamRes] = await Promise.all([
                fetch(`/api/schedule?month=${year}-${String(month).padStart(2, '0')}&orgId=${currentOrgId}`),
                fetch(`/api/leave/team?year=${year}&month=${month}`)
            ]);

            const data = await schedRes.json();
            if (data.schedules) {
                setSchedules(data.schedules);
            }

            const teamData = await teamRes.json();
            if (teamData.teamLeaves) {
                setTeamLeaves(teamData.teamLeaves);
            }
        } catch {
        }
        setLoading(false);
    }, [year, month]);

    useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

    function prevMonth() {
        if (month === 1) { setYear(year - 1); setMonth(12); }
        else setMonth(month - 1);
    }

    function nextMonth() {
        if (month === 12) { setYear(year + 1); setMonth(1); }
        else setMonth(month + 1);
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setUploading(true);
        setMessage(null);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("orgId", initialOrgId || "1");

        try {
            const res = await fetch("/api/schedule/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: "success", text: `${data.count}件の予定をインポートしました！` });
                fetchSchedules();
            } else {
                setMessage({ type: "error", text: data.error });
            }
        } catch (error) {
            setMessage({ type: "error", text: "アップロードに失敗しました" });
        }
        setUploading(false);
        e.target.value = ""; // リセット
    }

    function handleExport() {
        const url = `/api/schedule/export?month=${year}-${String(month).padStart(2, '0')}`;
        window.open(url, "_blank");
    }

    function openNewModal(dateStr: string) {
        setSelectedDate(dateStr);
        setEditingSchedule({
            date: dateStr,
            title: "",
            startTime: "",
            endTime: "",
            type: ""
        });
    }

    function openEditModal(schedule: Schedule, e: React.MouseEvent) {
        e.stopPropagation(); // セルのクリックイベントを発火させない
        setSelectedDate(schedule.date);
        setEditingSchedule({ ...schedule });
    }

    function closeModal() {
        setSelectedDate(null);
        setEditingSchedule(null);
    }

    async function handleSaveSchedule() {
        if (!editingSchedule || !editingSchedule.title) {
            alert("タイトルは必須です");
            return;
        }

        setIsSaving(true);
        try {
            const method = editingSchedule.id ? "PUT" : "POST";
            const res = await fetch("/api/schedule", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingSchedule),
            });

            if (res.ok) {
                await fetchSchedules();
                closeModal();
            } else {
                const err = await res.json();
                alert(err.error || "保存に失敗しました");
            }
        } catch (e) {
            alert("通信エラーが発生しました");
        }
        setIsSaving(false);
    }

    async function handleDeleteSchedule() {
        if (!editingSchedule?.id) return;
        if (!confirm("この予定を削除してもよろしいですか？")) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/schedule?id=${editingSchedule.id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                await fetchSchedules();
                closeModal();
            } else {
                const err = await res.json();
                alert(err.error || "削除に失敗しました");
            }
        } catch (e) {
            alert("通信エラーが発生しました");
        }
        setIsSaving(false);
    }


    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

    const calendarGrid = [];
    let currentDay = 1;

    for (let i = 0; i < 6; i++) {
        const week = [];
        for (let j = 0; j < 7; j++) {
            if (i === 0 && j < firstDayOfWeek) {
                week.push(null);
            } else if (currentDay <= daysInMonth) {
                week.push(currentDay);
                currentDay++;
            } else {
                week.push(null);
            }
        }
        calendarGrid.push(week);
        if (currentDay > daysInMonth) break;
    }

    return (
        <div style={{ position: "relative" }}>
            {message && (
                <div style={{
                    padding: "var(--space-sm) var(--space-md)",
                    borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)",
                    background: message.type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                    color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)",
                    fontSize: "var(--font-size-sm)", fontWeight: 600,
                }}>
                    {message.type === "success" ? "✅" : "⚠️"} {message.text}
                </div>
            )}

            <div className={styles.controls} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <div className={styles.monthNav}>
                    <button className={styles.navBtn} onClick={prevMonth}>◀</button>
                    <span className={styles.monthLabel}>{year}年{month}月</span>
                    <button className={styles.navBtn} onClick={nextMonth}>▶</button>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button className="btn btn-secondary" onClick={handleExport} disabled={schedules.length === 0}>
                        📥 Excelに書き出し
                    </button>
                    <label className="btn btn-secondary" style={{ cursor: "pointer", opacity: uploading ? 0.7 : 1 }}>
                        {uploading ? "インポート中..." : "📤 Excelをインポート"}
                        <input type="file" accept=".xlsx, .xls" style={{ display: "none" }} onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "var(--space-md)", borderRadius: "var(--radius-lg)", border: "var(--border-light)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-md)", padding: "var(--space-sm)", background: "var(--bg-main)", borderRadius: "var(--radius-md)" }}>
                    <strong>💡 ヒント:</strong> 日付のマスをクリックすると予定を個別に追加できます。作成した行事をクリックすると編集・削除が可能です。
                </div>

                {/* カレンダー */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "var(--border-light)", border: "1px solid var(--border-light)" }}>
                    {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                        <div key={d} style={{ background: i === 0 ? "#ffeeee" : i === 6 ? "#eeeeff" : "white", padding: "8px", textAlign: "center", fontWeight: "bold", fontSize: "0.9em" }}>
                            {d}
                        </div>
                    ))}
                    {calendarGrid.flat().map((day, i) => {
                        if (!day) return <div key={`empty-${i}`} style={{ background: "white" }}></div>;
                        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const daySchedules = schedules.filter(s => s.date === dateStr);
                        const dayTeamLeaves = teamLeaves[dateStr] || [];
                        const isSun = i % 7 === 0;
                        const isSat = i % 7 === 6;

                        return (
                            <div
                                key={day}
                                onClick={() => openNewModal(dateStr)}
                                style={{
                                    background: "white", padding: "8px", minHeight: "100px",
                                    display: 'flex', flexDirection: 'column', cursor: "pointer"
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = "#f9f9f9"}
                                onMouseOut={(e) => e.currentTarget.style.background = "white"}
                            >
                                <div style={{ fontWeight: '500', marginBottom: "4px", color: isSun ? "red" : isSat ? "blue" : "inherit" }}>{day}</div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {daySchedules.map(s => (
                                        <div
                                            key={s.id}
                                            onClick={(e) => openEditModal(s, e)}
                                            style={{
                                                fontSize: "0.75rem", padding: "2px 4px", borderRadius: "4px",
                                                background: "var(--color-primary-light)", color: "var(--color-primary-dark)",
                                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                                cursor: "pointer", border: "1px solid var(--color-primary)"
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.filter = "brightness(0.9)"}
                                            onMouseOut={(e) => e.currentTarget.style.filter = "none"}
                                        >
                                            {s.startTime && <span>{s.startTime} </span>}
                                            {s.title}
                                        </div>
                                    ))}
                                    {dayTeamLeaves.map((tl, idx) => (
                                        <div
                                            key={`tl-${idx}`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                fontSize: "0.75rem", padding: "2px 4px", borderRadius: "4px",
                                                background: "var(--color-warning-light)", color: "var(--color-warning-dark)",
                                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                                border: "1px solid var(--color-warning)"
                                            }}
                                        >
                                            <span style={{ fontWeight: "bold" }}>{tl.staffName}</span>:
                                            {tl.leaveType === "FULL_DAY" ? "全休" :
                                                tl.leaveType === "HALF_DAY" ? `半休(${tl.halfDayPeriod === "AM" ? "午前" : "午後"})` :
                                                    tl.leaveType === "HOURLY" ? `${tl.leaveHours}h休み` :
                                                        tl.leaveType === "SPECIAL_SICK" ? "感染症特休" : "休暇"}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* モーダル */}
            {selectedDate && editingSchedule && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.5)", zIndex: 1000,
                    display: "flex", justifyContent: "center", alignItems: "center"
                }}>
                    <div style={{
                        background: "var(--bg-card)", padding: "var(--space-lg)",
                        borderRadius: "var(--radius-lg)", width: "100%", maxWidth: "400px",
                        boxShadow: "var(--shadow-lg)"
                    }}>
                        <h3 style={{ margin: "0 0 var(--space-md) 0", fontSize: "var(--font-size-lg)" }}>
                            {editingSchedule.id ? "予定の編集" : "予定の追加"}
                        </h3>
                        <p style={{ margin: "0 0 var(--space-md) 0", color: "var(--text-secondary)" }}>
                            日付: {editingSchedule.date}
                        </p>

                        <div style={{ marginBottom: "var(--space-sm)" }}>
                            <label style={{ display: "block", fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "4px" }}>タイトル <span style={{ color: "red" }}>*</span></label>
                            <input
                                type="text"
                                value={editingSchedule.title || ""}
                                onChange={(e) => setEditingSchedule({ ...editingSchedule, title: e.target.value })}
                                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}
                                placeholder="入園式など"
                            />
                        </div>

                        <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "4px" }}>開始時間</label>
                                <input
                                    type="time"
                                    value={editingSchedule.startTime || ""}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, startTime: e.target.value })}
                                    style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "4px" }}>終了時間</label>
                                <input
                                    type="time"
                                    value={editingSchedule.endTime || ""}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, endTime: e.target.value })}
                                    style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: "var(--space-md)" }}>
                            <label style={{ display: "block", fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "4px" }}>種別・メモ</label>
                            <input
                                type="text"
                                value={editingSchedule.type || ""}
                                onChange={(e) => setEditingSchedule({ ...editingSchedule, type: e.target.value })}
                                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}
                                placeholder="行事、休園など"
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-lg)" }}>
                            {editingSchedule.id ? (
                                <button
                                    className="btn"
                                    style={{ background: "var(--color-danger)", color: "white" }}
                                    onClick={handleDeleteSchedule}
                                    disabled={isSaving}
                                >
                                    削除
                                </button>
                            ) : <div></div>}
                            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                                <button className="btn btn-secondary" onClick={closeModal} disabled={isSaving}>キャンセル</button>
                                <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={isSaving}>保存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
