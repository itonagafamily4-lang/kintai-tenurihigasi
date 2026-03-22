"use client";
import React, { useState, useEffect } from "react";
import styles from "./AdminPanel.module.css";

interface Props {
  orgId: string;
}

const TARGET_TYPES = [
  { value: "ALL", label: "全職員" },
  { value: "REGULAR", label: "正規職員のみ" },
  { value: "PART_TIME", label: "パートのみ" },
  { value: "SHORT_TIME", label: "時短職員のみ" },
  { value: "CLASS", label: "特定のクラス担任のみ" },
];

export default function AdminScheduleOverride({ orgId }: Props) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("17:30");
  const [targetType, setTargetType] = useState("ALL");
  const [targetValue, setTargetValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchOverrides = async () => {
    try {
      const res = await fetch("/api/schedule");
      const data = await res.json();
      const list = (data.schedules || []).filter((s: any) => s.isWorkOverride);
      setOverrides(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOverrides();
  }, []);

  const handleSave = async () => {
    if (!date || !title || !startTime || !endTime) {
      setMessage({ type: "error", text: "日付、タイトル、時間は必須です" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          title,
          startTime,
          endTime,
          isWorkOverride: true,
          targetType,
          targetValue: targetType === "CLASS" ? targetValue : null,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "特別勤務時間を設定しました" });
        setDate("");
        setTitle("");
        fetchOverrides();
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.error || "保存に失敗しました" });
      }
    } catch (e) {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この設定を削除してもよろしいですか？")) return;
    try {
      await fetch(`/api/schedule?id=${id}`, { method: "DELETE" });
      fetchOverrides();
    } catch (e) {
      alert("削除に失敗しました");
    }
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>📅 行事等に伴う勤務時間の一括設定</h3>
      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
        特定の日付において、全職員または指定グループの基準勤務時間を変更します。
        設定された時間は、遅刻・早退の判定基準として使用されます。
      </p>

      <div style={{ background: "var(--bg-card)", padding: "var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-lg)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
          <div>
            <label className={styles.formLabel}>対象日付</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={styles.formLabel}>行事名 / 理由</label>
            <input type="text" className="input" placeholder="例：運動会、研修" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
          <div>
            <label className={styles.formLabel}>開始時刻 (この時間より後は遅刻)</label>
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className={styles.formLabel}>終了時刻 (この時間より前は早退)</label>
            <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
          <div>
            <label className={styles.formLabel}>対象範囲</label>
            <select className="select" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {targetType === "CLASS" && (
            <div>
              <label className={styles.formLabel}>クラス名</label>
              <input type="text" className="input" placeholder="すいーとぴー組" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            </div>
          )}
        </div>

        {message && (
          <div style={{ color: message.type === "success" ? "var(--color-primary)" : "var(--color-danger)", marginBottom: "var(--space-sm)", fontSize: "0.9rem" }}>
            {message.text}
          </div>
        )}

        <button className="button-primary" onClick={handleSave} disabled={loading} style={{ width: "100%" }}>
          {loading ? "保存中..." : "特別勤務設定を保存する"}
        </button>
      </div>

      <h4 style={{ marginBottom: "var(--space-sm)", fontSize: "1rem" }}>現在の設定一覧</h4>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>日付</th>
              <th>理由</th>
              <th>時間</th>
              <th>対象</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {overrides.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "var(--space-md)" }}>設定はありません</td></tr>
            ) : (
              overrides.map((o) => (
                <tr key={o.id}>
                  <td>{o.date}</td>
                  <td>{o.title}</td>
                  <td>{o.startTime} 〜 {o.endTime}</td>
                  <td>
                    {TARGET_TYPES.find(t => t.value === o.targetType)?.label}
                    {o.targetType === "CLASS" && ` (${o.targetValue})`}
                  </td>
                  <td>
                    <button className="button-danger" style={{ padding: "4px 8px", fontSize: "0.8rem" }} onClick={() => handleDelete(o.id)}>削除</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
