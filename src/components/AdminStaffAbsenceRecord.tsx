"use client";
import React, { useState, useEffect, useCallback } from "react";

interface Props {
    staffId: string;
}

interface AbsenceRecord {
    id: string;
    maternityLeaveStart: string | null;
    maternityLeaveEnd: string | null;
    childcareLeaveStart: string | null;
    expectedReturnDate: string | null;
    actualReturnDate: string | null;
    memo: string | null;
    createdAt: string;
}

export default function AdminStaffAbsenceRecord({ staffId }: Props) {
    const [records, setRecords] = useState<AbsenceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newRecord, setNewRecord] = useState({
        maternityLeaveStart: "",
        maternityLeaveEnd: "",
        childcareLeaveStart: "",
        expectedReturnDate: "",
        actualReturnDate: "",
        memo: "",
    });
    const [submitLoading, setSubmitLoading] = useState(false);

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/absence-record`);
            const data = await res.json();
            if (data.records) setRecords(data.records);
        } catch {
            // ignore
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setSubmitLoading(true);
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/absence-record`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newRecord),
            });
            const data = await res.json();
            if (data.success) {
                setNewRecord({ maternityLeaveStart: "", maternityLeaveEnd: "", childcareLeaveStart: "", expectedReturnDate: "", actualReturnDate: "", memo: "" });
                setShowForm(false);
                fetchRecords();
            } else {
                alert(data.error || "追加に失敗しました");
            }
        } catch {
            alert("通信エラー");
        }
        setSubmitLoading(false);
    }

    async function handleDelete(id: string) {
        if (!confirm("この履歴を削除してもよろしいですか？")) return;
        try {
            const res = await fetch(`/api/admin/staff/${staffId}/absence-record/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) fetchRecords();
            else alert(data.error || "削除に失敗しました");
        } catch {
            alert("通信エラー");
        }
    }

    if (loading) return null;

    return (
        <div style={{ padding: "var(--space-md)", background: "white", borderRadius: "var(--radius-lg)", marginTop: "var(--space-lg)", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                <h4 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>🍼 産休・育休 取得履歴</h4>
                <button
                    onClick={() => setShowForm(!showForm)}
                    style={{
                        background: showForm ? "var(--color-secondary)" : "var(--color-primary)",
                        color: "white", border: "none", padding: "4px 12px", borderRadius: "4px",
                        fontSize: "var(--font-size-sm)", cursor: "pointer", fontWeight: "bold"
                    }}
                >
                    {showForm ? "✕ 閉じる" : "➕ 追加"}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleAdd} style={{ padding: "var(--space-md)", background: "var(--bg-main)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
                        <div className="input-group">
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>産休開始日</label>
                            <input className="input" type="date" value={newRecord.maternityLeaveStart} onChange={e => setNewRecord({ ...newRecord, maternityLeaveStart: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>産休終了日</label>
                            <input className="input" type="date" value={newRecord.maternityLeaveEnd} onChange={e => setNewRecord({ ...newRecord, maternityLeaveEnd: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>育休開始日</label>
                            <input className="input" type="date" value={newRecord.childcareLeaveStart} onChange={e => setNewRecord({ ...newRecord, childcareLeaveStart: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>復職予定日</label>
                            <input className="input" type="date" value={newRecord.expectedReturnDate} onChange={e => setNewRecord({ ...newRecord, expectedReturnDate: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>実際の復職日 (任意)</label>
                            <input className="input" type="date" value={newRecord.actualReturnDate} onChange={e => setNewRecord({ ...newRecord, actualReturnDate: e.target.value })} />
                        </div>
                        <div className="input-group" style={{ gridColumn: "span 2" }}>
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold" }}>メモ</label>
                            <input className="input" type="text" placeholder="第2子、など" value={newRecord.memo} onChange={e => setNewRecord({ ...newRecord, memo: e.target.value })} />
                        </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <button type="submit" className="btn btn-primary" disabled={submitLoading}>
                            {submitLoading ? "保存中..." : "💾 保存"}
                        </button>
                    </div>
                </form>
            )}

            {records.length === 0 ? (
                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>取得履歴はありません。</p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-main)", color: "var(--text-secondary)", textAlign: "left", borderBottom: "2px solid var(--border-light)" }}>
                                <th style={{ padding: "var(--space-sm)" }}>産休開始</th>
                                <th style={{ padding: "var(--space-sm)" }}>育休開始</th>
                                <th style={{ padding: "var(--space-sm)" }}>復職予定</th>
                                <th style={{ padding: "var(--space-sm)" }}>実復職日</th>
                                <th style={{ padding: "var(--space-sm)" }}>メモ</th>
                                <th style={{ padding: "var(--space-sm)", textAlign: "center" }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map(r => (
                                <tr key={r.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                                    <td style={{ padding: "var(--space-sm)" }}>{r.maternityLeaveStart || "—"}</td>
                                    <td style={{ padding: "var(--space-sm)" }}>{r.childcareLeaveStart || "—"}</td>
                                    <td style={{ padding: "var(--space-sm)", fontWeight: "bold" }}>{r.expectedReturnDate || "—"}</td>
                                    <td style={{ padding: "var(--space-sm)", color: r.actualReturnDate ? "var(--color-primary-dark)" : "" }}>{r.actualReturnDate || "—"}</td>
                                    <td style={{ padding: "var(--space-sm)", color: "var(--text-secondary)" }}>{r.memo || "—"}</td>
                                    <td style={{ padding: "var(--space-sm)", textAlign: "center" }}>
                                        <button onClick={() => handleDelete(r.id)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: "14px" }}>🗑️</button>
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
