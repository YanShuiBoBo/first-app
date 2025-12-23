import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "注册 - Immersive English",
  description: "注册 Immersive English 账号",
};

export default function RegisterLayout({
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
