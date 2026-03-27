"use client";
import { useState, useEffect, useCallback } from "react";
import type { UserSession } from "@/app/page";
import styles from "./Dashboard.module.css";

interface Attendance {
    id: string;
    workDate: string;
    clockIn: string | null;
    clockOut: string | null;
    actualWorkHours: number;
    breakHours: number;
    overtimeHours: number;
    shortTimeValue: number;
    mealCount: number;
    overtimeReason: string | null;
    overtimeMemo: string | null;
    hourlyLeave: number;
    status: string;
    memo: string | null;
}

interface DashboardProps {
    user: UserSession;
    alert: { type: string; date: string; message: string } | null;
    onDismissAlert: () => void;
    onLogout: (wasKiosk?: boolean) => void;
    onNavigateToHistory: (date?: string) => void;
}

const EMPLOYMENT_LABELS: Record<string, string> = {
    REGULAR: "正規職員",
    PART_TIME: "パート",
    SHORT_TIME: "時短職員",
};

const OVERTIME_REASONS = ["くま1", "くま2", "くま3", "くま4", "くま5", "くま6", "会議", "行事準備", "その他"];

interface Duty {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

export default function Dashboard({ user, alert, onDismissAlert, onLogout, onNavigateToHistory }: DashboardProps) {
    const [attendance, setAttendance] = useState<Attendance | null>(null);
    const [todayLeave, setTodayLeave] = useState<any>(null);
    const [missingAlert, setMissingAlert] = useState<{ hasMissing: boolean, date?: string, message?: string } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [clockLoading, setClockLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [showClockOutModal, setShowClockOutModal] = useState(false);
    const [mealCount, setMealCount] = useState(1);
    const [overtimeReason, setOvertimeReason] = useState("");
    const [overtimeMemo, setOvertimeMemo] = useState("");
    const [memo, setMemo] = useState("");
    const [duties, setDuties] = useState<Duty[]>([]);
    const [dutyType, setDutyType] = useState("NONE");
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [calcResult, setCalcResult] = useState<{
        actualWorkHours: number;
        breakHours: number;
        overtimeHours: number;
        shortTimeValue: number;
        requiresOvertimeReason: boolean;
        isLate?: boolean;
        isEarlyLeave?: boolean;
    } | null>(null);
    const [effectiveSchedule, setEffectiveSchedule] = useState<{
        startTime: string;
        endTime: string;
        isOverride: boolean;
        title: string | null;
    } | null>(null);

    // 時計を毎秒更新
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchToday = useCallback(async () => {
        try {
            const res = await fetch("/api/attendance/today");
            const data = await res.json();
            if (data.attendance) {
                setAttendance(data.attendance);
                setMealCount(data.attendance.mealCount);
            } else {
                setAttendance(null);
            }
            if (data.leave) {
                setTodayLeave(data.leave);
            } else {
                setTodayLeave(null);
            }
            if (data.effectiveSchedule) {
                setEffectiveSchedule(data.effectiveSchedule);
            }
            if (data.duties) {
                setDuties(data.duties);
            }
        } catch {
            // エラー処理
        } finally {
            setIsInitialLoading(false);
        }
    }, []);

    const fetchMissing = useCallback(async () => {
        try {
            const res = await fetch("/api/attendance/missing");
            const data = await res.json();
            if (data.hasMissing) {
                setMissingAlert(data);
            }
        } catch {
            // エラー処理
        }
    }, []);

    useEffect(() => {
        fetchToday();
        fetchMissing();
    }, [fetchToday, fetchMissing]);

    // 出勤打刻
    async function handleClockIn() {
        setClockLoading(true);
        try {
            const res = await fetch("/api/attendance/clock-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ memo }),
            });
            const data = await res.json();
            if (data.success) {
                setAttendance(data.attendance);
                setMessage({ type: "success", text: "✅ 出勤しました！食事カウントを1にセットしました。" });
                if (user.isKiosk) {
                    setTimeout(() => onLogout(true), 2000);
                }
            } else {
                setMessage({ type: "danger", text: `${data.error}${data.detail ? ` (${data.detail})` : ""}` });
                setTimeout(() => setMessage(null), 5000);
            }
        } catch {
            setMessage({ type: "danger", text: "通信エラーが発生しました" });
        }
        setClockLoading(false);
    }

    // 退勤打刻（モーダル表示）
    async function handleClockOut() {
        setClockLoading(true);
        const finalOvertimeReason = overtimeReason;

        try {
            const res = await fetch("/api/attendance/clock-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mealCount,
                    dutyType,
                    overtimeReason: finalOvertimeReason || null,
                    overtimeMemo: overtimeMemo || null,
                    memo: memo || null,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setAttendance(data.attendance);
                setCalcResult(data.calculation);
                setShowClockOutModal(false);
                setMessage({ type: "success", text: "✅ 退勤しました！お疲れさまでした。" });
                if (user.isKiosk) {
                    setTimeout(() => onLogout(true), 2000);
                }
            } else {
                setMessage({ type: "danger", text: data.error });
            }
        } catch {
            setMessage({ type: "danger", text: "通信エラーが発生しました" });
        }
        setClockLoading(false);
    }

    // 間違えて打刻した場合の取り消し
    async function handleResetClock() {
        if (!confirm("本日の打刻データを取り消します。よろしいですか？")) return;
        setClockLoading(true);
        try {
            const date = new Date().toISOString().split('T')[0];
            const res = await fetch("/api/attendance/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: "本日の打刻を取り消しました" });
                setAttendance(null); // 表示をリセット
            } else {
                setMessage({ type: "danger", text: data.error });
            }
        } catch {
            setMessage({ type: "danger", text: "通信エラーが発生しました" });
        }
        setClockLoading(false);
    }

    // 退勤プレビュー（モーダルを開く前に計算結果を取得）
    async function openClockOutModal() {
        // 仮に現在時刻で計算結果をプレビュー
        setShowClockOutModal(true);
    }

    const isClockIn = attendance?.status === "CLOCKED_IN" || attendance?.clockIn;
    const isCompleted = attendance?.status === "COMPLETED" || attendance?.clockOut;

    // 全休または時間休以外の特定の休暇かどうか
    const isFullDayLeave = todayLeave && todayLeave.leaveType !== "HOURLY" && todayLeave.leaveType !== "HALF_DAY";
    const leaveLabel = todayLeave ? (todayLeave.leaveType === "SPECIAL_OTHER" ? "特休" : todayLeave.leaveType === "SPECIAL_SICK" ? "病気休暇" : "有給休暇") : "";

    const formatDate = (d: Date) => {
        const days = ["日", "月", "火", "水", "木", "金", "土"];
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
    };

    const formatTime = (d: Date) => {
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    return (
        <div className={styles.container}>

            <main className={styles.main}>
                {/* スケルトン: 初回ロード中 */}
                {isInitialLoading && (
                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                        {/* 時刻スケルトン */}
                        <div style={{
                            height: 80, borderRadius: "var(--radius-lg)",
                            background: "linear-gradient(90deg, #f0e8ef 25%, #fce4f0 50%, #f0e8ef 75%)",
                            backgroundSize: "200% 100%",
                            animation: "skeletonShimmer 1.5s infinite",
                            marginBottom: "var(--space-lg)"
                        }} />
                        {/* 打刻ボタンスケルトン */}
                        <div style={{
                            height: 120, borderRadius: "var(--radius-lg)",
                            background: "linear-gradient(90deg, #f0e8ef 25%, #fce4f0 50%, #f0e8ef 75%)",
                            backgroundSize: "200% 100%",
                            animation: "skeletonShimmer 1.5s infinite 0.2s",
                            marginBottom: "var(--space-lg)"
                        }} />
                        {/* カードスケルトン */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} style={{
                                    height: 80, borderRadius: "var(--radius-md)",
                                    background: "linear-gradient(90deg, #f0e8ef 25%, #fce4f0 50%, #f0e8ef 75%)",
                                    backgroundSize: "200% 100%",
                                    animation: `skeletonShimmer 1.5s infinite ${i * 0.1}s`,
                                }} />
                            ))}
                        </div>
                        <style>{`
                            @keyframes skeletonShimmer {
                                0% { background-position: 200% 0; }
                                100% { background-position: -200% 0; }
                            }
                        `}</style>
                    </div>
                )}
                {/* ロード完了後のメインコンテンツ */}
                {!isInitialLoading && (<>
                {missingAlert?.hasMissing && (
                    <div
                        className="alert"
                        style={{
                            marginBottom: "var(--space-lg)",
                            background: "var(--color-danger)",
                            color: "white",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            boxShadow: "0 4px 12px rgba(231, 76, 60, 0.4)"
                        }}
                        onClick={() => onNavigateToHistory(missingAlert.date)}
                    >
                        <span style={{ fontSize: "1.2rem", marginRight: "var(--space-sm)" }}>⚠️</span>
                        <div style={{ flex: 1, fontWeight: "bold" }}>
                            {missingAlert.message}
                            <div style={{ fontSize: "0.85em", opacity: 0.9, marginTop: "2px", fontWeight: "normal" }}>
                                タップ・クリックして履歴画面から修正してください
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setMissingAlert(null); }}
                            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "white", fontSize: "1.2rem" }}
                        >✕</button>
                    </div>
                )}

                {alert && (
                    <div className="alert alert-danger" style={{ marginBottom: "var(--space-lg)" }}>
                        ⚠️ {alert.message}
                        <button onClick={onDismissAlert} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--color-danger)" }}>✕</button>
                    </div>
                )}

                {/* メッセージ */}
                {message && (
                    <div className={`alert alert-${message.type}`} style={{ marginBottom: "var(--space-lg)" }}>
                        {message.text}
                    </div>
                )}

                {/* 日時表示 */}
                <div className={styles.dateTimeArea}>
                    <p className={styles.dateText}>📅 {formatDate(currentTime)}</p>
                    <p className={styles.timeText}>{formatTime(currentTime)}</p>
                </div>

                {/* 休暇メッセージ */}
                {isFullDayLeave && (
                    <div style={{ padding: "var(--space-md)", background: "rgba(52, 152, 219, 0.1)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)", textAlign: "center", color: "var(--color-primary)" }}>
                        本日は <strong>{leaveLabel}</strong> が承認されています。ゆっくりお休みください ☕️
                    </div>
                )}

                {/* 特別勤務設定バナー */}
                {effectiveSchedule?.isOverride && (
                    <div style={{
                        padding: "var(--space-md)",
                        background: "rgba(212, 149, 106, 0.1)",
                        border: "1px solid var(--color-accent)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "var(--space-md)",
                        textAlign: "center",
                        color: "var(--color-accent-dark)",
                        animation: "fadeIn 0.5s ease-out"
                    }}>
                        <span style={{ marginRight: "8px" }}>📢</span>
                        <strong>行事用設定適用中</strong>: {effectiveSchedule.title}
                        <div style={{ fontSize: "0.85rem", marginTop: "4px", opacity: 0.9 }}>
                            本日の基準勤務時間: {effectiveSchedule.startTime} 〜 {effectiveSchedule.endTime}
                        </div>
                    </div>
                )}

                {/* 打刻ボタン */}
                <div className={styles.clockButtons}>
                    <button
                        className={`${styles.clockBtn} ${styles.clockInBtn}`}
                        onClick={handleClockIn}
                        disabled={clockLoading || isClockIn || isCompleted || isFullDayLeave}
                        style={isFullDayLeave ? { opacity: 0.5, cursor: "not-allowed", background: "var(--text-secondary)" } : {}}
                    >
                        <span className={styles.clockBtnText}>出勤</span>
                    </button>
                    <button
                        className={`${styles.clockBtn} ${styles.clockOutBtn}`}
                        onClick={openClockOutModal}
                        disabled={clockLoading || !isClockIn || isFullDayLeave}
                        style={isFullDayLeave ? { opacity: 0.5, cursor: "not-allowed", background: "var(--text-secondary)" } : {}}
                    >
                        <span className={styles.clockBtnText}>退勤</span>
                    </button>
                </div>

                {isFullDayLeave && (isClockIn || isCompleted) && (
                    <div style={{ textAlign: "center", marginTop: "var(--space-md)" }}>
                        <button
                            onClick={handleResetClock}
                            style={{ background: "transparent", color: "var(--color-danger)", border: "1px solid var(--color-danger)", padding: "var(--space-xs) var(--space-sm)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: "0.85rem" }}
                        >
                            休暇日に間違えて打刻してしまった場合（打刻取消）
                        </button>
                    </div>
                )}

                {/* メモ入力（出勤前のみ表示） */}
                {!isClockIn && !isCompleted && (
                    <div className={styles.preClockInputs}>
                        <div className="input-group">
                            <label>メモ</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="備考があれば入力"
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {/* 本日の状況 */}
                <div className={styles.statusCard}>
                    <h3 className={styles.statusTitle}>本日の状況</h3>
                    <div className={styles.statusGrid}>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>出勤</span>
                            <span className={styles.statusValue}>{attendance?.clockIn || "--:--"}</span>
                        </div>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>退勤</span>
                            <span className={styles.statusValue}>{attendance?.clockOut || "--:--"}</span>
                        </div>
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>実労働</span>
                            <span className={styles.statusValue}>
                                {isCompleted && attendance?.actualWorkHours !== undefined ? `${attendance.actualWorkHours.toFixed(2)}h` : "--"}
                            </span>
                        </div>
                        {user.employmentType !== "PART_TIME" && (
                            <div className={styles.statusItem}>
                                <span className={styles.statusLabel}>残業</span>
                                <span className={styles.statusValue} style={attendance?.overtimeHours && attendance.overtimeHours > 0 ? { color: "var(--color-danger)" } : {}}>
                                    {isCompleted && attendance?.overtimeHours !== undefined ? `${attendance.overtimeHours.toFixed(2)}h` : "--"}
                                </span>
                            </div>
                        )}
                        {user.employmentType === "SHORT_TIME" && (
                            <div className={styles.statusItem}>
                                <span className={styles.statusLabel}>時短値</span>
                                <span className={styles.statusValue}>
                                    {isCompleted ? attendance?.shortTimeValue : "--"}
                                </span>
                            </div>
                        )}
                        <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>食事</span>
                            <span className={styles.statusValue}>
                                {attendance?.mealCount ? "🍽️ あり" : "—"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 退勤完了時の詳細表示 */}
                {isCompleted && attendance && (
                    <div className={styles.completedCard}>
                        <div className={styles.completedIcon}>✅</div>
                        <p className={styles.completedText}>本日の勤務は完了です</p>
                        {attendance.breakHours > 0 && (
                            <p className={styles.completedDetail}>休憩: {attendance.breakHours}h (自動控除)</p>
                        )}
                    </div>
                )}
                </>)}
            </main>

            {/* 退勤確認モーダル */}
            {showClockOutModal && (
                <div className="modal-overlay" onClick={() => setShowClockOutModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>退勤確認</h2>
                            <button className="modal-close" onClick={() => setShowClockOutModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className={styles.modalInfo}>
                                <p>退勤時刻: <strong>{formatTime(currentTime)}</strong></p>
                                <p>出勤時刻: <strong>{attendance?.clockIn}</strong></p>
                            </div>

                            {/* 当番選択 */}
                            <div style={{ marginTop: "var(--space-md)" }}>
                                <div className="input-group">
                                    <label>当番</label>
                                    <select
                                className="select"
                                value={dutyType}
                                onChange={(e) => setDutyType(e.target.value)}
                            >
                                <option value="NONE">なし</option>
                                {duties.map(d => (
                                    <option key={d.id} value={d.name}>{d.name}</option>
                                ))}
                            </select>
                                </div>
                            </div>

                            {/* 残業理由（正規・時短のみ） */}
                            {user.employmentType !== "PART_TIME" && (
                                <div style={{ marginTop: "var(--space-lg)" }}>
                                    <div className="input-group">
                                        <label>残業理由（残業がある場合）</label>
                                        <select
                                            className="select"
                                            value={overtimeReason}
                                            onChange={(e) => setOvertimeReason(e.target.value)}
                                        >
                                            <option value="">（残業なしの場合は空欄）</option>
                                            {OVERTIME_REASONS.map((r) => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                    </div>


                                    {overtimeReason && (
                                        <div className="input-group" style={{ marginTop: "var(--space-md)" }}>
                                            <label>📝 詳細メモ</label>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="残業の詳細を入力"
                                                value={overtimeMemo}
                                                onChange={(e) => setOvertimeMemo(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 食事確認 */}
                            <div style={{ marginTop: "var(--space-lg)" }}>
                                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>
                                    本日の給食を食べましたか？
                                </p>
                                <div className="toggle-group">
                                    <button
                                        className={`toggle-btn ${mealCount === 1 ? "active" : ""}`}
                                        onClick={() => setMealCount(1)}
                                    >
                                        🟢 はい
                                    </button>
                                    <button
                                        className={`toggle-btn ${mealCount === 0 ? "active" : ""}`}
                                        onClick={() => setMealCount(0)}
                                    >
                                        ⬜ いいえ
                                    </button>
                                </div>
                            </div>
                            {/* 備考欄 */}
                            <div style={{ marginTop: "var(--space-lg)" }}>
                                <div className="input-group">
                                    <label>📝 備考（遅刻・早退などの理由）</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="備考があれば入力"
                                        value={memo}
                                        onChange={(e) => setMemo(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-success w-full"
                                onClick={handleClockOut}
                                disabled={clockLoading}
                            >
                                {clockLoading ? "処理中..." : "✅ 退勤を確定"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
