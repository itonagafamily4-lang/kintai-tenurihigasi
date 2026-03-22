"use client";
import { useState, useEffect, useCallback } from "react";

interface SpecialLeave {
    id: string;
    name: string;
    defaultDays: number | null;
    isPaid: boolean;
}

export default function AdminSpecialLeaveSettings() {
    const [leaves, setLeaves] = useState<SpecialLeave[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [defaultDays, setDefaultDays] = useState("");
    const [isPaid, setIsPaid] = useState(true);
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

    const [carryOverLimit, setCarryOverLimit] = useState("20");
    const [timeLeaveLimitDays, setTimeLeaveLimitDays] = useState("5");
    const [settingMessage, setSettingMessage] = useState<{ type: string; text: string } | null>(null);
    const [settingSaving, setSettingSaving] = useState(false);

    const [rolloverTargetYear, setRolloverTargetYear] = useState<number>(new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear());
    const [rolloverLoading, setRolloverLoading] = useState(false);
    const [rolloverMessage, setRolloverMessage] = useState<{ type: string; text: string } | null>(null);

    const fetchLeaves = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/special-leave");
            const data = await res.json();
            if (data.specialLeaves) setLeaves(data.specialLeaves);
        } catch {
            // Error
        }

        try {
            const res = await fetch("/api/admin/settings");
            const data = await res.json();
            if (data.settings) {
                setCarryOverLimit(data.settings.carryOverLimit || "20");
                setTimeLeaveLimitDays(data.settings.timeLeaveLimitDays || "5");
            }
        } catch {
            // Error
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchLeaves();
    }, [fetchLeaves]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);
        try {
            const res = await fetch("/api/admin/special-leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, defaultDays, isPaid }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: "追加しました" });
                setName("");
                setDefaultDays("");
                setIsPaid(true);
                fetchLeaves();
            } else {
                setMessage({ type: "error", text: data.error });
            }
        } catch {
            setMessage({ type: "error", text: "追加に失敗しました" });
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("削除してもよろしいですか？")) return;
        try {
            const res = await fetch(`/api/admin/special-leave?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                fetchLeaves();
            } else {
                alert(data.error);
            }
        } catch {
            alert("削除に失敗しました");
        }
    }

    async function handleSaveSettings(e: React.FormEvent) {
        e.preventDefault();
        setSettingSaving(true);
        setSettingMessage(null);
        try {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ carryOverLimit, timeLeaveLimitDays }),
            });
            const data = await res.json();
            if (data.success) {
                setSettingMessage({ type: "success", text: "設定を保存しました" });
                setTimeout(() => setSettingMessage(null), 3000);
            } else {
                setSettingMessage({ type: "error", text: data.error });
            }
        } catch {
            setSettingMessage({ type: "error", text: "保存に失敗しました" });
        }
        setSettingSaving(false);
    }

    async function handleRollover() {
        if (!confirm(`${rolloverTargetYear}年度への有給休暇の繰越処理を実行します。よろしいですか？\n一度実行すると戻せません。`)) return;
        setRolloverLoading(true);
        setRolloverMessage(null);
        try {
            const res = await fetch("/api/admin/leave/rollover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetFiscalYear: rolloverTargetYear })
            });
            const data = await res.json();
            if (data.success) {
                setRolloverMessage({ type: "success", text: data.message });
            } else {
                setRolloverMessage({ type: "error", text: data.error });
            }
        } catch {
            setRolloverMessage({ type: "error", text: "繰越処理に失敗しました" });
        }
        setRolloverLoading(false);
    }

    if (loading) return <p>読み込み中...</p>;

    return (
        <div style={{ padding: "var(--space-md)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "var(--border-light)" }}>
            <h3 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-md)" }}>⚙ 休暇ルール設定</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-md)" }}>
                有給休暇の年度繰り越しのルールや、時間単位での有給取得上限を設定します。
            </p>

            {settingMessage && <div style={{ color: settingMessage.type === "success" ? "var(--color-success)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontWeight: "bold" }}>{settingMessage.text}</div>}

            <form onSubmit={handleSaveSettings} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-xl)", background: "white", padding: "var(--space-lg)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
                <div className="input-group">
                    <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>前年度繰越の最大日数</label>
                    <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                        <input className="input" type="number" step="0.5" min="0" value={carryOverLimit} onChange={(e) => setCarryOverLimit(e.target.value)} style={{ width: "100px" }} />
                        <span style={{ fontSize: "var(--font-size-sm)" }}>日</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>※ 年度替わりで自動繰り越せる上限日数</p>
                </div>
                <div className="input-group">
                    <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>時間有休の年間取得上限（日数換算）</label>
                    <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                        <input className="input" type="number" step="0.5" min="0" value={timeLeaveLimitDays} onChange={(e) => setTimeLeaveLimitDays(e.target.value)} style={{ width: "100px" }} />
                        <span style={{ fontSize: "var(--font-size-sm)" }}>日分まで</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>※ 指定した日数分の時間を超えて時間有休を申請できないよう制限します</p>
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "var(--space-sm)" }}>
                    <button type="submit" className="btn btn-primary" disabled={settingSaving}>
                        {settingSaving ? "保存中..." : "💾 ルールを保存"}
                    </button>
                </div>
            </form>

            <h3 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-md)", marginTop: "var(--space-xl)", paddingTop: "var(--space-lg)", borderTop: "1px solid var(--border-light)" }}>🔄 年度更新と繰り越し処理</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-md)" }}>
                全職員の有給休暇の残日数を元に、新しい年度分のデータを作成します。（前年度の残日数を「前年度繰り越し分」として引き継ぎ、前々年度の分は消滅します）
            </p>

            {rolloverMessage && <div style={{ color: rolloverMessage.type === "success" ? "var(--color-success)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontWeight: "bold" }}>{rolloverMessage.text}</div>}

            <div style={{ background: "white", padding: "var(--space-lg)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", display: "flex", gap: "var(--space-md)", alignItems: "flex-end" }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>対象年度</label>
                    <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                        <input className="input" type="number" min="2020" value={rolloverTargetYear} onChange={(e) => setRolloverTargetYear(parseInt(e.target.value))} style={{ width: "120px" }} />
                        <span style={{ fontSize: "var(--font-size-sm)" }}>年度へ繰り越し</span>
                    </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={handleRollover} disabled={rolloverLoading}>
                    {rolloverLoading ? "処理中..." : "🚀 繰り越し処理を実行"}
                </button>
            </div>

            <h3 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-md)", marginTop: "var(--space-xl)", paddingTop: "var(--space-lg)", borderTop: "1px solid var(--border-light)" }}>⛱️ 指定休マスター設定</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-md)" }}>
                慶弔休暇や夏季休暇など、園独自の休暇を追加・管理できます。ここで追加した休暇は全職員の「休暇」画面で「特休」を選択して申請し、理由欄等で名称を運用で記入する形となります。（名称は「指定休」として管理します）
            </p>

            {message && <div style={{ color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontWeight: "bold" }}>{message.text}</div>}

            <form onSubmit={handleAdd} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", alignItems: "flex-end", marginBottom: "var(--space-xl)" }}>
                <div className="input-group">
                    <label>休暇名 <span style={{ color: "var(--color-danger)" }}>*</span></label>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 夏季休暇" required />
                </div>
                <div className="input-group">
                    <label>デフォルト付与日数</label>
                    <input className="input" type="number" min="0" value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} placeholder="例: 3 (空欄可)" />
                </div>
                <div className="input-group" style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-xs)" }}>
                    <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} id="isPaid" />
                    <label htmlFor="isPaid" style={{ margin: 0, cursor: "pointer" }}>有給扱い</label>
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: "10px 20px" }}>➕ 追加</button>
            </form>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                <thead>
                    <tr style={{ background: "var(--color-primary-bg)", borderBottom: "1px solid var(--color-primary-light)" }}>
                        <th style={{ padding: "var(--space-sm)", textAlign: "left" }}>休暇名</th>
                        <th style={{ padding: "var(--space-sm)" }}>デフォルト日数</th>
                        <th style={{ padding: "var(--space-sm)" }}>有休/無給</th>
                        <th style={{ padding: "var(--space-sm)" }}>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {leaves.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: "center", padding: "var(--space-md)" }}>設定されている指定休はありません</td></tr>
                    ) : leaves.map((lv) => (
                        <tr key={lv.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                            <td style={{ padding: "var(--space-sm)" }}>{lv.name}</td>
                            <td style={{ padding: "var(--space-sm)", textAlign: "center" }}>{lv.defaultDays !== null ? `${lv.defaultDays}日` : "指定なし"}</td>
                            <td style={{ padding: "var(--space-sm)", textAlign: "center" }}>
                                {lv.isPaid ? <span style={{ color: "var(--color-primary)", fontWeight: "bold" }}>有給</span> : <span style={{ color: "var(--text-secondary)" }}>無給</span>}
                            </td>
                            <td style={{ padding: "var(--space-sm)", textAlign: "center" }}>
                                <button
                                    onClick={() => handleDelete(lv.id)}
                                    style={{ background: "none", border: "1px solid var(--color-danger)", color: "var(--color-danger)", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}
                                >
                                    削除
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
