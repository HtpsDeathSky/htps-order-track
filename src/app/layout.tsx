import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTPS Order Track",
  description: "Telegram-inspired order tracker powered by Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
