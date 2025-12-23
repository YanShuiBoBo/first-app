import React, { Suspense } from "react";
import JoinClient from "./JoinClient";

// 服务端组件：提供 Suspense 边界，包裹使用 useSearchParams 的客户端组件
export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-sm shadow-xl shadow-black/40">
            <h1 className="mb-3 text-base font-semibold">
              激活链接校验
            </h1>
            <p className="text-slate-300">
              正在准备激活链接，请稍候...
            </p>
          </div>
        </div>
      }
    >
      <JoinClient />
    </Suspense>
  );
}

