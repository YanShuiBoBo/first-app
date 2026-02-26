"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';

// 提前安装全局监听，确保在 React 开始 hydrate 之前就能捕获 418 / Hydration 相关异常
if (typeof window !== 'undefined' && !(window as any).__HYDRATION_DEBUG_INSTALLED) {
  (window as any).__HYDRATION_DEBUG_INSTALLED = true;
  const captureHydrationError = (source: string, payload: unknown) => {
    try {
      const htmlSample = document.documentElement.outerHTML.slice(0, 1200);
      // 控制台输出足够信息便于对比 SSR/CSR
      console.error('[HydrationDebug/Global]', {
        source,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        payload,
        htmlSample
      });
    } catch (err) {
      console.error('[HydrationDebug/Global] capture failed', err);
    }
  };

  window.addEventListener('error', event => {
    const msg = event.message || '';
    if (
      typeof msg === 'string' &&
      (msg.includes('Minified React error #418') ||
        msg.includes('Hydration failed'))
    ) {
      captureHydrationError('window.error', { message: msg, error: event.error });
    }
  });

  window.addEventListener('unhandledrejection', event => {
    const msg = String(event.reason || '');
    if (
      msg.includes('Minified React error #418') ||
      msg.includes('Hydration failed')
    ) {
      captureHydrationError('unhandledrejection', { reason: event.reason });
    }
  });

  console.info('[HydrationDebug/Global] installed');
}

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
