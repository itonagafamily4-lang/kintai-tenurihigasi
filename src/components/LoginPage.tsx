"use client";
import { useState, useEffect } from "react";
import styles from "./LoginPage.module.css";

interface Staff {
    id: string;
    name: string;
    employmentType: "REGULAR" | "SHORT_TIME" | "PART_TIME";
}

interface LoginPageProps {
    onLogin: (loginId: string, password: string) => Promise<{ success: boolean; error?: string }>;
    onKioskLogin: (staffId: string) => Promise<{ success: boolean; error?: string }>;
    initialView?: "LOGIN_FORM" | "KIOSK_SELECT";
    onViewChange?: (view: "LOGIN_FORM" | "KIOSK_SELECT") => void;
}

export default function LoginPage({ onLogin, onKioskLogin, initialView = "LOGIN_FORM", onViewChange }: LoginPageProps) {
    const [view, setView] = useState<"LOGIN_FORM" | "KIOSK_SELECT">(initialView);
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Kiosk state
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [empTypeFilter, setEmpTypeFilter] = useState<"REGULAR" | "SHORT_TIME" | "PART_TIME">("REGULAR");

    useEffect(() => {
        if (view === "KIOSK_SELECT" && staffList.length === 0) {
            fetchStaffList();
        }
    }, [view, staffList.length]);

    useEffect(() => {
        setView(initialView);
    }, [initialView]);

    const handleViewChange = (v: "LOGIN_FORM" | "KIOSK_SELECT") => {
        setView(v);
        if (onViewChange) onViewChange(v);
    };

    async function fetchStaffList() {
        try {
            const res = await fetch("/api/staff/list-for-kiosk");
            const data = await res.json();
            if (data.success) {
                setStaffList(data.staff);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function handleLoginSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        const result = await onLogin(loginId, password);
        if (!result.success) {
            setError(result.error || "ログインに失敗しました");
        }
        setIsLoading(false);
    }

    async function handleKioskSelect(staffId: string) {
        setError("");
        setIsLoading(true);
        const result = await onKioskLogin(staffId);
        if (!result.success) {
            setError(result.error || "ログインに失敗しました");
        }
        setIsLoading(false);
    }

    const filteredStaff = staffList.filter(s => s.employmentType === empTypeFilter);

    return (
        <div className={styles.container}>
            <div className={styles.wrapper}>
                <div className={styles.headerDecoration}>
                    <div className={styles.circle1}></div>
                    <div className={styles.circle2}></div>
                    <div className={styles.circle3}></div>
                </div>

                <div className={styles.card}>
                    <div className={styles.logoArea}>
                        <img src="/icons/en-kintai2.png" alt="スマート保育DX" className={styles.logoImage} />
                    </div>

                    {view === "LOGIN_FORM" ? (
                        <div className={styles.formWrapper}>
                            <form onSubmit={handleLoginSubmit} className={styles.form}>
                                {error && (
                                    <div className="alert alert-danger" style={{ marginBottom: "var(--space-md)" }}>
                                        ⚠️ {error}
                                    </div>
                                )}

                                <div className="input-group">
                                    <label htmlFor="loginId">ID（またはメールアドレス）</label>
                                    <input
                                        id="loginId"
                                        type="text"
                                        className="input"
                                        placeholder="IDを入力"
                                        value={loginId}
                                        onChange={(e) => setLoginId(e.target.value)}
                                        required
                                        autoComplete="username"
                                    />
                                </div>

                                <div className="input-group">
                                    <label htmlFor="password">パスワード</label>
                                    <input
                                        id="password"
                                        type="password"
                                        className="input"
                                        placeholder="パスワードを入力"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary w-full"
                                    disabled={isLoading}
                                    style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", fontSize: "1rem" }}
                                >
                                    {isLoading ? "ログイン中..." : "🔑 ログイン"}
                                </button>
                            </form>


                            
                            <div className={styles.demoInfo} style={{ marginTop: '2rem' }}>
                                <p className={styles.demoTitle}>🧪 テスト用アカウント</p>
                                <div className={styles.demoAccounts}>
                                    <button
                                        type="button"
                                        className={styles.demoBtn}
                                        onClick={() => { setLoginId("admin@example.com"); setPassword("password123"); }}
                                    >
                                        👑 管理者
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.demoBtn}
                                        onClick={() => { setLoginId("yamada@example.com"); setPassword("password123"); }}
                                    >
                                        👩 正規職員
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.kioskWrapper}>
                            <div style={{ textAlign: "center", marginBottom: "var(--space-md)", fontWeight: "bold" }}>
                                📱 打刻用ログイン
                            </div>
                            
                            <div style={{ display: "flex", gap: "12px", marginBottom: "var(--space-lg)", justifyContent: "center" }}>
                                {(["REGULAR", "SHORT_TIME", "PART_TIME"] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setEmpTypeFilter(type)}
                                        className={`btn ${empTypeFilter === type ? 'btn-primary' : 'btn-outline'}`}
                                        style={{ fontSize: "1rem", padding: "10px 20px", borderRadius: "100px", minWidth: "90px" }}
                                    >
                                        {type === "REGULAR" ? "正規" : type === "SHORT_TIME" ? "時短" : "パート"}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", maxHeight: "300px", overflowY: "auto", padding: "4px" }}>
                                {filteredStaff.map(s => (
                                    <button
                                        key={s.id}
                                        className="btn btn-outline"
                                        onClick={() => handleKioskSelect(s.id)}
                                        style={{ padding: "12px 8px", fontSize: "0.95rem", fontWeight: 600 }}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>

                            <button
                                className="btn btn-text w-full"
                                onClick={() => handleViewChange("LOGIN_FORM")}
                                style={{ marginTop: "var(--space-lg)" }}
                            >
                                ← パスワード入力に戻る
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
