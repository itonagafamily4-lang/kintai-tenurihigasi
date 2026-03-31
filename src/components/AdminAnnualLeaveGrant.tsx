"use client";
import { useState } from "react";

interface GrantPreview {
    staffId: string;
    employeeNo: string;
    name: string;
    employmentType: string;
    joinDate: string | null;
    grantTypeLabel: string;
    grantedDays: number;
    carriedOverDays: number;
    carriedOverHours: number;
    totalDays: number;
    hourlyLimit?: number; // Added from API
}

const EMPLOYMENT_LABELS: Record<string, string> = {
    REGULAR: "正規",
    PART_TIME: "パート",
    SHORT_TIME: "時短",
};

export default function AdminAnnualLeaveGrant() {
    const defaultYear = new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    const [targetYear, setTargetYear] = useState<number>(defaultYear);
    const [previewData, setPreviewData] = useState<GrantPreview[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    async function handlePreview() {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/admin/leave/annual-grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "preview", targetYear })
            });
            const data = await res.json();
            if (data.success) {
                setPreviewData(data.previewData);
            } else {
                setMessage({ type: "error", text: data.error || "プレビューの取得に失敗しました" });
            }
        } catch {
            setMessage({ type: "error", text: "ネットワークエラーが発生しました" });
        }
        setLoading(false);
    }

    async function handleExecute() {
        if (!confirm(`${targetYear}年度の有給休暇一斉付与を実行します。\nこの操作は取り消せません。本当によろしいですか？`)) return;

        setExecuting(true);
        setMessage(null);
        try {
            const res = await fetch("/api/admin/leave/annual-grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "execute", targetYear })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: data.message });
                setPreviewData(null); // クリア
            } else {
                setMessage({ type: "error", text: data.error || "更新処理に失敗しました" });
            }
        } catch {
            setMessage({ type: "error", text: "ネットワークエラーが発生しました" });
        }
        setExecuting(false);
    }

    return (
        <div style={{ padding: "var(--space-md)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)", marginTop: "var(--space-lg)" }}>
            <h3 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-md)" }}>🌸 4月1日 有給休暇の一斉付与・更新処理</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-md)" }}>
                以下のボタンを押して、全職員の有給休暇の4/1付与と繰り越し処理を一括実行します。<br />
                いきなり更新はされず、まずは「プレビュー」で付与予定日数を確認できます。<br />
                ※時間休枠（標準労働時間×5日分）も合わせて更新（リセット）されます。
            </p>

            {message && (
                <div style={{ padding: "var(--space-sm)", background: message.type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)", color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)", borderLeft: `4px solid ${message.type === "success" ? "var(--color-success)" : "var(--color-danger)"}`, marginBottom: "var(--space-md)", fontWeight: "bold" }}>
                    {message.text}
                </div>
            )}

            <div style={{ background: "white", padding: "var(--space-lg)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", display: "flex", gap: "var(--space-md)", alignItems: "flex-end", marginBottom: "var(--space-md)" }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>実行対象年度</label>
                    <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                        <input className="input" type="number" min="2020" value={targetYear} onChange={(e) => setTargetYear(parseInt(e.target.value))} style={{ width: "120px" }} />
                        <span style={{ fontSize: "var(--font-size-sm)" }}>年度</span>
                    </div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={loading || executing}>
                    {loading ? "計算中..." : "📊 まずはプレビューを作成"}
                </button>
            </div>

            {previewData && (
                <div style={{ background: "white", padding: "var(--space-lg)", borderRadius: "var(--radius-md)", border: "1px solid #cce5ff", marginTop: "var(--space-md)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                        <h4 style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-primary)" }}>
                            プレビュー結果 ({previewData.length}名対象)
                        </h4>
                        <button type="button" className="btn btn-primary" onClick={handleExecute} disabled={executing} style={{ background: "var(--color-primary)", padding: "10px 24px", fontSize: "1.1rem" }}>
                            {executing ? "更新処理中..." : "⚠️ この内容で一斉更新を実行する"}
                        </button>
                    </div>
                    
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                            <thead>
                                <tr style={{ background: "var(--bg-main)", color: "var(--text-secondary)", textAlign: "left", borderBottom: "2px solid var(--border-light)" }}>
                                    <th style={{ padding: "var(--space-sm)" }}>職員番号</th>
                                    <th style={{ padding: "var(--space-sm)" }}>氏名</th>
                                    <th style={{ padding: "var(--space-sm)" }}>雇用形態</th>
                                    <th style={{ padding: "var(--space-sm)" }}>入職日</th>
                                    <th style={{ padding: "var(--space-sm)" }}>付与種別 (基準)</th>
                                    <th style={{ padding: "var(--space-sm)", textAlign: "right" }}>新規付与</th>
                                    <th style={{ padding: "var(--space-sm)", textAlign: "right" }}>昨年度繰越</th>
                                    <th style={{ padding: "var(--space-sm)", textAlign: "right", color: "var(--color-primary)" }}><b>更新後残日数</b></th>
                                    <th style={{ padding: "var(--space-sm)", textAlign: "right", color: "var(--color-primary-dark)" }}>更新後 時間有休枠</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.length === 0 && (
                                    <tr>
                                        <td colSpan={8} style={{ padding: "var(--space-md)", textAlign: "center" }}>対象の職員が見つかりません</td>
                                    </tr>
                                )}
                                {previewData.map((d) => (
                                    <tr key={d.staffId} style={{ borderBottom: "1px solid var(--border-light)" }}>
                                        <td style={{ padding: "var(--space-sm)", color: "var(--text-secondary)" }}>{d.employeeNo}</td>
                                        <td style={{ padding: "var(--space-sm)", fontWeight: "600" }}>{d.name}</td>
                                        <td style={{ padding: "var(--space-sm)" }}>{EMPLOYMENT_LABELS[d.employmentType] || d.employmentType}</td>
                                        <td style={{ padding: "var(--space-sm)" }}>{d.joinDate || "未設定"}</td>
                                        <td style={{ padding: "var(--space-sm)" }}>
                                            <span style={{ 
                                                padding: "2px 6px", borderRadius: "4px", fontSize: "11px",
                                                background: d.grantTypeLabel.includes("通常付与") ? "#e3f2fd" : (d.grantTypeLabel.includes("比例付与") ? "#fff3cd" : "#eee"),
                                                color: d.grantTypeLabel.includes("通常付与") ? "#1976d2" : (d.grantTypeLabel.includes("比例付与") ? "#856404" : "#666")
                                            }}>
                                                {d.grantTypeLabel}
                                            </span>
                                        </td>
                                        <td style={{ padding: "var(--space-sm)", textAlign: "right", fontWeight: "bold", color: "#2E7D32" }}>{d.grantedDays > 0 ? `+${d.grantedDays}日` : "0日"}</td>
                                        <td style={{ padding: "var(--space-sm)", textAlign: "right", color: "var(--text-secondary)" }}>
                                            {d.carriedOverDays > 0 ? `${d.carriedOverDays}日` : "0日"}
                                            {d.carriedOverHours > 0 && <span style={{ color: "var(--color-primary)", marginLeft: "4px" }}>+{d.carriedOverHours}h</span>}
                                        </td>
                                        <td style={{ padding: "var(--space-sm)", textAlign: "right", fontWeight: "bold", fontSize: "1.1em", color: "var(--color-primary)" }}>
                                            {d.totalDays}日
                                            {d.carriedOverHours > 0 && <span style={{ fontSize: "0.8em", marginLeft: "4px" }}>+{d.carriedOverHours}h</span>}
                                        </td>
                                        <td style={{ padding: "var(--space-sm)", textAlign: "right", color: "var(--color-primary-dark)", fontSize: "0.9em" }}>
                                            {d.hourlyLimit}時間
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
