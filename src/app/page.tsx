"use client";
import { useEffect, useState } from "react";
import LoginPage from "@/components/LoginPage";
import Dashboard from "@/components/Dashboard";
import AttendanceHistory from "@/components/AttendanceHistory";
import Calendar from "@/components/Calendar";
import LeaveManagement from "@/components/LeaveManagement";
import AdminPanel from "@/components/AdminPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export interface UserSession {
  id: string;
  employeeNo: string;
  name: string;
  email: string;
  employmentType: "REGULAR" | "PART_TIME" | "SHORT_TIME";
  role: "STAFF" | "ADMIN";
  orgId: string;
  orgName: string;
  defaultStart: string;
  defaultEnd: string;
  closingDay: number;
  isKiosk?: boolean;
}

export type PageView = "home" | "history" | "calendar" | "leave" | "admin";

export default function Home() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: string; date: string; message: string } | null>(null);
  const [currentView, setCurrentView] = useState<PageView>("home");
  const [loginView, setLoginView] = useState<"LOGIN_FORM" | "KIOSK_SELECT">("LOGIN_FORM");
  const [highlightDate, setHighlightDate] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        // 管理者なら初期画面を管理パネル、一般ならホーム
        setCurrentView(data.user.role === "ADMIN" ? "admin" : "home");
      }
    } catch {
      // 未ログイン
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(loginId: string, password: string) {
    // 打刻専用ログイン用特別なID/PASSチェック
    if (loginId === "dakoku" && password === "1348") {
      setLoginView("KIOSK_SELECT");
      return { success: true };
    }

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      // ロールに応じて初期画面を切り替え
      setCurrentView(data.user.role === "ADMIN" ? "admin" : "home");
      if (data.alert) setAlert(data.alert);
      return { success: true };
    }
    return { success: false, error: data.error };
  }

  async function handleKioskLogin(staffId: string) {
    const res = await fetch("/api/auth/kiosk-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId }),
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      // 打刻ログイン（Kiosk）時は一律ホーム（打刻画面）へ
      setCurrentView("home");
      setLoginView("KIOSK_SELECT");
      if (data.alert) setAlert(data.alert);
      return { success: true };
    }
    return { success: false, error: data.error };
  }

  async function handleLogout(wasKiosk = false) {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setAlert(null);
    setCurrentView("home");
    if (wasKiosk) {
      setLoginView("KIOSK_SELECT");
    } else {
      setLoginView("LOGIN_FORM");
    }
  }

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🌸</div>
          <p style={{ color: "var(--text-secondary)" }}>読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onKioskLogin={handleKioskLogin}
        initialView={loginView}
        onViewChange={(v) => setLoginView(v)}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", paddingBottom: "80px" }}>
      {/* ヘッダー */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-md) var(--space-lg)",
        background: "var(--bg-card)",
        borderBottom: "var(--border-light)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <img src="/icons/en-kintai2.png" alt="スマート保育DX" style={{ height: "60px", width: "auto" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <div style={{ textAlign: "right" }}>
            <span style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{user.name}</span>
            <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              {user.employmentType === "REGULAR" ? "正規" : user.employmentType === "SHORT_TIME" ? "時短" : "パート"}
              {user.role === "ADMIN" ? " ・管理者" : ""}
            </span>
          </div>
          <button
            onClick={() => handleLogout(false)}
            style={{
              padding: "var(--space-xs) var(--space-md)",
              borderRadius: "var(--radius-full)",
              border: "var(--border-light)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "var(--font-size-xs)",
              cursor: "pointer",
              fontFamily: "var(--font-family)",
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main style={{ padding: "var(--space-md) 0" }}>
        {currentView === "home" && (
          <Dashboard
            user={user}
            alert={alert}
            onDismissAlert={() => setAlert(null)}
            onLogout={handleLogout}
            onNavigateToHistory={(date) => {
              setCurrentView("history");
              if (date) setHighlightDate(date);
            }}
          />
        )}
        {currentView === "history" && (
          <AttendanceHistory user={user} highlightDate={highlightDate} onClearHighlight={() => setHighlightDate(null)} />
        )}
        {currentView === "calendar" && (
          <Calendar user={user} />
        )}
        {currentView === "leave" && (
          <LeaveManagement user={user} />
        )}
        {currentView === "admin" && user.role === "ADMIN" && (
          <ErrorBoundary>
            <AdminPanel user={user} />
          </ErrorBoundary>
        )}
      </main>

      {/* ナビゲーションバー */}
      <nav className="navbar">
        <button
          className={`nav-item ${currentView === "home" ? "active" : ""}`}
          onClick={() => { setCurrentView("home"); setHighlightDate(null); }}
        >
          <img src="/icons/home.png" alt="ホーム" className="nav-icon-img" />
          ホーム
        </button>
        <button
          className={`nav-item ${currentView === "history" ? "active" : ""}`}
          onClick={() => { setCurrentView("history"); setHighlightDate(null); }}
        >
          <img src="/icons/history.png" alt="履歴" className="nav-icon-img" />
          履歴
        </button>
        <button
          className={`nav-item ${currentView === "calendar" ? "active" : ""}`}
          onClick={() => setCurrentView("calendar")}
        >
          <img src="/icons/calendar.png" alt="カレンダー" className="nav-icon-img" />
          カレンダー
        </button>
        <button
          className={`nav-item ${currentView === "leave" ? "active" : ""}`}
          onClick={() => setCurrentView("leave")}
        >
          <img src="/icons/leave.png" alt="休暇" className="nav-icon-img" />
          休暇
        </button>
        {user.role === "ADMIN" && (
          <button
            className={`nav-item ${currentView === "admin" ? "active" : ""}`}
            onClick={() => setCurrentView("admin")}
          >
            <img src="/icons/setting.png" alt="管理" className="nav-icon-img" />
            管理
          </button>
        )}
      </nav>
    </div>
  );
}
