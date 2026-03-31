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
    carriedOverHours: number;
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
    const [carriedOverHours, setCarriedOverHours] = useState("0");
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
                setCarriedOverHours((data.balance.carriedOverHours || 0).toString());
            } else {
                setBalance(null);
                setFiscalYear(data.fiscalYear);
                setGrantedDays("0");
                setCarriedOverDays("0");
                setCarriedOverHours("0");
            }
        } catch {
            // Error
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        fetchBalance();
    }, [fetchBalance]);

    // 時間有休の自動繰り上げ処理
    function handleHoursChange(value: string) {
        const hours = parseInt(value) || 0;
        const stdHours = balance?.staff?.standardWorkHours || 8;
        const hourlyLeaveUnit = Math.ceil(stdHours);

        if (hours >= hourlyLeaveUnit) {
            const extraDays = Math.floor(hours / hourlyLeaveUnit);
            const remainingHours = hours % hourlyLeaveUnit;
            setCarriedOverDays((prev) => (parseFloat(prev) + extraDays).toString());
            setCarriedOverHours(remainingHours.toString());
            setMessage({ type: "success", text: `${hours}時間 → ${extraDays}日 + ${remainingHours}時間に自動変換しました` });
            setTimeout(() => setMessage(null), 3000);
        } else if (hours < 0) {
            setCarriedOverHours("0");
        } else {
            setCarriedOverHours(hours.toString());
        }
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/leave-balance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grantedDays, carriedOverDays, carriedOverHours }),
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

    const stdHours = balance?.staff?.standardWorkHours || 8;
    const hourlyLeaveUnit = Math.ceil(stdHours);
    const hourlyLeaveLimit = hourlyLeaveUnit * 5;
    const hourlyLeaveUsed = balance?.timeLeaveUsedHours || 0;
    const hourlyLeaveRemaining = hourlyLeaveLimit - hourlyLeaveUsed;

    return (
        <div style={{ padding: "var(--space-md)", background: "var(--color-primary-bg)", borderRadius: "var(--radius-lg)", marginTop: "var(--space-lg)", border: "1px dashed var(--color-primary-light)" }}>
            <h4 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-primary-dark)", marginBottom: "var(--space-sm)" }}>🌴 年次有給休暇の管理（{fiscalYear}年度）</h4>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                現在の「有休残日数」を直接編集できます。中途入社時の付与や、年度ごとの調整にご利用ください。
            </p>

            {message && <div style={{ color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontWeight: "bold" }}>{message.text}</div>}

            <div style={{ background: "white", padding: "var(--space-md)", borderRadius: "8px", border: "1px solid #ddd", width: "100%" }}>
                <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-sm)", flexWrap: "wrap" }}>
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
                    <div>
                        <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: "bold", marginBottom: "var(--space-xs)", color: "var(--color-primary-dark)" }}>
                            繰越時間 <span style={{ fontSize: "10px", fontWeight: "normal", color: "var(--text-secondary)" }}>(時間有休の残)</span>
                        </label>
                        <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                            <input
                                className="input"
                                type="number"
                                step="1"
                                min="0"
                                max={hourlyLeaveUnit - 1}
                                value={carriedOverHours}
                                onChange={(e) => handleHoursChange(e.target.value)}
                                style={{ width: "80px", borderColor: "var(--color-primary-light)" }}
                            />
                            <span style={{ lineHeight: "40px" }}>時間</span>
                        </div>
                        <p style={{ fontSize: "10px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                            ※{hourlyLeaveUnit}時間以上は自動で1日に繰り上げ
                        </p>
                    </div>
                    <div style={{ marginTop: "auto", marginBottom: "8px" }}>
                        <button className="btn btn-primary" style={{ height: "40px" }} onClick={handleSave} disabled={saving}>保存</button>
                    </div>
                </div>
                {balance ? (
                    <div style={{ marginTop: "12px" }}>
                        <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                            有休残日数: <strong>{balance.remainingDays} 日 {(balance.carriedOverHours || 0) > 0 ? `+ ${balance.carriedOverHours} 時間` : ""}</strong> (総付与: {balance.totalDays} 日 / 取得済: {balance.usedDays} 日)
                        </p>
                        <div style={{ padding: "8px", background: "#f8f9fa", borderRadius: "4px", fontSize: "11px", color: "#555", border: "1px solid #eee" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>時間有休 1日分相当:</span>
                                <strong>{hourlyLeaveUnit} 時間</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>時間有休 年間上限:</span>
                                <strong>{hourlyLeaveLimit} 時間</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>時間有休 取得済み:</span>
                                <span style={{ color: "var(--color-primary-dark)" }}>{hourlyLeaveUsed} 時間</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", borderTop: "1px solid #ddd", paddingTop: "4px", marginTop: "4px" }}>
                                <span>時間有休 残り枠:</span>
                                <span style={{ color: hourlyLeaveRemaining > 0 ? "var(--color-success)" : "var(--color-danger)" }}>{hourlyLeaveRemaining} 時間</span>
                            </div>
                            {(balance.carriedOverHours || 0) > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #ddd", paddingTop: "4px", marginTop: "4px", color: "var(--color-primary-dark)" }}>
                                    <span>🔄 前年度繰越時間:</span>
                                    <strong>{balance.carriedOverHours} 時間</strong>
                                </div>
                            )}
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
