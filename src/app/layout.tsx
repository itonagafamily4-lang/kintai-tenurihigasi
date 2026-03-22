import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "en-kintai　勤怠管理システム",
  description: "保育園向け勤怠・有休管理システム",
  icons: {
    icon: "/icons/en-kintai-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
