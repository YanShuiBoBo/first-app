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

  // 临时 hydration 调试：捕获 418 / Hydration failed 并输出上下文
  useEffect(() => {
    const originalError = console.error;
    const debugHydrationError = (...args: unknown[]) => {
      const hasHydrationKeyword = args.some(
        arg =>
          typeof arg === 'string' &&
          (arg.includes('Minified React error #418') ||
            arg.includes('Hydration failed'))
      );

      if (hasHydrationKeyword) {
        try {
          const htmlSample =
            typeof document !== 'undefined'
              ? document.documentElement.outerHTML.slice(0, 1000)
              : '';
          originalError('[HydrationDebug]', {
            url:
              typeof window !== 'undefined' ? window.location.href : 'unknown',
            user: user?.email ?? null,
            timestamp: new Date().toISOString(),
            htmlSample
          });
        } catch (err) {
          originalError('[HydrationDebug] capture failed', err);
        }
      }

      originalError(...args);
    };

    console.error = debugHydrationError;

    const windowErrorHandler = (event: ErrorEvent) => {
      if (
        typeof event.message === 'string' &&
        (event.message.includes('Minified React error #418') ||
          event.message.includes('Hydration failed'))
      ) {
        debugHydrationError(event.message, event.error);
      }
    };

    window.addEventListener('error', windowErrorHandler);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', windowErrorHandler);
    };
  }, [user?.email]);

  return (
    <div>
      {children}
    </div>
  );
}
