"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import styles from "./AdminPanel.module.css";

interface StaffSummary {
    staffId: string;
    name: string;
    employeeNo: string;
    employmentType: string;
    workDays: number;
    totalWorkHours: number;
    totalOvertime: number;
    totalShortTime: number;
    paidLeave: number;
    halfDayLeave: number;
    hourlyLeave: number;
    publicHolidays: number;
    sickLeave: number;
    nursingLeave: number;
    careLeave: number;
    totalMeals: number;
    lateCount: number;
    earlyLeaveCount: number;
}

interface SummaryData {
    period: {
        year: number;
        month: number;
        closingDay: number;
        startDate: string;
        endDate: string;
        label: string;
    };
    summaries: StaffSummary[];
}

const EMPLOYMENT_LABELS: Record<string, string> = {
    REGULAR: "正規",
    PART_TIME: "パート",
    SHORT_TIME: "時短",
};

type SortKey = keyof StaffSummary;

interface Props {
    year: number;
    month: number;
    onSelectStaff: (staffId: string) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
}

export default function AdminAttendanceSummary({ year, month, onSelectStaff, onPrevMonth, onNextMonth }: Props) {
    const [data, setData] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>("ALL");
    const [sortKey, setSortKey] = useState<SortKey>("employeeNo");
    const [sortAsc, setSortAsc] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/attendance/summary?year=${year}&month=${month}`);
            const d = await res.json();
            if (!d.error) setData(d);
        } catch {
            // error
        }
        setLoading(false);
    }, [year, month]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(key === "name" || key === "employeeNo");
        }
    };

    const filtered = useMemo(() => {
        if (!data) return [];
        let list = data.summaries;
        if (filterType !== "ALL") {
            list = list.filter(s => s.employmentType === filterType);
        }
        return [...list].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (typeof aVal === "string" && typeof bVal === "string") {
                return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [data, filterType, sortKey, sortAsc]);

    // グループ別の合計行
    const totals = useMemo(() => {
        return {
            workDays: filtered.reduce((s, r) => s + (r.workDays || 0), 0),
            totalWorkHours: filtered.reduce((s, r) => s + (r.totalWorkHours || 0), 0),
            totalOvertime: filtered.reduce((s, r) => s + (r.totalOvertime || 0), 0),
            paidLeave: filtered.reduce((s, r) => s + (r.paidLeave || 0), 0),
            hourlyLeave: filtered.reduce((s, r) => s + (r.hourlyLeave || 0), 0),
            publicHolidays: filtered.reduce((s, r) => s + (r.publicHolidays || 0), 0),
            sickLeave: filtered.reduce((s, r) => s + (r.sickLeave || 0), 0),
            totalMeals: filtered.reduce((s, r) => s + (r.totalMeals || 0), 0),
            lateCount: filtered.reduce((s, r) => s + (r.lateCount || 0), 0),
            earlyLeaveCount: filtered.reduce((s, r) => s + (r.earlyLeaveCount || 0), 0),
        };
    }, [filtered]);

    const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
        <th
            onClick={() => handleSort(field)}
            style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
            title={`「${label}」で並び替え`}
        >
            {label}
            {sortKey === field && (
                <span style={{ marginLeft: "2px", fontSize: "0.7em" }}>
                    {sortAsc ? "▲" : "▼"}
                </span>
            )}
        </th>
    );

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>全職員の集計データを取得中...</p>
            </div>
        );
    }

    if (!data) return <div className={styles.infoBox}>データの取得に失敗しました</div>;

    return (
        <div>
            {/* 月ナビゲーション */}
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: "var(--space-md)", flexWrap: "wrap", gap: "var(--space-sm)"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                    <button className={styles.navBtn} onClick={onPrevMonth}>◀</button>
                    <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                        {year}年{month}月
                        <span style={{ fontSize: "0.75em", color: "var(--text-secondary)", marginLeft: "8px", fontWeight: 400 }}>
                            ({data.period.label})
                        </span>
                    </span>
                    <button className={styles.navBtn} onClick={onNextMonth}>▶</button>
                </div>

                <div style={{ display: "flex", gap: "4px", fontSize: "0.85rem" }}>
                    {["ALL", "REGULAR", "SHORT_TIME", "PART_TIME"].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            style={{
                                padding: "4px 12px", borderRadius: "var(--radius-md)", border: "none",
                                cursor: "pointer", fontWeight: 600,
                                background: filterType === type ? "var(--color-primary)" : "var(--bg-card)",
                                color: filterType === type ? "white" : "var(--text-secondary)",
                                transition: "all 0.15s ease",
                            }}
                        >
                            {type === "ALL" ? "全員" : EMPLOYMENT_LABELS[type]}
                        </button>
                    ))}
                </div>
            </div>

            {/* 人数サマリー */}
            <div style={{
                display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)", flexWrap: "wrap"
            }}>
                <div style={{
                    background: "var(--bg-card)", padding: "var(--space-sm) var(--space-md)",
                    borderRadius: "var(--radius-md)", border: "var(--border-light)",
                    fontSize: "0.85rem"
                }}>
                    対象: <strong>{filtered.length}名</strong>
                </div>
                <div style={{
                    background: "var(--bg-card)", padding: "var(--space-sm) var(--space-md)",
                    borderRadius: "var(--radius-md)", border: "var(--border-light)",
                    fontSize: "0.85rem"
                }}>
                    総出勤: <strong>{totals.workDays}日</strong>
                </div>
                <div style={{
                    background: "var(--bg-card)", padding: "var(--space-sm) var(--space-md)",
                    borderRadius: "var(--radius-md)", border: "var(--border-light)",
                    fontSize: "0.85rem"
                }}>
                    総残業: <strong style={totals.totalOvertime > 0 ? { color: "var(--color-danger)" } : {}}>{totals.totalOvertime.toFixed(2)}h</strong>
                </div>
                <div style={{
                    background: "var(--bg-card)", padding: "var(--space-sm) var(--space-md)",
                    borderRadius: "var(--radius-md)", border: "var(--border-light)",
                    fontSize: "0.85rem"
                }}>
                    総食事: <strong>{totals.totalMeals}回</strong>
                </div>
            </div>

            {/* テーブル */}
            <div className={styles.tableWrapper}>
                <table className={styles.table} style={{ fontSize: "0.8rem" }}>
                    <thead>
                        <tr>
                            <SortHeader label="No." field="employeeNo" />
                            <SortHeader label="氏名" field="name" />
                            <th style={{ whiteSpace: "nowrap" }}>区分</th>
                            <SortHeader label="出勤" field="workDays" />
                            <SortHeader label="実労働" field="totalWorkHours" />
                            <SortHeader label="残業" field="totalOvertime" />
                            <SortHeader label="有休" field="paidLeave" />
                            <SortHeader label="時間休" field="hourlyLeave" />
                            <SortHeader label="特休" field="publicHolidays" />
                            <SortHeader label="食事" field="totalMeals" />
                            <SortHeader label="遅刻" field="lateCount" />
                            <SortHeader label="早退" field="earlyLeaveCount" />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={12} style={{ textAlign: "center", padding: "var(--space-lg)", color: "var(--text-secondary)" }}>対象のデータがありません</td></tr>
                        ) : (
                            filtered.map(row => (
                                <tr
                                    key={row.staffId}
                                    onClick={() => onSelectStaff(row.staffId)}
                                    style={{ cursor: "pointer" }}
                                    title={`${row.name}の詳細履歴を表示`}
                                >
                                    <td style={{ whiteSpace: "nowrap" }}>{row.employeeNo}</td>
                                    <td style={{
                                        whiteSpace: "nowrap", fontWeight: 600,
                                        color: "var(--color-primary)"
                                    }}>
                                        {row.name}
                                    </td>
                                    <td>
                                        <span style={{
                                            fontSize: "0.75rem", padding: "1px 6px", borderRadius: "var(--radius-sm)",
                                            background: row.employmentType === "REGULAR" ? "rgba(52,152,219,0.1)" :
                                                row.employmentType === "SHORT_TIME" ? "rgba(155,89,182,0.1)" :
                                                    "rgba(46,204,113,0.1)",
                                            color: row.employmentType === "REGULAR" ? "#2980b9" :
                                                row.employmentType === "SHORT_TIME" ? "#8e44ad" :
                                                    "#27ae60",
                                        }}>
                                            {EMPLOYMENT_LABELS[row.employmentType] || row.employmentType}
                                        </span>
                                    </td>
                                    <td>{(row.workDays || 0)}日</td>
                                    <td>{(row.totalWorkHours || 0).toFixed(1)}h</td>
                                    <td style={(row.totalOvertime || 0) > 0 ? {
                                        color: "var(--color-danger)", fontWeight: 700
                                    } : {}}>
                                        {(row.totalOvertime || 0) > 0 ? (row.totalOvertime || 0).toFixed(2) + "h" : "—"}
                                    </td>
                                    <td>{(row.paidLeave || 0) > 0 ? (row.paidLeave || 0) + "日" : "—"}</td>
                                    <td>{(row.hourlyLeave || 0) > 0 ? (row.hourlyLeave || 0) + "h" : "—"}</td>
                                    <td>{(row.publicHolidays || 0) > 0 ? (row.publicHolidays || 0) + "日" : "—"}</td>
                                    <td>{(row.totalMeals || 0) > 0 ? (row.totalMeals || 0) + "回" : "—"}</td>
                                    <td style={(row.lateCount || 0) > 0 ? {
                                        color: "var(--color-danger)", fontWeight: 700
                                    } : {}}>
                                        {(row.lateCount || 0) > 0 ? (row.lateCount || 0) + "回" : "—"}
                                    </td>
                                    <td style={(row.earlyLeaveCount || 0) > 0 ? {
                                        color: "var(--color-danger)", fontWeight: 700
                                    } : {}}>
                                        {(row.earlyLeaveCount || 0) > 0 ? (row.earlyLeaveCount || 0) + "回" : "—"}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {/* 合計行 */}
                    {filtered.length > 0 && (
                        <tfoot>
                            <tr style={{ fontWeight: 700, background: "var(--bg-card-hover)", borderTop: "2px solid var(--border-light)" }}>
                                <td colSpan={3} style={{ textAlign: "right" }}>合計 ({filtered.length}名)</td>
                                <td>{totals.workDays}日</td>
                                <td>{(totals.totalWorkHours || 0).toFixed(1)}h</td>
                                <td style={(totals.totalOvertime || 0) > 0 ? { color: "var(--color-danger)" } : {}}>
                                    {(totals.totalOvertime || 0).toFixed(2)}h
                                </td>
                                <td>{(totals.paidLeave || 0) > 0 ? totals.paidLeave + "日" : "—"}</td>
                                <td>{(totals.hourlyLeave || 0) > 0 ? totals.hourlyLeave + "h" : "—"}</td>
                                <td>{(totals.publicHolidays || 0) > 0 ? totals.publicHolidays + "日" : "—"}</td>
                                <td>{totals.totalMeals}回</td>
                                <td>{(totals.lateCount || 0) > 0 ? totals.lateCount + "回" : "—"}</td>
                                <td>{(totals.earlyLeaveCount || 0) > 0 ? totals.earlyLeaveCount + "回" : "—"}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}
