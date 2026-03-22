"use client";
import { useState, useEffect, useCallback } from "react";

interface Props {
    staffId: string;
}

interface LeaveRequest {
    id: string;
    leaveType: string;
    leaveDate: string;
    halfDayPeriod: string | null;
    leaveHours: number | null;
    leaveStartTime?: string | null;
    leaveEndTime?: string | null;
    reason: string | null;
    status: string;
    createdAt: string;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
    FULL_DAY: "全休（有休）",
    HALF_DAY: "半休（有休）",
    HOURLY: "時間休（有休）",
    SPECIAL_OTHER: "特休",
    SPECIAL_SICK: "感染症特休",
    UNPAID: "欠勤（無給）",
    SYSTEM_GRANT: "年次有休付与",
};

export default function AdminStaffLeaveHistory({ staffId }: Props) {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLeaves = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/leave/list?staffId=${staffId}`);
            const data = await res.json();
            if (data.leaveRequests) {
                setLeaves(data.leaveRequests);
            }
        } catch {
            // Error handling ignored for simplicity
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        fetchLeaves();
    }, [fetchLeaves]);

    if (loading) return null;

    return (
        <div style={{ padding: "var(--space-md)", background: "white", borderRadius: "var(--radius-lg)", marginTop: "var(--space-lg)", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
            <h4 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--text-primary)", marginBottom: "var(--space-md)" }}>📅 休暇申請・取得履歴</h4>
            {leaves.length === 0 ? (
                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>休暇の申請・取得履歴はありません。</p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-main)", color: "var(--text-secondary)", textAlign: "left", borderBottom: "2px solid var(--border-light)" }}>
                                <th style={{ padding: "var(--space-sm)" }}>申請日</th>
                                <th style={{ padding: "var(--space-sm)" }}>取得日</th>
                                <th style={{ padding: "var(--space-sm)" }}>種類</th>
                                <th style={{ padding: "var(--space-sm)" }}>理由</th>
                                <th style={{ padding: "var(--space-sm)" }}>状態</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaves.map(req => (
                                <tr key={req.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                                    <td style={{ padding: "var(--space-sm)", color: "var(--text-secondary)" }}>
                                        {new Date(req.createdAt).toLocaleDateString("ja-JP")}
                                    </td>
                                    <td style={{ padding: "var(--space-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                                        {req.leaveDate}
                                    </td>
                                    <td style={{ padding: "var(--space-sm)" }}>
                                        {LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType}
                                        {req.leaveType === "HALF_DAY" && req.halfDayPeriod ? ` (${req.halfDayPeriod === "AM" ? "午前" : "午後"})` : ""}
                                        {req.leaveType === "HOURLY" && req.leaveStartTime && req.leaveEndTime && req.leaveHours ? ` (${req.leaveStartTime}〜${req.leaveEndTime}・${req.leaveHours}時間)` : ""}
                                    </td>
                                    <td style={{ padding: "var(--space-sm)", color: "var(--text-secondary)" }}>
                                        {req.reason || "-"}
                                    </td>
                                    <td style={{ padding: "var(--space-sm)" }}>
                                        <span style={{
                                            padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold", display: "inline-block",
                                            background: req.status === "APPROVED" ? "var(--color-success-bg)" : req.status === "REJECTED" ? "var(--color-danger-bg)" : "rgba(241, 196, 15, 0.15)",
                                            color: req.status === "APPROVED" ? "var(--color-success)" : req.status === "REJECTED" ? "var(--color-danger)" : "#F39C12"
                                        }}>
                                            {req.status === "APPROVED" ? "承認済" : req.status === "REJECTED" ? "却下" : "承認待ち"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
