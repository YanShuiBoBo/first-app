"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  // 登录状态和登出函数
  const { user, isLoggedIn, logout, initialize } = useAuthStore();

  // 页面加载时初始化登录状态
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div>
      {children}
    </div>
  );
}
