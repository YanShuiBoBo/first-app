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
  // 仅返回子树，避免在路由段内重复声明 <html>/<body> 导致 hydration mismatch
  return children;
}
