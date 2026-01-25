import type { Metadata } from "next";
// Using system fonts instead of Google Fonts to avoid network issues
import "./globals.css";
import ClientLayout from "./ClientLayout";

const geistSans = { variable: "" };
const geistMono = { variable: "" };

export const metadata: Metadata = {
  title: "Immersive English",
  description: "打造一款专为小红书用户设计的高颜值、沉浸式英语精读工具",
};

export default function RootLayout({
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
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
