'use client';

import React from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';

interface DisplayUser {
  name?: string;
  email: string;
  full_name?: string;
}

function getDisplayName(user: DisplayUser) {
  // 管理员账号固定显示“管理员”
  if (user.email === '772861967@qq.com') {
    return '管理员';
  }

  // 预留给 Supabase user_metadata.full_name，当前项目只有 name/email
  const rawName = user.full_name || user.name || '';

  // 简单过滤明显异常的乱码（包含 � 或全是空白）
  const isGarbage =
    !rawName ||
    rawName.trim().length === 0 ||
    rawName.includes('�');

  if (!isGarbage) {
    return rawName;
  }

  if (user.email) {
    return user.email.split('@')[0];
  }

  return '用户';
}

export default function Header() {
  const { user, isLoggedIn } = useAuthStore();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-500 to-violet-500 text-sm font-bold text-white shadow-lg shadow-sky-500/30">
            IE
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-zinc-50">
              Immersive English
            </span>
            <span className="text-[11px] text-zinc-400">
              沉浸式英语精读
            </span>
          </div>
        </Link>

        {/* Right Section */}
        <div className="flex items-center gap-3 text-sm">
          {isLoggedIn && user ? (
            <>
              {/* 管理员入口：仅管理员邮箱显示管理链接 */}
              {user.email === '772861967@qq.com' && (
                <>
                  <Link
                    href="/admin/videos"
                    className="hidden rounded-full border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-200 shadow-sm shadow-black/40 transition-colors hover:border-sky-400 hover:text-white sm:inline-flex"
                  >
                    素材管理
                  </Link>
                  <Link
                    href="/admin/access-codes"
                    className="hidden rounded-full border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-200 shadow-sm shadow-black/40 transition-colors hover:border-sky-400 hover:text-white sm:inline-flex"
                  >
                    激活码管理
                  </Link>
                </>
              )}
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/70 px-2.5 py-1.5 text-zinc-100 shadow-sm shadow-black/40 transition-colors hover:border-sky-400 hover:text-white"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-50">
                  {getDisplayName(user).charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="max-w-[140px] truncate">
                  {getDisplayName(user)}
                </span>
                <svg
                  className="h-4 w-4 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-full px-4 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-900/80"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm shadow-sky-500/40 transition-colors hover:bg-sky-500"
              >
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
