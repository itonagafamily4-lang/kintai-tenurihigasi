"use client";
import { useState, useEffect, useCallback } from "react";

interface Props {
    staffId: string;
}

interface LeaveBalance {
    totalDays: number;
    usedDays: number;
    remainingDays: number;
    grantedDays: number;
    carriedOverDays: number;
    timeLeaveUsedHours: number;
    staff: {
        standardWorkHours: number;
    };
}

export default function AdminStaffLeaveBalance({ staffId }: Props) {
    const [balance, setBalance] = useState<LeaveBalance | null>(null);
    const [loading, setLoading] = useState(true);
    const [fiscalYear, setFiscalYear] = useState<number>(0);
    const [grantedDays, setGrantedDays] = useState("0");
    const [carriedOverDays, setCarriedOverDays] = useState("0");
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const fetchBalance = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/leave-balance`);
            const data = await res.json();
            if (data.balance) {
                setBalance(data.balance);
                setFiscalYear(data.fiscalYear);
                setGrantedDays(data.balance.grantedDays.toString());
                setCarriedOverDays(data.balance.carriedOverDays.toString());
            } else {
                setBalance(null);
                setFiscalYear(data.fiscalYear);
                setGrantedDays("0");
                setCarriedOverDays("0");
            }
        } catch {
            // Error
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        fetchBalance();
    }, [fetchBalance]);

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/leave-balance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grantedDays, carriedOverDays }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: "有休残日数を更新しました" });
                fetchBalance();
                setTimeout(() => setMessage(null), 3000);
            } else {
                setMessage({ type: "error", text: data.error });
            }
        } catch {
            setMessage({ type: "error", text: "更新に失敗しました" });
        }
        setSaving(false);
    }

    if (loading) return null;

    return (
        <div style={{ padding: "var(--space-md)", background: "var(--color-primary-bg)", borderRadius: "var(--radius-lg)", marginTop: "var(--space-lg)", border: "1px dashed var(--color-primary-light)" }}>
            <h4 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-primary-dark)", marginBottom: "var(--space-sm)" }}>🌴 年次有給休暇の管理（{fiscalYear}年度）</h4>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                現在の「有休残日数」を直接編集できます。中途入社時の付与や、年度ごとの調整にご利用ください。
            </p>

            {message && <div style={{ color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontWeight: "bold" }}>{message.text}</div>}

            <div style={{ background: "white", padding: "var(--space-md)", borderRadius: "8px", border: "1px solid #ddd", display: "inline-block", width: "100%", maxWidth: "500px" }}>
                <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
                    <div>
                        <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: "bold", marginBottom: "var(--space-xs)" }}>今年度付与日数</label>
                        <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                            <input className="input" type="number" step="0.5" min="0" value={grantedDays} onChange={(e) => setGrantedDays(e.target.value)} style={{ width: "80px" }} />
                            <span style={{ lineHeight: "40px" }}>日</span>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: "bold", marginBottom: "var(--space-xs)" }}>前年度繰越日数</label>
                        <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                            <input className="input" type="number" step="0.5" min="0" value={carriedOverDays} onChange={(e) => setCarriedOverDays(e.target.value)} style={{ width: "80px" }} />
                            <span style={{ lineHeight: "40px" }}>日</span>
                        </div>
                    </div>
                    <div style={{ marginTop: "auto", marginBottom: "8px" }}>
                        <button className="btn btn-primary" style={{ height: "40px" }} onClick={handleSave} disabled={saving}>保存</button>
                    </div>
                </div>
                {balance ? (
                    <div style={{ marginTop: "12px" }}>
                        <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                            有休残日数: <strong>{balance.remainingDays} 日</strong> (総付与: {balance.totalDays} 日 / 取得済: {balance.usedDays} 日)
                        </p>
                        <div style={{ padding: "8px", background: "#f8f9fa", borderRadius: "4px", fontSize: "11px", color: "#555", border: "1px solid #eee" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>時間有休 1日分相当:</span>
                                <strong>{Math.ceil(balance.staff.standardWorkHours)} 時間</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>時間有休 年間上限:</span>
                                <strong>{Math.ceil(balance.staff.standardWorkHours) * 5} 時間</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>時間有休 取得済み:</span>
                                <span style={{ color: "var(--color-primary-dark)" }}>{balance.timeLeaveUsedHours || 0} 時間</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", borderTop: "1px solid #ddd", paddingTop: "4px", marginTop: "4px" }}>
                                <span>時間有休 残り枠:</span>
                                <span style={{ color: "var(--color-success)" }}>{(Math.ceil(balance.staff.standardWorkHours) * 5) - (balance.timeLeaveUsedHours || 0)} 時間</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                        未設定
                    </p>
                )}
            </div>
        </div>
    );
}
