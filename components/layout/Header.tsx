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

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4a4 4 0 0 0-4 4v2.8c0 .5-.2 1-.6 1.3L6 14h12l-1.4-1.9a2 2 0 0 1-.6-1.3V8a4 4 0 0 0-4-4Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </svg>
  );
}

function BookOpenIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5V4A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onNotificationClick?: () => void;
}

export default function Header({
  searchQuery,
  onSearchChange,
  onNotificationClick,
}: HeaderProps) {
  const { user, isLoggedIn } = useAuthStore();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
        {/* 左侧 Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF2442] text-sm font-bold text-white shadow-sm shadow-rose-200">
            IE
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-serif text-sm font-semibold text-gray-900">
              Immersive English
            </span>
            <span className="text-[11px] text-gray-500">
              沉浸式英语精读
            </span>
          </div>
        </Link>

        {/* 中间搜索框（桌面端） */}
        {onSearchChange && (
          <div className="hidden flex-1 md:block">
            <div className="relative mx-auto max-w-xl">
              <input
                type="text"
                placeholder="搜索标题、作者、标签..."
                className="w-full rounded-full border border-gray-200 bg-neutral-50 px-4 py-2 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/15"
                value={searchQuery ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                <SearchIcon />
              </div>
            </div>
          </div>
        )}

        {/* 右侧区域：Notebook 入口 + 通知 + 用户 */}
        <div className="flex items-center gap-3 text-sm">
          {isLoggedIn && user ? (
            <>
              {/* 生词本入口：所有登录用户可见 */}
              <Link
                href="/notebook"
                className="hidden items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm shadow-neutral-100 transition-colors hover:border-[#FF2442]/70 hover:text-[#FF2442] md:inline-flex"
              >
                <BookOpenIcon />
                <span>生词本</span>
              </Link>

              {/* 管理员入口：仅管理员邮箱显示管理链接 */}
              {user.email === '772861967@qq.com' && (
                <>
                  <Link
                    href="/admin/videos"
                    className="hidden text-[11px] text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline lg:inline-flex"
                  >
                    素材管理
                  </Link>
                  <Link
                    href="/admin/access-codes"
                    className="hidden text-[11px] text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline lg:inline-flex"
                  >
                    激活码管理
                  </Link>
                </>
              )}

              {/* 通知按钮 */}
              <button
                type="button"
                className="hidden h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-base shadow-sm shadow-gray-100 transition-colors hover:border-gray-300 hover:bg-gray-50 sm:flex"
                onClick={onNotificationClick}
                aria-label="查看通知"
              >
                <BellIcon />
              </button>

              {/* 用户头像 */}
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

      {/* 移动端搜索栏 */}
      {onSearchChange && (
        <div className="block border-t border-gray-100 px-4 pb-2 pt-1 md:hidden">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索标题、作者、标签..."
              className="w-full rounded-full border border-gray-200 bg-neutral-50 px-4 py-2 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/15"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
              <SearchIcon />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
