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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF2442] text-sm font-bold text-white shadow-sm shadow-rose-200">
            IE
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-gray-900">
              Immersive English
            </span>
            <span className="text-[11px] text-gray-500">
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
                    className="hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm shadow-gray-100 transition-colors hover:border-gray-300 hover:text-gray-900 sm:inline-flex"
                  >
                    素材管理
                  </Link>
                  <Link
                    href="/admin/access-codes"
                    className="hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm shadow-gray-100 transition-colors hover:border-gray-300 hover:text-gray-900 sm:inline-flex"
                  >
                    激活码管理
                  </Link>
                </>
              )}
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-gray-800 shadow-sm shadow-gray-100 transition-colors hover:border-gray-300 hover:text-gray-900"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
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
                className="rounded-full px-4 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-[#FF2442] px-4 py-1.5 text-xs font-medium text-white shadow-sm shadow-rose-300/60 transition-colors hover:bg-[#e9203b]"
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
