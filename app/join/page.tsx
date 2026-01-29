import React, { Suspense } from 'react';
import JoinClient from './JoinClient';

// 服务端组件：提供 Suspense 边界，包裹使用 useSearchParams 的客户端组件
export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-body)] px-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-6 text-sm shadow-[0_18px_60px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-44 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.22),transparent_62%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent)]">
                激活链接
              </div>
              <h1 className="mt-2 text-base font-semibold text-neutral-900">
                正在校验…
              </h1>
              <p className="mt-1 text-[12px] text-neutral-600">
                马上就会自动跳转到注册页。
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full border-[3px] border-[var(--accent)]/70 border-t-transparent animate-spin" />
                <span className="text-[12px] text-neutral-500">
                  请稍候
                </span>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <JoinClient />
    </Suspense>
  );
}
