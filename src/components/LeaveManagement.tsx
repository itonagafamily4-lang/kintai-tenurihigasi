"use client";
import { useState, useEffect, useCallback } from "react";
import { UserSession } from "@/app/page";
import Calendar from "./Calendar";
import styles from "./LeaveManagement.module.css";

interface LeaveManagementProps {
    user: UserSession;
}

interface LeaveBalance {
    id: string;
    totalDays: number;
    usedDays: number;
    remainingDays: number;
    timeLeaveUsedHours: number;
    staff: {
        standardWorkHours: number;
    };
}

interface LeaveBreakdown {
    fullDay: number;
    halfDay: number;
    hourly: number;
    sickLeave: number;
    pending: number;
    nursingLeave: number;
    careLeave: number;
}

interface SpecialBalance {
    leaveType: string;
    totalDays: number;
    usedDays: number;
}

interface LeaveRequest {
    id: string;
    staffId: string;
    leaveDate: string;
    leaveType: string;
    leaveHours?: number | null;
    leaveStartTime?: string | null;
    leaveEndTime?: string | null;
    halfDayPeriod?: string | null;
    reason?: string | null;
    sickDayNumber: number | null;
    status: string;
    createdAt: string;
    staff?: {
        name: string;
        employeeNo: string;
    };
    approval?: {
        action: string;
        comment?: string | null;
        actionedAt: string;
    } | null;
}

const LEAVE_TYPES = [
    { value: "FULL_DAY", label: "全日有休", desc: "1日休み" },
    { value: "HALF_DAY", label: "半日有休", desc: "午前or午後" },
    { value: "HOURLY", label: "時間有給", desc: "時間単位" },
    { value: "SPECIAL_SICK", label: "感染症特休", desc: "最大3日" },
    { value: "SPECIAL_OTHER", label: "特休", desc: "特別な休み" },
    { value: "NURSING", label: "看護休暇", desc: "子供の看護など" },
    { value: "CARE", label: "介護休暇", desc: "家族の介護など" },
];

const REASON_OPTIONS = [
    "私用のため",
    "体調不良のため",
    "通院のため",
    "家族の看護・介護",
    "行事等",
    "その他"
];

const SICK_REASON_OPTIONS = [
    "コロナ",
    "インフルエンザ",
    "その他"
];

function formatLeaveType(type: string, halfDayPeriod?: string | null) {
    switch (type) {
        case "FULL_DAY": return "全日有休";
        case "HALF_DAY": return `半日有休(${halfDayPeriod === "AM" ? "午前" : "午後"})`;
        case "HOURLY": return "時間有給";
        case "SPECIAL_OTHER": return "特休";
        case "SPECIAL_SICK": return "感染症特休";
        case "NURSING": return "看護休暇";
        case "CARE": return "介護休暇";
        default: return type;
    }
}

function formatDate(dateStr: string) {
    const parts = dateStr.split("-");
    return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
}

export default function LeaveManagement({ user }: LeaveManagementProps) {
    const [balance, setBalance] = useState<LeaveBalance | null>(null);
    const [breakdown, setBreakdown] = useState<LeaveBreakdown | null>(null);
    const [specialBalances, setSpecialBalances] = useState<SpecialBalance[]>([]);
    const [fiscalYear, setFiscalYear] = useState<number>(0);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);

    // フォーム
    const [leaveDate, setLeaveDate] = useState("");
    const [dateWarning, setDateWarning] = useState<string | null>(null);
    const [leaveType, setLeaveType] = useState("");
    const [halfDayPeriod, setHalfDayPeriod] = useState<string>("");
    const [leaveStartTime, setLeaveStartTime] = useState("07:30");
    const [leaveEndTime, setLeaveEndTime] = useState("08:30");
    const [leaveHours, setLeaveHours] = useState<number>(1);
    const [reasonCategory, setReasonCategory] = useState("");
    const [otherReason, setOtherReason] = useState("");

    const fetchBalance = useCallback(async () => {
        try {
            const res = await fetch("/api/leave/balance");
            const data = await res.json();
            if (!data.error) {
                setBalance(data.balance);
                setBreakdown(data.breakdown);
                setSpecialBalances(data.specialBalances || []);
                setFiscalYear(data.fiscalYear);
            }
        } catch (error) {
            console.error("Balance fetch error:", error);
        }
    }, []);

    const fetchRequests = useCallback(async () => {
        try {
            const url = statusFilter
                ? `/api/leave/list?status=${statusFilter}`
                : "/api/leave/list";
            const res = await fetch(url);
            const data = await res.json();
            if (!data.error) {
                setRequests(data.leaveRequests || []);
            }
        } catch (error) {
            console.error("Requests fetch error:", error);
        }
    }, [statusFilter]);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            await Promise.all([fetchBalance(), fetchRequests()]);
            setLoading(false);
        }
        loadData();
    }, [fetchBalance, fetchRequests]);

    const handleDateSelect = (val: string) => {
        setLeaveDate(val);
        setDateWarning(null);
        if (val) {
            const d = new Date(val);
            if (d.getDay() === 0) {
                setDateWarning("日曜日は休暇申請できません");
            } else {
                fetch(`/api/calendar/holidays?year=${d.getFullYear()}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.holidays && data.holidays[val]) {
                            setDateWarning(`${data.holidays[val]}のため休暇申請できません`);
                        }
                    })
                    .catch(() => { });
            }
        }
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!leaveDate || !leaveType) return;

        setSubmitting(true);
        setMessage(null);

        const finalReason = leaveType === "SPECIAL_OTHER"
            ? null
            : (reasonCategory === "その他" ? otherReason : reasonCategory);

        try {
            const res = await fetch("/api/leave/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    leaveDate,
                    leaveType,
                    halfDayPeriod: leaveType === "HALF_DAY" ? halfDayPeriod : null,
                    leaveStartTime: leaveType === "HOURLY" ? leaveStartTime : null,
                    leaveEndTime: leaveType === "HOURLY" ? leaveEndTime : null,
                    leaveHours: leaveType === "HOURLY" ? leaveHours : null,
                    reason: finalReason || null,
                }),
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: "success", text: "休暇申請を送信しました ✨" });
                resetForm();
                setShowForm(false);
                await Promise.all([fetchBalance(), fetchRequests()]);
            } else {
                setMessage({ type: "error", text: data.error || "申請に失敗しました" });
            }
        } catch {
            setMessage({ type: "error", text: "ネットワークエラーが発生しました" });
        } finally {
            setSubmitting(false);
        }
    }

    async function handleApproval(requestId: string, action: "APPROVED" | "REJECTED") {
        try {
            const res = await fetch("/api/leave/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId, action }),
            });
            const data = await res.json();

            if (data.success) {
                setMessage({
                    type: "success",
                    text: action === "APPROVED" ? "承認しました ✅" : "却下しました ❌"
                });
                await Promise.all([fetchBalance(), fetchRequests()]);
            } else {
                setMessage({ type: "error", text: data.error || "処理に失敗しました" });
            }
        } catch {
            setMessage({ type: "error", text: "ネットワークエラーが発生しました" });
        }
    }

    async function handleCancel(requestId: string) {
        if (!confirm("この休暇申請をキャンセルしますか？\n※すでに承認済みの場合は有休残高も元に戻ります。")) return;
        try {
            const res = await fetch("/api/leave/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId }),
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: "success", text: "申請をキャンセルしました" });
                await Promise.all([fetchBalance(), fetchRequests()]);
            } else {
                setMessage({ type: "error", text: data.error || "キャンセル処理に失敗しました" });
            }
        } catch {
            setMessage({ type: "error", text: "ネットワークエラーが発生しました" });
        }
    }

    function resetForm() {
        setLeaveDate("");
        setLeaveType("");
        setHalfDayPeriod("");
        setLeaveHours(1);
        setReasonCategory("");
        setOtherReason("");
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
                        読み込み中...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.sectionTitle}>🏖️ 休暇管理</div>

            {/* メッセージ */}
            {message && (
                <div className={`${styles.message} ${message.type === "success" ? styles.messageSuccess : styles.messageError
                    }`}>
                    {message.text}
                </div>
            )}

            {/* 有休残高カード */}
            {balance && (
                <div className={styles.balanceCard}>
                    <div className={styles.balanceHeader}>
                        <span className={styles.balanceLabel}>有給休暇残日数</span>
                        <span className={styles.balanceFiscalYear}>{fiscalYear}年度</span>
                    </div>
                    <div className={styles.balanceMain}>
                        <span className={styles.balanceNumber}>{balance.remainingDays}</span>
                        <span className={styles.balanceUnit}>日 / {balance.totalDays}日</span>
                    </div>
                    <div className={styles.balanceBar}>
                        <div
                            className={styles.balanceBarFill}
                            style={{ width: `${(balance.remainingDays / balance.totalDays) * 100}%` }}
                        ></div>
                    </div>
                    {breakdown && (
                        <>
                            <div className={styles.balanceBreakdown}>
                                <div className={styles.breakdownItem}>
                                    <span className={styles.breakdownValue}>{breakdown.fullDay}</span>
                                    <span className={styles.breakdownLabel}>全休</span>
                                </div>
                                <div className={styles.breakdownItem}>
                                    <span className={styles.breakdownValue}>{breakdown.halfDay}</span>
                                    <span className={styles.breakdownLabel}>半休</span>
                                </div>
                                <div className={styles.breakdownItem}>
                                    <span className={styles.breakdownValue}>{breakdown.pending}</span>
                                    <span className={styles.breakdownLabel}>申請中</span>
                                </div>
                            </div>
                            <div style={{ 
                                marginTop: "var(--space-md)", 
                                padding: "var(--space-sm)", 
                                background: "rgba(255,255,255,0.3)", 
                                borderRadius: "var(--radius-md)",
                                fontSize: "0.8rem"
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                    <span>時間有休 使用合計:</span>
                                    <strong>{balance.timeLeaveUsedHours || 0} / {Math.ceil(balance.staff.standardWorkHours) * 5} 時間</strong>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>時間有休 残り枠:</span>
                                    <strong>{Math.ceil(balance.staff.standardWorkHours) * 5 - (balance.timeLeaveUsedHours || 0)} 時間</strong>
                                </div>
                            </div>

                            {/* 特別休暇残高 */}
                            {specialBalances.length > 0 && specialBalances.some(sb => sb.totalDays > 0) && (
                                <div style={{ 
                                    marginTop: "var(--space-sm)", 
                                    padding: "var(--space-sm)", 
                                    background: "rgba(255,255,255,0.2)", 
                                    borderRadius: "var(--radius-md)",
                                    fontSize: "0.8rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "4px"
                                }}>
                                    {specialBalances.find(sb => sb.leaveType === "NURSING" && sb.totalDays > 0) && (
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span>看護休暇 残り:</span>
                                            <strong>{specialBalances.find(sb => sb.leaveType === "NURSING")!.totalDays - specialBalances.find(sb => sb.leaveType === "NURSING")!.usedDays} / {specialBalances.find(sb => sb.leaveType === "NURSING")!.totalDays} 日</strong>
                                        </div>
                                    )}
                                    {specialBalances.find(sb => sb.leaveType === "CARE" && sb.totalDays > 0) && (
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span>介護休暇 残り:</span>
                                            <strong>{specialBalances.find(sb => sb.leaveType === "CARE")!.totalDays - specialBalances.find(sb => sb.leaveType === "CARE")!.usedDays} / {specialBalances.find(sb => sb.leaveType === "CARE")!.totalDays} 日</strong>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* 新規申請ボタン */}
            {!showForm && (
                <button className={styles.newRequestBtn} onClick={() => setShowForm(true)}>
                    ✏️ 新しい休暇を申請する
                </button>
            )}

            {/* 申請フォーム */}
            {showForm && (
                <form className={styles.formCard} onSubmit={handleSubmit}>
                    <div className={styles.formTitle}>✏️ 休暇申請</div>

                    {/* 日付 */}
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                            日付<span className={styles.formRequired}>*</span>
                        </label>
                        <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                            <input
                                type="date"
                                className={styles.formInput}
                                value={leaveDate}
                                onChange={(e) => handleDateSelect(e.target.value)}
                                required
                                style={{ flex: 1 }}
                            />
                            <button
                                type="button"
                                style={{
                                    padding: "var(--space-sm) var(--space-md)",
                                    background: "white",
                                    border: "1px solid var(--border-light)",
                                    borderRadius: "var(--radius-md)",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                    fontSize: "0.85rem",
                                    color: "var(--text-primary)"
                                }}
                                onClick={() => setShowCalendar(!showCalendar)}
                            >
                                {showCalendar ? "カレンダーを閉じる" : "📅 カレンダーから選択"}
                            </button>
                        </div>
                        {showCalendar && (
                            <div style={{ marginTop: "var(--space-sm)", border: "var(--border-light)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "white" }}>
                                <Calendar user={user} mode="selector" onSelectDate={(d) => {
                                    handleDateSelect(d);
                                    setShowCalendar(false);
                                }} />
                            </div>
                        )}
                        {dateWarning && (
                            <div style={{
                                marginTop: "var(--space-xs)",
                                padding: "var(--space-xs) var(--space-sm)",
                                background: "var(--color-danger-bg)",
                                color: "var(--color-danger)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "var(--font-size-xs)",
                                fontWeight: 600,
                            }}>
                                ⚠️ {dateWarning}
                            </div>
                        )}
                    </div>

                    {/* 休暇種別 */}
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                            休暇種別<span className={styles.formRequired}>*</span>
                        </label>
                        <div className={styles.typeSelector}>
                            {LEAVE_TYPES.filter(type => {
                                if (type.value === "NURSING") {
                                    const b = specialBalances.find(sb => sb.leaveType === "NURSING");
                                    return b && b.totalDays > 0;
                                }
                                if (type.value === "CARE") {
                                    const b = specialBalances.find(sb => sb.leaveType === "CARE");
                                    return b && b.totalDays > 0;
                                }
                                return true;
                            }).map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    className={`${styles.typeOption} ${leaveType === type.value ? styles.typeOptionSelected : ""}`}
                                    onClick={() => {
                                        setLeaveType(type.value);
                                        setReasonCategory("");
                                        setOtherReason("");
                                    }}
                                >
                                    <span className={styles.typeOptionLabel}>{type.label}</span>
                                    <span className={styles.typeOptionDesc}>{type.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 半日の場合：午前/午後 */}
                    {leaveType === "HALF_DAY" && (
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>午前 / 午後</label>
                            <div className={styles.halfDaySelector}>
                                <button
                                    type="button"
                                    className={`${styles.halfDayOption} ${halfDayPeriod === "AM" ? styles.halfDayOptionSelected : ""}`}
                                    onClick={() => setHalfDayPeriod("AM")}
                                >
                                    午前
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.halfDayOption} ${halfDayPeriod === "PM" ? styles.halfDayOptionSelected : ""}`}
                                    onClick={() => setHalfDayPeriod("PM")}
                                >
                                    午後
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 時間有給の場合：時間帯と時間数 */}
                    {leaveType === "HOURLY" && (
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>取得時間帯</label>
                            <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                                <select
                                    className={styles.formInput}
                                    style={{ flex: 1 }}
                                    value={leaveStartTime}
                                    onChange={(e) => setLeaveStartTime(e.target.value)}
                                    required
                                >
                                    {Array.from({ length: 41 }).map((_, i) => {
                                        const totalMins = 450 + i * 15;
                                        const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
                                        const m = (totalMins % 60).toString().padStart(2, "0");
                                        const timeStr = `${h}:${m}`;
                                        return <option key={`start-${timeStr}`} value={timeStr}>{timeStr}</option>;
                                    })}
                                </select>
                                <span>〜</span>
                                <select
                                    className={styles.formInput}
                                    style={{ flex: 1 }}
                                    value={leaveEndTime}
                                    onChange={(e) => setLeaveEndTime(e.target.value)}
                                    required
                                >
                                    {Array.from({ length: 41 }).map((_, i) => {
                                        const totalMins = 450 + i * 15;
                                        const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
                                        const m = (totalMins % 60).toString().padStart(2, "0");
                                        const timeStr = `${h}:${m}`;
                                        return <option key={`end-${timeStr}`} value={timeStr}>{timeStr}</option>;
                                    })}
                                </select>
                            </div>

                            <label className={styles.formLabel} style={{ marginTop: "var(--space-md)" }}>消費する時間数（控除時間）</label>
                            <select
                                className={styles.formInput}
                                value={leaveHours}
                                onChange={(e) => setLeaveHours(parseInt(e.target.value, 10))}
                            >
                                {[1, 2, 3, 4, 5, 6, 7].map(h => (
                                    <option key={h} value={h}>{h} 時間分として処理</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 理由 */}
                    {leaveType !== "SPECIAL_OTHER" && (
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>理由（任意）</label>
                            <select
                                className={styles.formInput}
                                value={reasonCategory}
                                onChange={(e) => {
                                    setReasonCategory(e.target.value);
                                    if (e.target.value !== "その他") setOtherReason("");
                                }}
                                style={{ marginBottom: reasonCategory === "その他" ? "var(--space-sm)" : 0 }}
                            >
                                <option value="">選択してください...</option>
                                {(leaveType === "SPECIAL_SICK" ? SICK_REASON_OPTIONS : REASON_OPTIONS).map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            {reasonCategory === "その他" && (
                                <textarea
                                    className={styles.formTextarea}
                                    placeholder="具体的な理由をご記入ください..."
                                    value={otherReason}
                                    onChange={(e) => setOtherReason(e.target.value)}
                                ></textarea>
                            )}
                        </div>
                    )}

                    {/* アクション */}
                    <div className={styles.formActions}>
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => { setShowForm(false); resetForm(); }}
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={submitting || !leaveDate || !leaveType || !!dateWarning || (leaveType === "HOURLY" && (!leaveStartTime || !leaveEndTime))}
                        >
                            {submitting ? "送信中..." : "申請する"}
                        </button>
                    </div>
                </form>
            )}

            {/* 申請履歴 */}
            <div className={styles.historySection}>
                <div className={styles.historyHeader}>
                    <div className={styles.historyTitle}>📋 申請履歴</div>
                    <div className={styles.filterGroup}>
                        <button
                            className={`${styles.filterBtn} ${statusFilter === null ? styles.filterBtnActive : ""}`}
                            onClick={() => setStatusFilter(null)}
                        >
                            全て
                        </button>
                        <button
                            className={`${styles.filterBtn} ${statusFilter === "PENDING" ? styles.filterBtnActive : ""}`}
                            onClick={() => setStatusFilter("PENDING")}
                        >
                            申請中
                        </button>
                        <button
                            className={`${styles.filterBtn} ${statusFilter === "APPROVED" ? styles.filterBtnActive : ""}`}
                            onClick={() => setStatusFilter("APPROVED")}
                        >
                            承認済
                        </button>
                        <button
                            className={`${styles.filterBtn} ${statusFilter === "REJECTED" ? styles.filterBtnActive : ""}`}
                            onClick={() => setStatusFilter("REJECTED")}
                        >
                            却下
                        </button>
                    </div>
                </div>

                <div className={styles.requestList}>
                    {requests.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyStateIcon}>📭</div>
                            <p className={styles.emptyStateText}>まだ休暇申請はありません</p>
                        </div>
                    ) : (
                        requests.map((req) => (
                            <div key={req.id} className={styles.requestCard}>
                                <div className={styles.requestInfo}>
                                    <span className={styles.requestDate}>
                                        {formatDate(req.leaveDate)}
                                    </span>
                                    <span className={styles.requestType}>
                                        {formatLeaveType(req.leaveType, req.halfDayPeriod)}
                                        {req.leaveType === "HOURLY" && req.leaveStartTime && req.leaveEndTime && req.leaveHours ? ` (${req.leaveStartTime}〜${req.leaveEndTime}・${req.leaveHours}時間)` : ""}
                                        {req.reason ? ` - ${req.reason}` : ""}
                                    </span>
                                    {req.staff && user.role === "ADMIN" && (
                                        <span className={styles.requestName}>
                                            {req.staff.employeeNo} {req.staff.name}
                                        </span>
                                    )}
                                    {/* 管理者の承認/却下ボタン */}
                                    {user.role === "ADMIN" && req.status === "PENDING" && (
                                        <div className={styles.approvalActions}>
                                            <button
                                                className={styles.approveBtn}
                                                onClick={() => handleApproval(req.id, "APPROVED")}
                                            >
                                                ✅ 承認
                                            </button>
                                            <button
                                                className={styles.rejectBtn}
                                                onClick={() => handleApproval(req.id, "REJECTED")}
                                            >
                                                ❌ 却下
                                            </button>
                                        </div>
                                    )}
                                    {/* 自分の申請のキャンセルボタン */}
                                    {(req.status === "PENDING" || req.status === "APPROVED") && req.staffId === user.id && (
                                        <div style={{ marginTop: "var(--space-md)" }}>
                                            <button
                                                onClick={() => handleCancel(req.id)}
                                                style={{
                                                    fontSize: "0.85rem",
                                                    padding: "var(--space-xs) var(--space-sm)",
                                                    border: "1px solid var(--color-danger)",
                                                    color: "var(--color-danger)",
                                                    background: "transparent",
                                                    borderRadius: "var(--radius-sm)",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                申請を取り消す
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <span className={`${styles.requestStatus} ${req.status === "PENDING" ? styles.statusPending :
                                    req.status === "APPROVED" ? styles.statusApproved :
                                        req.status === "CANCELED" ? styles.statusRejected :
                                            styles.statusRejected
                                    }`}>
                                    {req.status === "PENDING" ? "⏳ 申請中" :
                                        req.status === "APPROVED" ? "✅ 承認済" :
                                            req.status === "CANCELED" ? "🔄 キャンセル済" : "❌ 却下"}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
