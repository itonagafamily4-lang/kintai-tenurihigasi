"use client";
import { useState, useEffect, useCallback } from "react";

interface Duty {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

export default function AdminDutySettings() {
    const [duties, setDuties] = useState<Duty[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

    // 新規追加用のフォーム状態
    const [newName, setNewName] = useState("");
    const [newStart, setNewStart] = useState("08:30");
    const [newEnd, setNewEnd] = useState("17:30");

    // 編集用の状態
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editStart, setEditStart] = useState("");
    const [editEnd, setEditEnd] = useState("");

    const fetchDuties = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/duty");
            const data = await res.json();
            if (data.duties) {
                setDuties(data.duties);
            } else if (data.error) {
                setMessage({ type: "error", text: `${data.error}${data.detail ? ` (${data.detail})` : ""}` });
            }
        } catch (err: any) {
            console.error(err);
            setMessage({ type: "error", text: "当番情報の取得に失敗しました" });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchDuties();
    }, [fetchDuties]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/admin/duty", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName, startTime: newStart, endTime: newEnd }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: "当番を追加しました" });
                setNewName("");
                fetchDuties();
            } else {
                setMessage({ type: "error", text: `${data.error}${data.detail ? ` (${data.detail})` : ""}` });
            }
        } catch (err: any) {
            setMessage({ type: "error", text: "保存に失敗しました" });
        }
        setSaving(false);
    }

    async function handleUpdate(id: string) {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/duty", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name: editName, startTime: editStart, endTime: editEnd }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: "success", text: "当番を更新しました" });
                setEditingId(null);
                fetchDuties();
            } else {
                setMessage({ type: "error", text: `${data.error}${data.detail ? ` (${data.detail})` : ""}` });
            }
        } catch (err: any) {
            setMessage({ type: "error", text: "更新に失敗しました" });
        }
        setSaving(false);
    }

    async function handleDelete(id: string) {
        if (!confirm("この当番を削除してもよろしいですか？")) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/duty", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, action: "DELETE" }),
            });
            const data = await res.json();
            if (data.success) {
                fetchDuties();
            } else {
                setMessage({ type: "error", text: `${data.error}${data.detail ? ` (${data.detail})` : ""}` });
            }
        } catch (err: any) {
            setMessage({ type: "error", text: "削除に失敗しました" });
        }
        setSaving(false);
    }

    const startEdit = (duty: Duty) => {
        setEditingId(duty.id);
        setEditName(duty.name);
        setEditStart(duty.startTime);
        setEditEnd(duty.endTime);
    };

    if (loading) return <p>読み込み中...</p>;

    return (
        <div style={{ padding: "var(--space-md)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "var(--border-light)" }}>
            <h3 style={{ fontSize: "var(--font-size-lg)", marginBottom: "var(--space-md)" }}>⏰ 当番種別管理</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-md)" }}>
                早出・遅出を含む当番の設定や、新しい当番の追加が行えます。
            </p>

            {message && (
                <div style={{ 
                    color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)", 
                    background: message.type === "success" ? "rgba(46, 204, 113, 0.1)" : "rgba(231, 76, 60, 0.1)",
                    padding: "var(--space-sm)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: "var(--space-md)",
                    fontWeight: "bold" 
                }}>
                    {message.text}
                </div>
            )}

            {/* 一覧表示 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-md)", marginBottom: "var(--space-xl)" }}>
                {duties.map((d) => (
                    <div key={d.id} style={{ padding: "var(--space-md)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", background: "white", boxShadow: "var(--shadow-sm)" }}>
                        {editingId === d.id ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", alignItems: "flex-end" }}>
                                <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: "150px" }}>
                                    <label style={{ fontSize: "12px" }}>当番名</label>
                                    <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0, width: "150px" }}>
                                    <label style={{ fontSize: "12px" }}>開始時刻</label>
                                    <input className="input" type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0, width: "150px" }}>
                                    <label style={{ fontSize: "12px" }}>終了時刻</label>
                                    <input className="input" type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                                </div>
                                <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                                    <button onClick={() => handleUpdate(d.id)} className="btn btn-primary" disabled={saving} style={{ height: "42px" }}>保存</button>
                                    <button onClick={() => setEditingId(null)} className="btn" style={{ height: "42px", background: "var(--bg-main)" }}>キャンセル</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{d.name}</div>
                                    <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                        基準時間: <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>{d.startTime} 〜 {d.endTime}</span>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                                    <button 
                                        onClick={() => startEdit(d)} 
                                        style={{ background: "none", border: "1px solid var(--color-accent)", color: "var(--color-accent)", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                                    >
                                        編集
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(d.id)} 
                                        style={{ background: "none", border: "1px solid var(--color-danger)", color: "var(--color-danger)", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                                    >
                                        削除
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {duties.length === 0 && !loading && (
                <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "var(--space-lg)" }}>当番が設定されていません。</p>
            )}

            {/* 新規追加フォーム */}
            <form onSubmit={handleAdd} style={{ padding: "var(--space-md)", background: "var(--bg-app)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-light)" }}>
                <h4 style={{ margin: "0 0 var(--space-md) 0", fontSize: "1rem", color: "var(--text-secondary)" }}>✨ 新しい当番を追加</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", alignItems: "flex-end" }}>
                    <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: "150px" }}>
                        <label style={{ fontSize: "12px" }}>当番名</label>
                        <input className="input" placeholder="例: 延長当番" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0, width: "150px" }}>
                        <label style={{ fontSize: "12px" }}>開始時刻</label>
                        <input className="input" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} required />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0, width: "150px" }}>
                        <label style={{ fontSize: "12px" }}>終了時刻</label>
                        <input className="input" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} required />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving} style={{ height: "42px" }}>
                        ➕ 追加
                    </button>
                </div>
            </form>
        </div>
    );
}
