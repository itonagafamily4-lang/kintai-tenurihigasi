"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import type { UserSession } from "@/app/page";
import styles from "./AdminPanel.module.css";
import AdminSpecialLeaveSettings from "./AdminSpecialLeaveSettings";
import AdminStaffSpecialBalances from "./AdminStaffSpecialBalances";
import AdminStaffLeaveBalance from "./AdminStaffLeaveBalance";
import AdminStaffLeaveHistory from "./AdminStaffLeaveHistory";
import AdminStaffAbsenceRecord from "./AdminStaffAbsenceRecord";
import CalendarAdmin from "./CalendarAdmin";
import AdminAnnualLeaveGrant from "./AdminAnnualLeaveGrant";
import AdminScheduleOverride from "./AdminScheduleOverride";
import AdminDutySettings from "./AdminDutySettings";

interface StaffMember {
    id: string;
    employeeNo: string;
    loginId: string;
    name: string;
    email: string | null;
    joinDate: string | null;
    employmentType: string;
    jobTitle: string | null;
    assignedClass: string | null;
    role: string;
    defaultStart: string;
    defaultEnd: string;
    standardWorkHours: number;
    breakTimeHours: number;
    breakThresholdHours: number;
    weeklyWorkDays: number;
    weeklyWorkHours: number;
    maternityLeaveStart: string | null;
    maternityLeaveEnd: string | null;
    childcareLeaveStart: string | null;
    childcareLeaveEnd: string | null;
    expectedReturnDate: string | null;
    leaveBalances?: { 
        fiscalYear: number;
        grantedDays: number;
        usedDays: number;
        remainingDays: number;
    }[];
}

const ROLE_LABELS: Record<string, string> = {
    ADMIN: "👑 管理者",
    STAFF: "👤 一般",
};

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
        isLate?: boolean;
        isEarlyLeave?: boolean;
        dutyType?: string | null;
    } | null;
    leave: {
        leaveType: string;
        sickDayNumber: number | null;
        status: string;
    } | null;
    effectiveSchedule?: {
        title: string;
        startTime: string;
        endTime: string;
    } | null;
}

interface HistoryData {
    period: { year: number; month: number; label: string; };
    staff: { id: string; name: string; employeeNo: string; employmentType: string; };
    days: DayRecord[];
    summary?: {
        workDays: number;
        totalWorkHours: number;
        totalOvertime: number;
        totalShortTime: number;
        publicHolidays: number;
        paidLeave: number;
        sickLeave: number;
        totalHourlyLeave: number;
        lateCount: number;
        earlyLeaveCount: number;
        totalMeals: number;
    };
    error?: string;
}

interface Props {
    user: UserSession;
}

const EMPLOYMENT_LABELS: Record<string, string> = {
    REGULAR: "正規",
    PART_TIME: "パート",
    SHORT_TIME: "時短",
};

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function AdminPanel({ user }: Props) {
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [selectedStaff, setSelectedStaff] = useState<string>("");
    
    // 締め日（10日）を考慮して初期年月を決定
    const getEffectiveYearMonth = useCallback(() => {
        const now = new Date();
        const d = now.getDate();
        let y = now.getFullYear();
        let m = now.getMonth() + 1;
        // 締め日を過ぎていれば「翌月分」の扱い
        const closingDay = user.closingDay || 10;
        if (d > closingDay) {
            m += 1;
            if (m > 12) { m = 1; y += 1; }
        }
        return { y, m };
    }, []);

    const [year, setYear] = useState(() => getEffectiveYearMonth().y);
    const [month, setMonth] = useState(() => getEffectiveYearMonth().m);

    const goToAttendanceTab = useCallback((staffId?: string) => {
        const { y, m } = getEffectiveYearMonth();
        setYear(y);
        setMonth(m);
        if (staffId) setSelectedStaff(staffId);
        setAdminTab("attendance");
    }, [getEffectiveYearMonth]);

    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const fetchPendingRequests = useCallback(async () => {
        try {
            const res = await fetch("/api/leave/list?status=PENDING");
            const data = await res.json();
            if (data.leaveRequests) {
                setPendingRequests(data.leaveRequests);
            }
        } catch (err) {
            console.error("Failed to fetch pending requests:", err);
        }
    }, []);

    useEffect(() => {
        fetchPendingRequests();
    }, [fetchPendingRequests]);

    const handleApproveLeave = async (requestId: string, action: "APPROVED" | "REJECTED") => {
        try {
            const res = await fetch("/api/leave/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId, action }),
            });
            const data = await res.json();
            if (data.success) {
                setAddMessage({ type: "success", text: action === "APPROVED" ? "承認しました ✅" : "却下しました ❌" });
                fetchPendingRequests();
                fetchHistory(); // 履歴も更新（必要なら）
                setTimeout(() => setAddMessage(null), 3000);
            } else {
                setAddMessage({ type: "error", text: data.error || "処理に失敗しました" });
            }
        } catch {
            setAddMessage({ type: "error", text: "ネットワークエラーが発生しました" });
        }
    };
    
    const [historyData, setHistoryData] = useState<HistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [csvLoading, setCsvLoading] = useState(false);
    const [excelLoading, setExcelLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    const [addMessage, setAddMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [adminTab, setAdminTab] = useState<"attendance" | "staff" | "settings" | "calendar" | "specialHours" | "leave_approval">("attendance");
    const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [editStaff, setEditStaff] = useState<any>(null);
    const [editMessage, setEditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [editSaving, setEditSaving] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [showLeaveSummary, setShowLeaveSummary] = useState(false);

    // 一斉退勤用
    const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
    const [showBulkClockOutModal, setShowBulkClockOutModal] = useState(false);
    const [bulkClockOutTime, setBulkClockOutTime] = useState("");
    const [bulkClockOutMemo, setBulkClockOutMemo] = useState("");
    const [bulkProcessing, setBulkProcessing] = useState(false);

    // 一斉出勤用
    const [showBulkClockInModal, setShowBulkClockInModal] = useState(false);
    const [bulkClockInTime, setBulkClockInTime] = useState("");
    const [bulkClockInMemo, setBulkClockInMemo] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // フィルタリング用
    const [filterType, setFilterType] = useState<string>("ALL");

    const [newStaff, setNewStaff] = useState({
        name: "", email: "", loginId: "", employeeNo: "",
        employmentType: "REGULAR", jobTitle: "", assignedClass: "", role: "STAFF",
        defaultStart: "08:30", defaultEnd: "17:30", standardWorkHours: 8.0,
        breakTimeHours: 0.75, breakThresholdHours: 6.0,
        weeklyWorkDays: 5, weeklyWorkHours: 40.0,
        maternityLeaveStart: "", maternityLeaveEnd: "", childcareLeaveStart: "", childcareLeaveEnd: "", expectedReturnDate: "",
        password: "",
        joinDate: "",
    });

    useEffect(() => {
        // 現在時刻をデフォルトにセット (HH:mm)
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setBulkClockOutTime(`${hh}:${mm}`);
        setBulkClockInTime(`${hh}:${mm}`);
    }, [showBulkClockOutModal, showBulkClockInModal]);

    const [fetchError, setFetchError] = useState<string | null>(null);
    const fetchStaffList = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            // キャッシュ回避のためタイムスタンプを付与
            const res = await fetch(`/api/admin/staff?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (res.ok && data.staff) {
                const list = data.staff;
                console.log(`[fetchStaffList] Loaded ${list.length} staff members.`);
                setStaffList(list);
                // 選択中の職員がいない場合のみ、最初の職員を自動選択
                setSelectedStaff(prev => prev || (list.length > 0 ? list[0].id : ""));
            } else {
                const errorDetail = data.error || "職員名簿の取得に失敗しました";
                console.error("[fetchStaffList] API Error:", errorDetail);
                setFetchError(errorDetail);
            }
        } catch (err) {
            console.error("[fetchStaffList] Network Error:", err);
            setFetchError("ネットワークエラーが発生しました");
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStaffList();
    }, [fetchStaffList]);

    // 選択した職員の勤怠を取得
    const fetchHistory = useCallback(async () => {
        if (!selectedStaff) return;
        setHistoryLoading(true);
        try {
            const res = await fetch(`/api/attendance/history?year=${year}&month=${month}&staffId=${selectedStaff}`);
            const data = await res.json();
            setHistoryData(data);
        } catch {
            // error
        }
        setHistoryLoading(false);
    }, [selectedStaff, year, month]);

    // 月の切り替え時に履歴を取得
    useEffect(() => {
        if (selectedStaff) {
            fetchHistory();
        }
    }, [year, month, selectedStaff, fetchHistory]);

    async function handleBulkClockOut() {
        if (selectedStaffIds.length === 0) {
            alert("職員が選択されていません");
            return;
        }
        setBulkProcessing(true);
        try {
            const res = await fetch("/api/admin/attendance/bulk-clock-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    staffIds: selectedStaffIds,
                    clockOutTime: bulkClockOutTime,
                    memo: bulkClockOutMemo,
                }),
            });
            const data = await res.json();
            if (data.success) {
                const summary = data.summary;
                alert(`一斉打刻が完了しました。\n✅ 成功: ${summary.success}名\n⏭️ スキップ: ${summary.skipped}名\n⚠️ エラー: ${summary.error}名`);
                setShowBulkClockOutModal(false);
                setSelectedStaffIds([]);
                setBulkClockOutMemo("");
                if (adminTab === "attendance" && selectedStaff) {
                    fetchHistory();
                }
            } else {
                alert(data.error || "エラーが発生しました");
            }
        } catch (error) {
            alert("通信エラーが発生しました");
        } finally {
            setBulkProcessing(false);
        }
    }

    async function handleBulkClockIn() {
        if (selectedStaffIds.length === 0) {
            alert("職員が選択されていません");
            return;
        }
        setBulkProcessing(true);
        try {
            const res = await fetch("/api/admin/attendance/bulk-clock-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    staffIds: selectedStaffIds,
                    clockInTime: bulkClockInTime,
                    memo: bulkClockInMemo,
                }),
            });
            const data = await res.json();
            if (data.success) {
                const summary = data.summary;
                alert(`一斉出勤打刻が完了しました。\n✅ 成功: ${summary.success}名\n⏭️ スキップ: ${summary.skipped}名\n⚠️ エラー: ${summary.error}名`);
                setShowBulkClockInModal(false);
                setSelectedStaffIds([]);
                setBulkClockInMemo("");
                if (adminTab === "attendance" && selectedStaff) {
                    fetchHistory();
                }
            } else {
                alert(data.error || "エラーが発生しました");
            }
        } catch (error) {
            alert("通信エラーが発生しました");
        } finally {
            setBulkProcessing(false);
        }
    }

    function prevMonth() {
        if (month === 1) { setYear(year - 1); setMonth(12); }
        else setMonth(month - 1);
    }

    function nextMonth() {
        if (month === 12) { setYear(year + 1); setMonth(1); }
        else setMonth(month + 1);
    }

    async function downloadCSV() {
        setCsvLoading(true);
        try {
            const res = await fetch(`/api/admin/csv?year=${year}&month=${month}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `勤怠集計_${year}年${month}月分.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert("CSV出力に失敗しました");
        }
        setCsvLoading(false);
    }

    async function downloadExcel() {
        setExcelLoading(true);
        try {
            const res = await fetch(`/api/admin/excel?year=${year}&month=${month}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `勤怠集計_${year}年${month}月分.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert("Excel出力に失敗しました");
        }
        setExcelLoading(false);
    }

    const staffDetail = staffDetailId ? staffList.find(s => s.id === staffDetailId) : null;
    const selectedStaffInfo = staffList.find((s) => s.id === selectedStaff);
    const empType = selectedStaffInfo?.employmentType || "REGULAR";

    async function handleAddStaff(e: React.FormEvent) {
        e.preventDefault();
        setAddLoading(true);
        setAddMessage(null);
        try {
            console.log("Adding staff:", newStaff);
            const res = await fetch("/api/admin/staff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newStaff, email: newStaff.email || null }),
            });
            const data = await res.json();
            if (data.success) {
                setAddMessage({ type: "success", text: data.message });
                alert("✅ " + data.message);
                
                // 登録後に「全員」フィルタに戻すことで、新規職員をすぐ確認できるようにする
                setFilterType("ALL");
                
                setNewStaff({
                    name: "", email: "", loginId: "", employeeNo: "", employmentType: "REGULAR", jobTitle: "", assignedClass: "", role: "STAFF",
                    defaultStart: "08:30", defaultEnd: "17:30", standardWorkHours: 8.0,
                    breakTimeHours: 0.75, breakThresholdHours: 6.0,
                    weeklyWorkDays: 5, weeklyWorkHours: 40.0, maternityLeaveStart: "", maternityLeaveEnd: "", childcareLeaveStart: "", childcareLeaveEnd: "", expectedReturnDate: "",
                    password: "", joinDate: ""
                });
                setShowAddForm(false);
                await fetchStaffList();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                const errorMsg = data.error || "登録に失敗しました";
                setAddMessage({ type: "error", text: errorMsg });
                alert("⚠️ エラー: " + errorMsg);
            }
        } catch (err) {
            console.error("handleAddStaff error:", err);
            setAddMessage({ type: "error", text: "ネットワークエラーが発生しました" });
            alert("⚠️ ネットワークエラーが発生しました。通信状況を確認してください。");
        }
        setAddLoading(false);
    }

    async function handleEditStaff(e: React.FormEvent) {
        e.preventDefault();
        setEditSaving(true);
        setEditMessage(null);
        try {
            const res = await fetch(`/api/admin/staff/${editStaff.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editStaff),
            });
            const data = await res.json();
            if (data.success) {
                setEditMessage({ type: "success", text: "更新しました" });
                setEditMode(false);
                await fetchStaffList();
            } else {
                setEditMessage({ type: "error", text: data.error });
            }
        } catch {
            setEditMessage({ type: "error", text: "ネットワークエラー" });
        }
        setEditSaving(false);
    }

    async function handleRetireStaff(id: string, name: string) {
        if (!confirm(`この職員を『退職』扱いにします。過去の打刻データは保持され、一覧から非表示になります。よろしいですか？`)) {
            return;
        }
        try {
            const res = await fetch(`/api/admin/staff/${id}`, { 
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "RETIRED" })
            });
            const data = await res.json();
            if (data.success) {
                alert(`${name}さんを退職処理しました`);
                if (staffDetailId === id) setStaffDetailId(null);
                await fetchStaffList();
            } else {
                alert(data.error || "退職処理に失敗しました");
            }
        } catch {
            alert("通信エラーが発生しました");
        }
    }

    async function handleDeleteStaff(id: string, name: string) {
        if (!confirm(`【警告】この職員と、それに紐づくすべての記録を『完全に抹消』します。復元はできません。サンプルデータの整理ですか？`)) {
            return;
        }
        try {
            const res = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                alert(`${name}さんのデータを完全に抹消しました`);
                if (staffDetailId === id) setStaffDetailId(null);
                await fetchStaffList();
            } else {
                alert(data.error || "データ抹消に失敗しました");
            }
        } catch {
            alert("通信エラーが発生しました");
        }
    }

    async function handleBulkRetire() {
        if (selectedStaffIds.length === 0) return;
        if (!confirm(`選択した ${selectedStaffIds.length} 名の職員をまとめて『退職』扱いにします。よろしいですか？`)) {
            return;
        }
        try {
            for (const id of selectedStaffIds) {
                await fetch(`/api/admin/staff/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "RETIRED" })
                });
            }
            alert(`${selectedStaffIds.length}名の退職処理が完了しました`);
            setSelectedStaffIds([]);
            await fetchStaffList();
        } catch {
            alert("通信エラーが発生しました");
        }
    }

    async function handleBulkDelete() {
        if (selectedStaffIds.length === 0) return;
        if (!confirm(`【警告】選択した ${selectedStaffIds.length} 名の職員と、それに紐づくすべての記録を『完全に抹消』します。よろしいですか？`)) {
            return;
        }
        try {
            for (const id of selectedStaffIds) {
                await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
            }
            alert(`${selectedStaffIds.length}名のデータを完全に抹消しました`);
            setSelectedStaffIds([]);
            await fetchStaffList();
        } catch {
            alert("通信エラーが発生しました");
        }
    }

    async function handleExportStaff() {
        setExportLoading(true);
        try {
            const res = await fetch("/api/admin/staff/export");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `職員一覧_${new Date().toISOString().split("T")[0]}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert("職員のエクスポートに失敗しました");
        }
        setExportLoading(false);
    }

    async function handleImportStaff(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportLoading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/admin/staff/import", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                await fetchStaffList();
            } else {
                alert(`${data.error}${data.detail ? ` (${data.detail})` : ""}`);
            }
        } catch {
            alert("インポート中にエラーが発生しました");
        }
        setImportLoading(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>📊 管理モード</h2>
                <p className={styles.subtitle}>職員の勤怠を管理・確認できます</p>
            </div>

            {/* タブ切替 */}
            <div style={{
                display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-lg)",
                background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
                padding: "4px", border: "var(--border-light)",
            }}>
                <button
                    style={{
                        flex: 1, padding: "var(--space-sm) var(--space-md)",
                        borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                        fontWeight: 600, fontSize: "var(--font-size-sm)",
                        background: adminTab === "attendance" ? "var(--color-primary)" : "transparent",
                        color: adminTab === "attendance" ? "var(--text-inverse)" : "var(--text-secondary)",
                        transition: "all var(--transition-fast)",
                    }}
                    onClick={() => goToAttendanceTab()}
                >
                    📅 勤怠管理
                </button>
                <button
                    style={{
                        flex: 1, padding: "var(--space-sm) var(--space-md)",
                        borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                        fontWeight: 600, fontSize: "var(--font-size-sm)",
                        background: adminTab === "staff" ? "var(--color-primary)" : "transparent",
                        color: adminTab === "staff" ? "var(--text-inverse)" : "var(--text-secondary)",
                        transition: "all var(--transition-fast)",
                    }}
                    onClick={() => { setAdminTab("staff"); setStaffDetailId(null); }}
                >
                    👥 職員管理
                </button>
                <button
                    style={{
                        flex: 1, padding: "var(--space-sm) var(--space-md)",
                        borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                        fontWeight: 600, fontSize: "var(--font-size-sm)",
                        background: adminTab === "settings" ? "var(--color-primary)" : "transparent",
                        color: adminTab === "settings" ? "var(--text-inverse)" : "var(--text-secondary)",
                        transition: "all var(--transition-fast)",
                    }}
                    onClick={() => { setAdminTab("settings"); }}
                >
                    ⚙️ 指定休設定
                </button>
                <button
                    style={{
                        flex: 1, padding: "var(--space-sm) var(--space-md)",
                        borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                        fontWeight: 600, fontSize: "var(--font-size-sm)",
                        background: adminTab === "calendar" ? "var(--color-primary)" : "transparent",
                        color: adminTab === "calendar" ? "var(--text-inverse)" : "var(--text-secondary)",
                        transition: "all var(--transition-fast)",
                    }}
                    onClick={() => { setAdminTab("calendar"); }}
                >
                    📆 カレンダー
                </button>
                <button
                    style={{
                        flex: 1, padding: "var(--space-sm) var(--space-md)",
                        borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                        fontWeight: 600, fontSize: "var(--font-size-sm)",
                        background: adminTab === "specialHours" ? "var(--color-primary)" : "transparent",
                        color: adminTab === "specialHours" ? "var(--text-inverse)" : "var(--text-secondary)",
                        transition: "all var(--transition-fast)",
                    }}
                    onClick={() => { setAdminTab("specialHours"); }}
                >
                    🌙 特別勤務
                </button>
            </div>

            {/* ========== 勤怠管理タブ ========== */}
            {adminTab === "attendance" && (<>
                {/* 休暇申請の通知 */}
                {pendingRequests.length > 0 && (
                    <div 
                        onClick={() => setAdminTab("leave_approval")}
                        style={{
                            background: "rgba(231, 76, 60, 0.1)", border: "1px solid var(--color-danger)",
                            borderRadius: "var(--radius-md)", padding: "var(--space-md)",
                            marginBottom: "var(--space-md)", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "var(--space-md)",
                            animation: "pulse 2s infinite"
                        }}
                    >
                        <span style={{ fontSize: "1.2rem" }}>📩</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: "var(--color-danger)" }}>承認待ちの休暇申請があります</div>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                現在、{pendingRequests.length}件の申請が届いています。クリックして承認・却下を確認してください。
                            </div>
                        </div>
                        <span style={{ fontSize: "1.2rem", color: "var(--color-danger)" }}>›</span>
                    </div>
                )}

                {/* コントロールバー */}
                <div className={styles.controls}>
                    <div className={styles.controlRow}>
                        {/* 職員選択 */}
                        <div className={styles.staffSelect}>
                            <label>職員</label>
                            <select
                                className="select"
                                value={selectedStaff}
                                onChange={(e) => setSelectedStaff(e.target.value)}
                            >
                                {staffList.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({EMPLOYMENT_LABELS[s.employmentType]})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 月ナビ */}
                        <div className={styles.monthNav}>
                            <button className={styles.navBtn} onClick={prevMonth}>◀</button>
                            <span className={styles.monthLabel}>
                                {year}年{month}月
                                {historyData && !("error" in historyData) && (historyData as any).period?.label && (
                                    <span style={{ fontSize: "0.7em", color: "var(--text-secondary)", marginLeft: "8px", fontWeight: 400 }}>
                                        ({(historyData as any).period.label})
                                    </span>
                                )}
                            </span>
                            <button className={styles.navBtn} onClick={nextMonth}>▶</button>
                        </div>
                    </div>

                    {/* CSV・Excel出力ボタン */}
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button
                            className={`btn btn-secondary ${styles.csvBtn}`}
                            onClick={downloadCSV}
                            disabled={csvLoading || excelLoading}
                        >
                            {csvLoading ? "出力中..." : "📥 CSV出力"}
                        </button>
                        <button
                            className={`btn btn-primary ${styles.csvBtn}`}
                            onClick={downloadExcel}
                            disabled={csvLoading || excelLoading}
                            style={{ background: '#217346', borderColor: '#217346', color: '#fff' }}
                        >
                            {excelLoading ? "出力中..." : "📊 Excel出力"}
                        </button>
                    </div>
                </div>

                {historyLoading ? (
                    <div className={styles.loadingContainer}>
                        <div className={styles.spinner}></div>
                        <p>読み込み中...</p>
                    </div>
                ) : historyData && !("error" in historyData) ? (
                    <>
                        {/* 集計サマリー */}
                        {historyData.summary ? (
                            <div className={styles.summaryRow}>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>出勤</span>
                                    <span className={styles.summaryValue}>{historyData.summary.workDays}日</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>実労働</span>
                                    <span className={styles.summaryValue}>{historyData.summary.totalWorkHours.toFixed(1)}h</span>
                                </div>
                                {empType !== "PART_TIME" && (
                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>残業</span>
                                        <span className={styles.summaryValue} style={historyData.summary.totalOvertime > 0 ? { color: "var(--color-danger)" } : {}}>
                                            {historyData.summary.totalOvertime.toFixed(2)}h
                                        </span>
                                    </div>
                                )}
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>特休</span>
                                    <span className={styles.summaryValue}>{historyData.summary.publicHolidays}日</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>有休</span>
                                    <span className={styles.summaryValue}>{historyData.summary.paidLeave}日</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>食事</span>
                                    <span className={styles.summaryValue}>{historyData.summary.totalMeals}回</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>遅刻</span>
                                    <span className={styles.summaryValue}>{historyData.summary.lateCount}回</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>早退</span>
                                    <span className={styles.summaryValue}>{historyData.summary.earlyLeaveCount}回</span>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.infoBox}>集計データがありません</div>
                        )}

                        {/* テーブル */}
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>日</th>
                                        <th>曜</th>
                                        <th>出勤</th>
                                        <th>退勤</th>
                                        {empType !== "PART_TIME" && <th>残業</th>}
                                        {empType === "SHORT_TIME" && <th>時短</th>}
                                        <th>休憩</th>
                                        <th>有給h</th>
                                        <th>食事</th>
                                        <th>備考</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyData.days.map((day) => {
                                        const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                                        const d = new Date(day.date);
                                        const hasAtt = day.attendance && day.attendance.status !== "MISSING";
                                        const memoText = day.attendance?.memo || "";
                                        const isLateMemo = memoText.includes("遅刻");
                                        const isEarlyMemo = memoText.includes("早退");
                                        const isHighlighted = isLateMemo || isEarlyMemo;

                                        let note = "";
                                        const isPending = day.leave?.status === "PENDING";
                                        const leaveSuffix = isPending ? " (申請中)" : "";
                                        if (day.attendance?.dayType === "PUBLIC_HOLIDAY") note = "特休";
                                        if (day.attendance?.dayType === "SPECIAL_SICK") note = "感染特休";
                                        if (day.leave?.leaveType === "FULL_DAY") note = `有休${leaveSuffix}`;
                                        if (day.leave?.leaveType === "SPECIAL_SICK") note = `感染特休${day.leave.sickDayNumber || ""}${leaveSuffix}`;

                                        return (
                                            <tr key={day.date}
                                                className={isWeekend ? styles.weekendRow : ""}
                                                style={isHighlighted ? { backgroundColor: "rgba(231, 76, 60, 0.05)" } : {}}
                                            >
                                                <td className={styles.tdDate}>{d.getDate()}</td>
                                                <td className={`${day.dayOfWeek === 0 ? styles.sunday : ""} ${day.dayOfWeek === 6 ? styles.saturday : ""}`}>
                                                    {DAY_NAMES[day.dayOfWeek]}
                                                </td>
                                                <td>{hasAtt ? day.attendance?.clockIn || "—" : "—"}</td>
                                                <td>{hasAtt ? day.attendance?.clockOut || "—" : "—"}</td>
                                                {empType !== "PART_TIME" && (
                                                    <td className={day.attendance && day.attendance.overtimeHours > 0 ? styles.overtime : ""}>
                                                        {hasAtt && day.attendance!.overtimeHours > 0 ? day.attendance!.overtimeHours.toFixed(2) : "—"}
                                                    </td>
                                                )}
                                                {empType === "SHORT_TIME" && (
                                                    <td>{hasAtt && day.attendance!.shortTimeValue !== 0 ? day.attendance!.shortTimeValue : "—"}</td>
                                                )}
                                                <td>{hasAtt && day.attendance!.breakHours > 0 ? `${day.attendance!.breakHours}h` : "—"}</td>
                                                <td>{hasAtt && day.attendance!.hourlyLeave > 0 ? day.attendance!.hourlyLeave : "—"}</td>
                                                <td>{hasAtt && day.attendance!.clockIn ? (day.attendance!.mealCount > 0 ? "○" : "✗") : "—"}</td>
                                                <td className={styles.tdMemo}>
                                                    {day.effectiveSchedule?.title && (
                                                        <span style={{ fontSize: "0.8em", color: "var(--color-accent-dark)", background: "rgba(212, 149, 106, 0.1)", padding: "1px 4px", borderRadius: "4px", marginRight: "4px" }}>
                                                            🚩 {day.effectiveSchedule.title}
                                                        </span>
                                                    )}
                                                    {day.attendance?.dutyType && day.attendance.dutyType !== 'NONE' && (
                                                        <span style={{ fontSize: "0.8em", color: "var(--color-primary)", background: "rgba(52, 152, 219, 0.1)", padding: "1px 4px", borderRadius: "4px", marginRight: "4px" }}>
                                                            {day.attendance.dutyType === 'EARLY' ? '☀️ 早当' : '🌛 遅当'}
                                                        </span>
                                                    )}
                                                    {note && <span className={styles.leaveTag}>{note}</span>}
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
                                                    {day.attendance?.memo || ""}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* 職員一覧（勤怠タブ内の選択用） */}
                        <div className={styles.staffListSection}>
                            <h3 className={styles.sectionTitle}>👥 職員選択</h3>
                            <div className={styles.staffGrid}>
                                {staffList.map((s) => (
                                    <button
                                        key={s.id}
                                        className={`${styles.staffCard} ${s.id === selectedStaff ? styles.staffCardActive : ""}`}
                                        onClick={() => setSelectedStaff(s.id)}
                                    >
                                        <span className={styles.staffCardName}>{s.name}</span>
                                        <span className={styles.staffCardType}>{EMPLOYMENT_LABELS[s.employmentType]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                ) : null}
            </>
            )}

            {/* ========== 職員管理タブ ========== */}
            {adminTab === "staff" && (
                <div>
                    {staffDetail ? (
                        /* 職員詳細画面 */
                        <div key={staffDetail.id} style={{ animation: "slideUp 0.3s ease" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <button
                                    onClick={() => { setStaffDetailId(null); setEditMode(false); setEditMessage(null); }}
                                    style={{
                                        background: "none", border: "none", cursor: "pointer",
                                        color: "var(--color-primary)", fontWeight: 600,
                                        fontSize: "var(--font-size-sm)", marginBottom: "var(--space-md)",
                                        display: "flex", alignItems: "center", gap: "var(--space-xs)",
                                    }}
                                >
                                    ◀ 職員一覧に戻る
                                </button>
                                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                                    <button
                                        onClick={() => {
                                            if (editMode) { setEditMode(false); }
                                            else {
                                                setEditStaff({ ...staffDetail, password: "" });
                                                setEditMode(true);
                                            }
                                            setEditMessage(null);
                                        }}
                                        style={{
                                            background: editMode ? "var(--color-danger-light)" : "var(--color-primary-light)",
                                            border: "none", cursor: "pointer", borderRadius: "8px",
                                            color: editMode ? "var(--color-danger)" : "var(--color-primary-dark)",
                                            fontWeight: 600, fontSize: "var(--font-size-sm)",
                                            padding: "var(--space-sm) var(--space-md)",
                                        }}
                                    >
                                        {editMode ? "✕ 編集キャンセル" : "✏️ 基本情報を編集"}
                                    </button>
                                </div>
                            </div>

                            {editMessage && (
                                <div style={{
                                    padding: "var(--space-sm) var(--space-md)",
                                    borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)",
                                    background: editMessage.type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                                    color: editMessage.type === "success" ? "var(--color-success)" : "var(--color-danger)",
                                    fontSize: "var(--font-size-sm)", fontWeight: 600,
                                }}>{editMessage.text}</div>
                            )}

                            {editMode ? (
                                <form onSubmit={handleEditStaff} style={{ background: "white", padding: "var(--space-lg)", borderRadius: "var(--radius-lg)", marginBottom: "var(--space-md)", boxShadow: "var(--shadow-sm)" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                                        <div className="input-group">
                                            <label>名前 <span style={{ color: "var(--color-danger)" }}>*</span></label>
                                            <input className="input" value={editStaff.name} onChange={(e) => setEditStaff({ ...editStaff, name: e.target.value })} required />
                                        </div>
                                        <div className="input-group">
                                            <label>ログインID <span style={{ color: "var(--color-danger)" }}>*</span></label>
                                            <input className="input" value={editStaff.loginId} onChange={(e) => setEditStaff({ ...editStaff, loginId: e.target.value })} required />
                                        </div>
                                        <div className="input-group">
                                            <label>職員番号 <span style={{ color: "var(--color-danger)" }}>*</span></label>
                                            <input className="input" value={editStaff.employeeNo} onChange={(e) => setEditStaff({ ...editStaff, employeeNo: e.target.value })} required />
                                        </div>
                                        <div className="input-group">
                                            <label>メールアドレス (任意)</label>
                                            <input className="input" type="email" value={editStaff.email || ""} onChange={(e) => setEditStaff({ ...editStaff, email: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>入社年月 (任意)</label>
                                            <input className="input" type="month" value={editStaff.joinDate || ""} onChange={(e) => setEditStaff({ ...editStaff, joinDate: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>雇用形態</label>
                                            <select className="select" value={editStaff.employmentType} onChange={(e) => setEditStaff({ ...editStaff, employmentType: e.target.value })}>
                                                <option value="REGULAR">正規</option>
                                                <option value="SHORT_TIME">時短</option>
                                                <option value="PART_TIME">パート</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>役職 (任意)</label>
                                            <input className="input" type="text" placeholder="例: 副園長、主任" value={editStaff.jobTitle || ""} onChange={(e) => setEditStaff({ ...editStaff, jobTitle: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>担当クラス (任意)</label>
                                            <input className="input" type="text" placeholder="例: すいーとぴー組担任" value={editStaff.assignedClass || ""} onChange={(e) => setEditStaff({ ...editStaff, assignedClass: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>権限</label>
                                            <select className="select" value={editStaff.role} onChange={(e) => setEditStaff({ ...editStaff, role: e.target.value })}>
                                                <option value="STAFF">一般職員</option>
                                                <option value="ADMIN">管理者</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>出勤時刻</label>
                                            <input className="input" type="time" value={editStaff.defaultStart} onChange={(e) => setEditStaff({ ...editStaff, defaultStart: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>退勤時刻</label>
                                            <input className="input" type="time" value={editStaff.defaultEnd} onChange={(e) => setEditStaff({ ...editStaff, defaultEnd: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>所定労働時間</label>
                                            <input className="input" type="number" step="0.25" value={editStaff.standardWorkHours} onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setEditStaff({ ...editStaff, standardWorkHours: v, weeklyWorkHours: v * editStaff.weeklyWorkDays });
                                            }} />
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                                🕒 時間有休1日分: <strong>{Math.ceil(editStaff.standardWorkHours)}h</strong> (切上げ) <br/>
                                                📅 年間上限: <strong>{Math.ceil(editStaff.standardWorkHours) * 5}h</strong>
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label>休憩控除時間 (h) <span style={{fontSize:"0.8em", color:"var(--text-secondary)"}}>(0.75=45分, 1.0=60分)</span></label>
                                            <input className="input" type="number" step="0.05" value={editStaff.breakTimeHours} onChange={(e) => setEditStaff({ ...editStaff, breakTimeHours: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>休憩発生しきい値 (h) <span style={{fontSize:"0.8em", color:"var(--text-secondary)"}}>(例: 6.0なら6h以上勤務で発生)</span></label>
                                            <input className="input" type="number" step="0.5" value={editStaff.breakThresholdHours} onChange={(e) => setEditStaff({ ...editStaff, breakThresholdHours: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>週の所定労働日数 {editStaff.employmentType === 'PART_TIME' && <span style={{ color: "var(--color-danger)" }}>*</span>}</label>
                                            <input className="input" type="number" step="1" min="1" max="7" required={editStaff.employmentType === 'PART_TIME'} value={editStaff.weeklyWorkDays} onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setEditStaff({ ...editStaff, weeklyWorkDays: v, weeklyWorkHours: editStaff.standardWorkHours * v });
                                            }} />
                                        </div>
                                        <div className="input-group">
                                            <label>週の所定労働時間 <span style={{fontSize:"0.8em", color:"var(--text-secondary)"}}>(有休比例付与の計算用)</span> {editStaff.employmentType === 'PART_TIME' && <span style={{ color: "var(--color-danger)" }}>*</span>}</label>
                                            <input className="input" type="number" step="0.25" required={editStaff.employmentType === 'PART_TIME'} value={editStaff.weeklyWorkHours} onChange={(e) => setEditStaff({ ...editStaff, weeklyWorkHours: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>産休開始日</label>
                                            <input className="input" type="date" value={editStaff.maternityLeaveStart || ""} onChange={(e) => setEditStaff({ ...editStaff, maternityLeaveStart: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>産休終了日</label>
                                            <input className="input" type="date" value={editStaff.maternityLeaveEnd || ""} onChange={(e) => setEditStaff({ ...editStaff, maternityLeaveEnd: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>育休開始日</label>
                                            <input className="input" type="date" value={editStaff.childcareLeaveStart || ""} onChange={(e) => setEditStaff({ ...editStaff, childcareLeaveStart: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>復職予定日</label>
                                            <input className="input" type="date" value={editStaff.expectedReturnDate || ""} onChange={(e) => setEditStaff({ ...editStaff, expectedReturnDate: e.target.value })} />
                                        </div>
                                        <div className="input-group" style={{ gridColumn: "span 2" }}>
                                            <label>新しいパスワード (変更する場合のみ)</label>
                                            <input className="input" type="text" placeholder="変更しない場合は空欄" value={editStaff.password} onChange={(e) => setEditStaff({ ...editStaff, password: e.target.value })} />
                                        </div>
                                    </div>
                                    <button type="submit" className="btn btn-primary" disabled={editSaving} style={{ padding: "var(--space-sm) var(--space-lg)" }}>
                                        {editSaving ? "保存中..." : "💾 保存"}
                                    </button>
                                </form>
                            ) : (
                                <div style={{
                                    background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
                                    boxShadow: "var(--shadow-md)", border: "var(--border-light)",
                                    overflow: "hidden",
                                }}>
                                    <div style={{
                                        background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-light))",
                                        padding: "var(--space-xl) var(--space-lg)",
                                        textAlign: "center", color: "var(--text-inverse)",
                                    }}>
                                        <div style={{ fontSize: "3rem", marginBottom: "var(--space-sm)" }}>
                                            {staffDetail.role === "ADMIN" ? "👑" : "👤"}
                                        </div>
                                        <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 700 }}>
                                            {staffDetail.name}
                                        </div>
                                        <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.9, marginTop: "4px" }}>
                                            {EMPLOYMENT_LABELS[staffDetail.employmentType]} · {ROLE_LABELS[staffDetail.role]}
                                        </div>
                                    </div>

                                    <div style={{ padding: "var(--space-lg)" }}>
                                        {[
                                            { label: "職員番号", value: staffDetail.employeeNo, icon: "🆔" },
                                            { label: "ログインID", value: staffDetail.loginId, icon: "🔑" },
                                            { label: "メールアドレス", value: staffDetail.email || "未設定", icon: "✉️" },
                                            { label: "入社年月", value: staffDetail.joinDate || "未設定", icon: "🗓️" },
                                            { label: "有休残日数", value: staffDetail.leaveBalances?.[0] ? `${staffDetail.leaveBalances[0].remainingDays}日` : "未設定", icon: "🌴" },
                                            { label: "雇用形態", value: EMPLOYMENT_LABELS[staffDetail.employmentType], icon: "💼" },
                                            { label: "役職", value: staffDetail.jobTitle || "未設定", icon: "🏷️" },
                                            { label: "担当クラス", value: staffDetail.assignedClass || "未設定", icon: "📛" },
                                            { label: "権限", value: ROLE_LABELS[staffDetail.role], icon: "🛡️" },
                                            { label: "出勤時刻", value: staffDetail.defaultStart, icon: "☀️" },
                                            { label: "退勤時刻", value: staffDetail.defaultEnd, icon: "🌙" },
                                            { label: "所定労働時間", value: `${staffDetail.standardWorkHours}時間`, icon: "⏱" },
                                            { label: "時間有休1日分", value: `${Math.ceil(staffDetail.standardWorkHours)}時間`, icon: "🕒" },
                                            { label: "時間有休上限", value: `${Math.ceil(staffDetail.standardWorkHours) * 5}時間`, icon: "📅" },
                                            { label: "休憩控除時間", value: `${staffDetail.breakTimeHours}時間 (${Math.round(staffDetail.breakTimeHours * 60)}分)`, icon: "☕" },
                                            { label: "休憩発生しきい値", value: `${staffDetail.breakThresholdHours}時間`, icon: "⌛" },
                                            { label: "産休開始日", value: staffDetail.maternityLeaveStart ? staffDetail.maternityLeaveStart.replace(/-/g, '/') : "—", icon: "🍼" },
                                            { label: "産休終了日", value: staffDetail.maternityLeaveEnd ? staffDetail.maternityLeaveEnd.replace(/-/g, '/') : "—", icon: "🍼" },
                                            { label: "育休開始日", value: staffDetail.childcareLeaveStart ? staffDetail.childcareLeaveStart.replace(/-/g, '/') : "—", icon: "👶" },
                                            { label: "復職予定日", value: staffDetail.expectedReturnDate ? staffDetail.expectedReturnDate.replace(/-/g, '/') : "—", icon: "📅" },
                                        ].map((item, i) => (
                                            <div key={i} style={{
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                padding: "var(--space-md) 0",
                                                borderBottom: i < 16 ? "1px solid rgba(232, 113, 159, 0.08)" : "none",
                                            }}>
                                                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
                                                    <span>{item.icon}</span> {item.label}
                                                </span>
                                                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "var(--font-size-sm)" }}>
                                                    {item.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 危険な操作セクション */}
                            <div style={{
                                marginTop: "var(--space-lg)",
                                padding: "var(--space-lg)",
                                background: "rgba(231, 76, 60, 0.03)",
                                border: "1px dashed rgba(231, 76, 60, 0.3)",
                                borderRadius: "var(--radius-lg)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "var(--space-md)"
                            }}>
                                <h4 style={{ color: "var(--color-danger)", margin: 0, fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>⚠️ 制限のある操作 / データ削除</h4>
                                <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
                                    <button
                                        onClick={() => handleRetireStaff(staffDetail.id, staffDetail.name)}
                                        style={{
                                            flex: 1, minWidth: "150px",
                                            background: "#fff", border: "1px solid #ffeeba",
                                            color: "#856404", cursor: "pointer", borderRadius: "8px",
                                            fontWeight: 600, fontSize: "var(--font-size-sm)", padding: "var(--space-sm) var(--space-md)",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                                        }}
                                        title="退職（一覧から非表示になり、打刻ログは保持されます）"
                                    >
                                        <span>🚪</span> 退職処理
                                    </button>
                                    <button
                                        onClick={() => handleDeleteStaff(staffDetail.id, staffDetail.name)}
                                        style={{
                                            flex: 1, minWidth: "150px",
                                            background: "rgba(220, 53, 69, 0.05)", border: "1px solid rgba(220, 53, 69, 0.3)",
                                            color: "var(--color-danger)", cursor: "pointer", borderRadius: "8px",
                                            fontWeight: 600, fontSize: "var(--font-size-sm)", padding: "var(--space-sm) var(--space-md)",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                                        }}
                                        title="完全削除（全ての関連データを含めて物理削除）"
                                    >
                                        <span>⚠️</span> データの完全抹消
                                    </button>
                                </div>
                                <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>
                                    ※退職処理は職員リストから非表示になりますがデータは残ります。データ抹消は全ての記録が完全に消去され、元に戻せません。
                                </p>
                            </div>

                            <AdminStaffLeaveBalance staffId={staffDetail.id} />
                            <AdminStaffSpecialBalances staffId={staffDetail.id} />
                            <AdminStaffAbsenceRecord staffId={staffDetail.id} />
                            <AdminStaffLeaveHistory staffId={staffDetail.id} />

                            <button
                                onClick={() => goToAttendanceTab(staffDetail.id)}
                                className="btn btn-primary"
                                style={{ width: "100%", marginTop: "var(--space-lg)", padding: "var(--space-md)" }}
                            >
                                📅 この職員の勤怠を確認
                            </button>
                        </div>
                    ) : (
                        <div>
                            {loading && (
                                <div style={{ textAlign: "center", padding: "var(--space-md)" }}>
                                    <div className={styles.spinner} style={{ margin: "0 auto var(--space-sm)" }}></div>
                                    <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>読み込み中...</p>
                                </div>
                            )}

                            {fetchError && (
                                <div style={{
                                    padding: "var(--space-md)", background: "var(--color-danger-bg)",
                                    color: "var(--color-danger)", borderRadius: "var(--radius-md)",
                                    marginBottom: "var(--space-md)", fontWeight: 600, fontSize: "0.9rem",
                                    border: "1px solid var(--color-danger)"
                                }}>
                                    ⚠️ {fetchError}
                                    <button
                                        onClick={() => fetchStaffList()}
                                        style={{ marginLeft: "var(--space-sm)", textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}
                                    >
                                        再試行
                                    </button>
                                </div>
                            )}

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-md)", flexWrap: "wrap", gap: "var(--space-sm)" }}>
                                <h3 className={styles.sectionTitle} style={{ margin: 0 }}>👥 職員一覧 ({staffList.length}名)</h3>
                                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "var(--font-size-sm)" }}
                                        onClick={handleExportStaff}
                                        disabled={exportLoading}
                                    >
                                        {exportLoading ? "出力中..." : "📥 Excel出力"}
                                    </button>
                                    <input
                                        type="file"
                                        accept=".xlsx"
                                        style={{ display: "none" }}
                                        ref={fileInputRef}
                                        onChange={handleImportStaff}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "var(--font-size-sm)" }}
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={importLoading}
                                    >
                                        {importLoading ? "読取中..." : "📤 Excel一括登録"}
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "var(--font-size-sm)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}
                                        onClick={() => {
                                            if (selectedStaffIds.length === 0) {
                                                alert("打刻する職員をチェックボックスで選択してください");
                                                return;
                                            }
                                            setShowBulkClockInModal(true);
                                        }}
                                    >
                                        🕒 一斉出勤打刻
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "var(--font-size-sm)", background: "var(--color-danger-light)", color: "var(--color-danger)" }}
                                        onClick={() => {
                                            if (selectedStaffIds.length === 0) {
                                                alert("打刻する職員をチェックボックスで選択してください");
                                                return;
                                            }
                                            setShowBulkClockOutModal(true);
                                        }}
                                    >
                                        🕒 一斉退勤打刻
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "var(--font-size-sm)", color: "var(--color-primary-dark)", border: "1px solid var(--color-primary-light)" }}
                                        onClick={() => setShowLeaveSummary(!showLeaveSummary)}
                                    >
                                        {showLeaveSummary ? "✕ 一覧を閉じる" : "🌴 休暇状況一覧"}
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "var(--font-size-sm)" }}
                                        onClick={() => {
                                            setShowAddForm(!showAddForm);
                                            setShowLeaveSummary(false);
                                        }}
                                    >
                                        {showAddForm ? "✕ 閉じる" : "➕ 職員追加"}
                                    </button>
                                </div>
                            </div>

                            {/* フィルタリングボタン */}
                            <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)", paddingLeft: "4px", flexWrap: "wrap" }}>
                                <button
                                    onClick={() => setFilterType("ALL")}
                                    style={{
                                        padding: "var(--space-xs) var(--space-md)", borderRadius: "20px", border: "1px solid var(--color-primary)",
                                        fontSize: "var(--font-size-sm)", fontWeight: 600, cursor: "pointer",
                                        background: filterType === "ALL" ? "var(--color-primary)" : "white",
                                        color: filterType === "ALL" ? "white" : "var(--color-primary)",
                                        transition: "all 0.2s"
                                    }}
                                >
                                    全員 ({staffList.length})
                                </button>
                                <button
                                    onClick={() => setFilterType("REGULAR")}
                                    style={{
                                        padding: "var(--space-xs) var(--space-md)", borderRadius: "20px", border: "1px solid var(--color-primary)",
                                        fontSize: "var(--font-size-sm)", fontWeight: 600, cursor: "pointer",
                                        background: filterType === "REGULAR" ? "var(--color-primary)" : "white",
                                        color: filterType === "REGULAR" ? "white" : "var(--color-primary)",
                                        transition: "all 0.2s"
                                    }}
                                >
                                    正規 ({staffList.filter(s => s.employmentType === "REGULAR").length})
                                </button>
                                <button
                                    onClick={() => setFilterType("SHORT_TIME")}
                                    style={{
                                        padding: "var(--space-xs) var(--space-md)", borderRadius: "20px", border: "1px solid var(--color-primary)",
                                        fontSize: "var(--font-size-sm)", fontWeight: 600, cursor: "pointer",
                                        background: filterType === "SHORT_TIME" ? "var(--color-primary)" : "white",
                                        color: filterType === "SHORT_TIME" ? "white" : "var(--color-primary)",
                                        transition: "all 0.2s"
                                    }}
                                >
                                    時短 ({staffList.filter(s => s.employmentType === "SHORT_TIME").length})
                                </button>
                                <button
                                    onClick={() => setFilterType("PART_TIME")}
                                    style={{
                                        padding: "var(--space-xs) var(--space-md)", borderRadius: "20px", border: "1px solid var(--color-primary)",
                                        fontSize: "var(--font-size-sm)", fontWeight: 600, cursor: "pointer",
                                        background: filterType === "PART_TIME" ? "var(--color-primary)" : "white",
                                        color: filterType === "PART_TIME" ? "white" : "var(--color-primary)",
                                        transition: "all 0.2s"
                                    }}
                                >
                                    パート ({staffList.filter(s => s.employmentType === "PART_TIME").length})
                                </button>
                            </div>

                            {addMessage && (
                                <div style={{
                                    padding: "var(--space-sm) var(--space-md)",
                                    borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)",
                                    background: addMessage.type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                                    color: addMessage.type === "success" ? "var(--color-success)" : "var(--color-danger)",
                                    fontSize: "var(--font-size-sm)", fontWeight: 600,
                                }}>
                                    {addMessage.type === "success" ? "✅" : "⚠️"} {addMessage.text}
                                </div>
                            )}

                            {showAddForm && (
                                <form onSubmit={handleAddStaff} style={{
                                    background: "var(--bg-card)", border: "var(--border-light)",
                                    borderRadius: "var(--radius-lg)", padding: "var(--space-lg)",
                                    marginBottom: "var(--space-lg)", boxShadow: "var(--shadow-sm)",
                                }}>
                                    <div style={{ fontSize: "var(--font-size-base)", fontWeight: 700, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
                                        ➕ 新しい職員を登録
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                                        <div className="input-group">
                                            <label>名前 <span style={{ color: "var(--color-danger)" }}>*</span></label>
                                            <input className="input" placeholder="例: 山田太郎" value={newStaff.name}
                                                onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} required />
                                        </div>
                                        <div className="input-group">
                                            <label>ログインID <span style={{ color: "var(--color-danger)" }}>*</span></label>
                                            <input className="input" placeholder="例: yamadataro" value={newStaff.loginId}
                                                onChange={(e) => setNewStaff({ ...newStaff, loginId: e.target.value })} required />
                                        </div>
                                        <div className="input-group">
                                            <label>メールアドレス (任意)</label>
                                            <input className="input" type="email" placeholder="例: yamada@example.com" value={newStaff.email}
                                                onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>入社年月 (任意)</label>
                                            <input className="input" type="month" value={newStaff.joinDate}
                                                onChange={(e) => setNewStaff({ ...newStaff, joinDate: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>職員番号 <span style={{ color: "var(--color-danger)" }}>*</span></label>
                                            <input className="input" placeholder="例: 301" value={newStaff.employeeNo}
                                                onChange={(e) => setNewStaff({ ...newStaff, employeeNo: e.target.value })} required />
                                        </div>
                                        <div className="input-group">
                                            <label>雇用形態</label>
                                            <select className="select" value={newStaff.employmentType}
                                                onChange={(e) => setNewStaff({ ...newStaff, employmentType: e.target.value })}>
                                                <option value="REGULAR">正規</option>
                                                <option value="SHORT_TIME">時短</option>
                                                <option value="PART_TIME">パート</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>役職 (任意)</label>
                                            <input className="input" type="text" placeholder="例: 副園長、主任" value={newStaff.jobTitle}
                                                onChange={(e) => setNewStaff({ ...newStaff, jobTitle: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>担当クラス (任意)</label>
                                            <input className="input" type="text" placeholder="例: すいーとぴー組担任" value={newStaff.assignedClass}
                                                onChange={(e) => setNewStaff({ ...newStaff, assignedClass: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>出勤時刻</label>
                                            <input className="input" type="time" value={newStaff.defaultStart}
                                                onChange={(e) => setNewStaff({ ...newStaff, defaultStart: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>退勤時刻</label>
                                            <input className="input" type="time" value={newStaff.defaultEnd}
                                                onChange={(e) => setNewStaff({ ...newStaff, defaultEnd: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>所定労働時間</label>
                                            <input className="input" type="number" step="0.25" value={newStaff.standardWorkHours}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value);
                                                    setNewStaff({ ...newStaff, standardWorkHours: v, weeklyWorkHours: v * newStaff.weeklyWorkDays });
                                                }} />
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                                🕒 時間有休1日分: <strong>{Math.ceil(newStaff.standardWorkHours)}h</strong> (切上げ) <br/>
                                                📅 年間上限: <strong>{Math.ceil(newStaff.standardWorkHours) * 5}h</strong>
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label>休憩控除時間 (h) <span style={{fontSize:"0.8em", color:"var(--text-secondary)"}}>(0.75=45分, 1.0=60分)</span></label>
                                            <input className="input" type="number" step="0.05" value={newStaff.breakTimeHours}
                                                onChange={(e) => setNewStaff({ ...newStaff, breakTimeHours: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>休憩発生しきい値 (h) <span style={{fontSize:"0.8em", color:"var(--text-secondary)"}}>(例: 6.0なら6h以上勤務で発生)</span></label>
                                            <input className="input" type="number" step="0.5" value={newStaff.breakThresholdHours}
                                                onChange={(e) => setNewStaff({ ...newStaff, breakThresholdHours: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>週の所定労働日数 {newStaff.employmentType === 'PART_TIME' && <span style={{ color: "var(--color-danger)" }}>*</span>}</label>
                                            <input className="input" type="number" step="1" min="1" max="7" required={newStaff.employmentType === 'PART_TIME'} value={newStaff.weeklyWorkDays}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value);
                                                    setNewStaff({ ...newStaff, weeklyWorkDays: v, weeklyWorkHours: newStaff.standardWorkHours * v });
                                                }} />
                                        </div>
                                        <div className="input-group">
                                            <label>週の所定労働時間 <span style={{fontSize:"0.8em", color:"var(--text-secondary)"}}>(有休比例付与の計算用)</span> {newStaff.employmentType === 'PART_TIME' && <span style={{ color: "var(--color-danger)" }}>*</span>}</label>
                                            <input className="input" type="number" step="0.25" required={newStaff.employmentType === 'PART_TIME'} value={newStaff.weeklyWorkHours}
                                                onChange={(e) => setNewStaff({ ...newStaff, weeklyWorkHours: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>産休開始日</label>
                                            <input className="input" type="date" value={newStaff.maternityLeaveStart}
                                                onChange={(e) => setNewStaff({ ...newStaff, maternityLeaveStart: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>産休終了日</label>
                                            <input className="input" type="date" value={newStaff.maternityLeaveEnd || ""}
                                                onChange={(e) => setNewStaff({ ...newStaff, maternityLeaveEnd: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>育休開始日</label>
                                            <input className="input" type="date" value={newStaff.childcareLeaveStart}
                                                onChange={(e) => setNewStaff({ ...newStaff, childcareLeaveStart: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>復職予定日</label>
                                            <input className="input" type="date" value={newStaff.expectedReturnDate}
                                                onChange={(e) => setNewStaff({ ...newStaff, expectedReturnDate: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>パスワード</label>
                                            <input className="input" type="password" placeholder="空欄は password123" value={newStaff.password}
                                                onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>権限</label>
                                            <select className="select" value={newStaff.role}
                                                onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}>
                                                <option value="STAFF">一般職員</option>
                                                <option value="ADMIN">管理者</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                                        {addMessage && addMessage.type === "error" && (
                                            <div style={{
                                                padding: "var(--space-sm) var(--space-md)",
                                                borderRadius: "var(--radius-md)",
                                                background: "var(--color-danger-bg)",
                                                color: "var(--color-danger)",
                                                fontSize: "var(--font-size-sm)", fontWeight: 600,
                                                border: "1px solid var(--color-danger)"
                                            }}>
                                                ⚠️ {addMessage.text}
                                            </div>
                                        )}
                                        <div style={{ display: "flex", gap: "var(--space-md)", justifyContent: "flex-end" }}>
                                            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>キャンセル</button>
                                            <button type="submit" className="btn btn-primary" disabled={addLoading} style={{ minWidth: "150px" }}>
                                                {addLoading ? "保存中..." : "💾 登録を保存"}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {/* 休暇状況サマリー表示 */}
                            {showLeaveSummary && (
                                <div style={{ 
                                    background: "var(--bg-card)", border: "var(--border-light)", 
                                    borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", 
                                    marginBottom: "var(--space-lg)", boxShadow: "var(--shadow-sm)",
                                    overflowX: "auto"
                                }}>
                                    <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: 700, marginBottom: "var(--space-md)", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                                        🌴 職員別 休暇状況一覧 (今年度)
                                    </h3>
                                    <table className={styles.table} style={{ fontSize: "0.85rem" }}>
                                        <thead>
                                            <tr>
                                                <th style={{ whiteSpace: "nowrap" }}>No.</th>
                                                <th style={{ whiteSpace: "nowrap" }}>名前</th>
                                                <th style={{ whiteSpace: "nowrap" }}>形態</th>
                                                <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>付与日数</th>
                                                <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>利用日数</th>
                                                <th style={{ whiteSpace: "nowrap", textAlign: "right" }}>残日数</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {staffList.map(s => {
                                                const bal = s.leaveBalances?.[0];
                                                return (
                                                    <tr key={s.id}>
                                                        <td>{s.employeeNo}</td>
                                                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                                                        <td>{EMPLOYMENT_LABELS[s.employmentType]}</td>
                                                        <td style={{ textAlign: "right" }}>{bal ? `${bal.grantedDays}日` : "—"}</td>
                                                        <td style={{ textAlign: "right", color: "var(--color-danger)" }}>{bal ? `${bal.usedDays}日` : "—"}</td>
                                                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-primary)" }}>{bal ? `${bal.remainingDays}日` : "—"}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div style={{ marginBottom: "var(--space-sm)", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "48px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", paddingLeft: "4px" }}>
                                    <input 
                                        type="checkbox" 
                                        checked={staffList.length > 0 && selectedStaffIds.length === staffList.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedStaffIds(staffList.map(s => s.id));
                                            } else {
                                                setSelectedStaffIds([]);
                                            }
                                        }}
                                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                                    />
                                    <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", fontWeight: 600 }}>
                                        全選択 ({selectedStaffIds.length} 名選択中)
                                    </span>
                                </div>

                                {selectedStaffIds.length > 0 && (
                                    <div style={{ display: "flex", gap: "var(--space-sm)", animation: "fadeIn 0.2s ease" }}>
                                        {/* 一括退職・抹消ボタンは個別の詳細画面から行う運用とするため削除 */}
                                    </div>
                                )}
                            </div>

                            <div className={styles.staffGrid}>
                                {staffList
                                    .filter(s => filterType === "ALL" || s.employmentType === filterType)
                                    .map((s) => {
                                    const today = new Date().toISOString().split('T')[0];
                                    const isMaternity = s.maternityLeaveStart && s.maternityLeaveStart <= today && (!s.expectedReturnDate || today <= s.expectedReturnDate);
                                    const isChildcare = s.childcareLeaveStart && s.childcareLeaveStart <= today && (!s.expectedReturnDate || today <= s.expectedReturnDate);
                                    const leaveType = isChildcare ? "育休" : (isMaternity ? "産休" : null);
                                    const leaveStart = isChildcare ? s.childcareLeaveStart : s.maternityLeaveStart;
                                    
                                    let alertMsg = null;
                                    if (leaveType && s.expectedReturnDate) {
                                        const diffDays = (new Date(s.expectedReturnDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
                                        if (diffDays >= 0 && diffDays <= 30) {
                                            alertMsg = `復職間近 (あと${Math.ceil(diffDays)}日)`;
                                        }
                                    }
                                    const isSelected = selectedStaffIds.includes(s.id);

                                     return (
                                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedStaffIds([...selectedStaffIds, s.id]);
                                                    } else {
                                                        setSelectedStaffIds(selectedStaffIds.filter(id => id !== s.id));
                                                    }
                                                }}
                                                style={{ width: "20px", height: "20px", cursor: "pointer" }}
                                            />
                                            <button
                                                className={styles.staffCard}
                                                onClick={() => setStaffDetailId(s.id)}
                                                style={{ 
                                                    flex: 1, margin: 0,
                                                    ...(alertMsg ? { borderLeft: "4px solid var(--color-warning)", background: "#fffdf5" } : (leaveType ? { borderLeft: "4px solid #F06292", background: "#fcf0f5" } : {}))
                                                }}
                                            >
                                            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", width: "100%" }}>
                                                <span style={{ fontSize: "1.5rem" }}>{s.role === "ADMIN" ? "👑" : "👤"}</span>
                                                <div style={{ flex: 1, textAlign: "left" }}>
                                                    <span className={styles.staffCardName}>{s.name}</span>
                                                    {leaveType && (
                                                        <span style={{
                                                            background: alertMsg ? "#fff3cd" : "#ffe4e1",
                                                            color: alertMsg ? "#856404" : "#d63384",
                                                            fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px",
                                                            marginLeft: "8px", fontWeight: 700,
                                                            display: "inline-block", verticalAlign: "middle"
                                                        }}>
                                                            {leaveType}中 ({leaveStart?.replace(/-/g, '/')}〜)
                                                            {alertMsg && <span style={{ marginLeft: "4px", color: "#856404", borderLeft: "1px solid #ffeeba", paddingLeft: "4px" }}>⚠️ {alertMsg}</span>}
                                                        </span>
                                                    )}
                                                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: "4px" }}>
                                                        No.{s.employeeNo} · {EMPLOYMENT_LABELS[s.employmentType]} 
                                                        {s.jobTitle ? ` · ${s.jobTitle}` : ""}
                                                        {s.assignedClass ? ` · ${s.assignedClass}` : ""}
                                                         {' · '}有休: {s.leaveBalances?.[0] ? `${s.leaveBalances[0].usedDays}/${s.leaveBalances[0].grantedDays} (残${s.leaveBalances[0].remainingDays})日` : "—"}
                                                    </div>
                                                </div>
                                                <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-lg)" }}>›</span>
                                             </div>
                                         </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== 設定タブ ========== */}
            {adminTab === "settings" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
                    <AdminDutySettings />
                    <AdminAnnualLeaveGrant />
                    <AdminSpecialLeaveSettings />
                </div>
            )}

            {/* ========== 休暇承認タブ ========== */}
            {adminTab === "leave_approval" && (
                <div style={{ background: "var(--bg-card)", border: "var(--border-light)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>📩 承認待ちの休暇申請</h3>
                        <span style={{ background: "var(--color-danger)", color: "white", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold" }}>
                            未承認: {pendingRequests.length}件
                        </span>
                    </div>

                    {pendingRequests.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "var(--space-xl)", color: "var(--text-secondary)" }}>
                            <div style={{ fontSize: "3rem", marginBottom: "var(--space-md)" }}>✅</div>
                            <p>現在、承認待ちの申請はありません</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                            {pendingRequests.map((req) => (
                                <div key={req.id} style={{ 
                                    background: "var(--bg-card-hover)", border: "var(--border-light)", 
                                    borderRadius: "var(--radius-md)", padding: "var(--space-md)",
                                    boxShadow: "var(--shadow-xs)",
                                }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap", marginBottom: "var(--space-md)" }}>
                                        <div style={{ minWidth: "200px" }}>
                                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                                                No.{req.staff?.employeeNo} {req.staff?.name}
                                            </div>
                                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                                📅 {req.leaveDate} ({DAY_NAMES[new Date(req.leaveDate).getDay()]})
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
                                            <button className="btn btn-primary" onClick={() => handleApproveLeave(req.id, "APPROVED")} style={{ padding: "var(--space-sm) var(--space-md)", fontSize: "0.9rem" }}>
                                                承認する
                                            </button>
                                            <button className="btn btn-secondary" onClick={() => handleApproveLeave(req.id, "REJECTED")} style={{ padding: "var(--space-sm) var(--space-md)", fontSize: "0.9rem", color: "var(--color-danger)" }}>
                                                却下
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)", background: "white", padding: "var(--space-sm)", borderRadius: "var(--radius-sm)", border: "1px solid #eee" }}>
                                        <div>
                                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>休暇種別</span>
                                            <span style={{ fontWeight: 600 }}>
                                                {req.leaveType === "FULL_DAY" ? "有休（全日）" :
                                                 req.leaveType === "HALF_DAY" ? `半日休暇 (${req.halfDayPeriod === "AM" ? "午前" : "午後"})` :
                                                 req.leaveType === "HOURLY" ? `時間有給 (${req.leaveHours}時間)` :
                                                 req.leaveType === "SPECIAL_SICK" ? "感染症特休" : 
                                                 req.leaveType === "NURSING" ? "看護休暇" :
                                                 req.leaveType === "CARE" ? "介護休暇" : "特別休暇"}
                                            </span>
                                        </div>
                                        {req.reason && (
                                            <div>
                                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>理由</span>
                                                <span style={{ fontSize: "0.9rem" }}>{req.reason}</span>
                                            </div>
                                        )}
                                        <div>
                                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>申請日時</span>
                                            <span style={{ fontSize: "0.8rem" }}>{new Date(req.createdAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ========== カレンダータブ ========== */}
            {adminTab === "calendar" && (
                <CalendarAdmin orgId={user.orgId} />
            )}

            {/* ========== 特別勤務設定タブ ========== */}
            {adminTab === "specialHours" && (
                <AdminScheduleOverride orgId={user.orgId} />
            )}

            {/* 一斉退勤打刻モーダル */}
            {showBulkClockOutModal && (
                <div className="modal-overlay" onClick={() => setShowBulkClockOutModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
                        <div className="modal-header">
                            <h2 style={{ fontSize: "1.2rem", fontWeight: "bold" }}>🕒 一斉退勤打刻</h2>
                            <button className="modal-close" onClick={() => setShowBulkClockOutModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                                選択した {selectedStaffIds.length} 名の退勤記録を一括で行います。<br/>
                                <span style={{ color: "var(--color-danger)", fontSize: "0.8rem" }}>※既に出勤している職員が対象です。</span>
                            </p>
                            
                            <div className="input-group">
                                <label>退勤時刻</label>
                                <input 
                                    type="time" 
                                    className="input"
                                    value={bulkClockOutTime}
                                    onChange={(e) => setBulkClockOutTime(e.target.value)}
                                />
                            </div>

                            <div className="input-group" style={{ marginTop: "var(--space-md)" }}>
                                <label>備考（例：全体会議のため）</label>
                                <input 
                                    type="text" 
                                    className="input"
                                    placeholder="一括入力する理由"
                                    value={bulkClockOutMemo}
                                    onChange={(e) => setBulkClockOutMemo(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer" style={{ marginTop: "var(--space-lg)" }}>
                            <button 
                                className="btn btn-primary w-full"
                                onClick={handleBulkClockOut}
                                disabled={bulkProcessing}
                            >
                                {bulkProcessing ? "処理中..." : "✅ 一斉打刻を実行"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 一斉出勤打刻モーダル */}
            {showBulkClockInModal && (
                <div className="modal-overlay" onClick={() => setShowBulkClockInModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
                        <div className="modal-header">
                            <h2 style={{ fontSize: "1.2rem", fontWeight: "bold" }}>🕒 一斉出勤打刻</h2>
                            <button className="modal-close" onClick={() => setShowBulkClockInModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                                選択した {selectedStaffIds.length} 名の出勤記録を一括で行います。<br/>
                                <span style={{ color: "var(--color-danger)", fontSize: "0.8rem" }}>※今日の打刻がまだ無い職員が対象です。</span>
                            </p>
                            
                            <div className="input-group">
                                <label>出勤時刻</label>
                                <input 
                                    type="time" 
                                    className="input"
                                    value={bulkClockInTime}
                                    onChange={(e) => setBulkClockInTime(e.target.value)}
                                />
                            </div>

                            <div className="input-group" style={{ marginTop: "var(--space-md)" }}>
                                <label>備考（例：交通機関の遅延など）</label>
                                <input 
                                    type="text" 
                                    className="input"
                                    placeholder="一括入力する理由"
                                    value={bulkClockInMemo}
                                    onChange={(e) => setBulkClockInMemo(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer" style={{ marginTop: "var(--space-lg)" }}>
                            <button 
                                className="btn btn-primary w-full"
                                onClick={handleBulkClockIn}
                                disabled={bulkProcessing}
                            >
                                {bulkProcessing ? "処理中..." : "✅ 一斉出勤を実行"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
