"use client";
import { useState, useEffect, useCallback } from "react";

interface Props {
    staffId: string;
}

interface Balance {
    leaveType: string;
    totalDays: number;
    usedDays: number;
}

export default function AdminStaffSpecialBalances({ staffId }: Props) {
    const [balances, setBalances] = useState<Balance[]>([]);
    const [loading, setLoading] = useState(true);
    const [fiscalYear, setFiscalYear] = useState<number>(0);
    const [nursingDays, setNursingDays] = useState("0");
    const [careDays, setCareDays] = useState("0");
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const fetchBalances = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/special-balance`);
            const data = await res.json();
            if (data.specialBalances) {
                setBalances(data.specialBalances);
                setFiscalYear(data.fiscalYear);

                const nb = data.specialBalances.find((b: any) => b.leaveType === "NURSING");
                if (nb) setNursingDays(nb.totalDays.toString());
                else setNursingDays("0");

                const cb = data.specialBalances.find((b: any) => b.leaveType === "CARE");
                if (cb) setCareDays(cb.totalDays.toString());
                else setCareDays("0");
            }
        } catch {
            // Error
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    async function handleSave(leaveType: string, days: string) {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/special-balance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leaveType, totalDays: days }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: `${leaveType === "NURSING" ? "看護" : "介護"}休暇の設定を更新しました` });
                fetchBalances();
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
            <h4 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-primary-dark)", marginBottom: "var(--space-sm)" }}>🏥 特別休暇の個別設定（{fiscalYear}年度）</h4>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                家族構成などにより、職員ごとに看護休暇や介護休暇の付与日数を個別に設定できます。対象外（なし）の場合は <b>0日</b> に設定してください。
            </p>

            {message && <div style={{ color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontWeight: "bold" }}>{message.text}</div>}

            <div style={{ display: "grid", gap: "var(--space-md)", gridTemplateColumns: "1fr 1fr" }}>
                <div style={{ background: "white", padding: "var(--space-md)", borderRadius: "8px", border: "1px solid #ddd" }}>
                    <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: "bold", marginBottom: "var(--space-xs)" }}>👩‍⚕️ 看護休暇（年）</label>
                    <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                        <input className="input" type="number" min="0" value={nursingDays} onChange={(e) => setNursingDays(e.target.value)} style={{ width: "80px" }} />
                        <span style={{ lineHeight: "40px" }}>日</span>
                        <button className="btn btn-primary" style={{ padding: "0 var(--space-md)", height: "40px" }} onClick={() => handleSave("NURSING", nursingDays)} disabled={saving}>保存</button>
                    </div>
                    {balances.find(b => b.leaveType === "NURSING") ? (
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                            (取得済: {balances.find(b => b.leaveType === "NURSING")?.usedDays} 日)
                        </p>
                    ) : (
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                            未設定（対象外）
                        </p>
                    )}
                </div>

                <div style={{ background: "white", padding: "var(--space-md)", borderRadius: "8px", border: "1px solid #ddd" }}>
                    <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: "bold", marginBottom: "var(--space-xs)" }}>👴 介護休暇（年）</label>
                    <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                        <input className="input" type="number" min="0" value={careDays} onChange={(e) => setCareDays(e.target.value)} style={{ width: "80px" }} />
                        <span style={{ lineHeight: "40px" }}>日</span>
                        <button className="btn btn-primary" style={{ padding: "0 var(--space-md)", height: "40px" }} onClick={() => handleSave("CARE", careDays)} disabled={saving}>保存</button>
                    </div>
                    {balances.find(b => b.leaveType === "CARE") ? (
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                            (取得済: {balances.find(b => b.leaveType === "CARE")?.usedDays} 日)
                        </p>
                    ) : (
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                            未設定（対象外）
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
