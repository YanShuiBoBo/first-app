import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "登录 - Immersive English",
  description: "登录您的 Immersive English 账号",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className="antialiased"
        suppressHydrationWarning={true}
      >
        {/* 不显示Header */}
        {children}
      </body>
    </html>
  );
}
