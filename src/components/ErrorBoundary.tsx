"use client";
import React from "react";

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                    padding: "2rem",
                    background: "var(--bg-primary, #f8f9fa)",
                    gap: "1rem",
                }}>
                    <div style={{ fontSize: "3rem" }}>⚠️</div>
                    <h2 style={{ fontWeight: 700, color: "#e74c3c" }}>
                        画面の表示中にエラーが発生しました
                    </h2>
                    <p style={{ color: "#666", textAlign: "center", maxWidth: "480px" }}>
                        お手数ですが、ページを再読み込みしてください。
                        解決しない場合は管理者にお問い合わせください。
                    </p>
                    {this.state.error && (
                        <details style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#999", maxWidth: "600px" }}>
                            <summary style={{ cursor: "pointer" }}>エラー詳細</summary>
                            <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                                {this.state.error.message}
                            </pre>
                        </details>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: "1rem",
                            padding: "0.75rem 2rem",
                            background: "#3498db",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: "1rem",
                        }}
                    >
                        🔄 再読み込み
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
