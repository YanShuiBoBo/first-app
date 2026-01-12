"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { login } from '@/lib/auth';
import { useAuthStore } from '@/lib/store/auth-store';

function YoutubeBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-white/90 px-3 py-1 text-[11px] font-medium text-rose-600 shadow-sm shadow-rose-100">
      <span className="flex h-4 w-6 items-center justify-center rounded-[6px] bg-[#FF0000]">
        <span className="ml-[1px] inline-block h-0 w-0 border-y-[4px] border-y-transparent border-l-[7px] border-l-white" />
      </span>
      <span>YouTube Vlog 精读站</span>
    </div>
  );
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams ? searchParams.get('redirect') || '/' : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loginAction = useAuthStore(state => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await login(email, password);

      if (!result.success) {
        setError(result.error || '登录失败');
        setIsLoading(false);
        return;
      }

      if (result.user) {
        loginAction(result.user, result.token);
      }

      if (result.user?.role === 'admin' && redirect === '/') {
        router.push('/');
      } else {
        router.push(redirect);
      }
    } catch (err) {
      setError('登录失败，请检查邮箱和密码');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-body)]">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-3xl border border-white/80 bg-[var(--bg-shell)] shadow-[0_16px_40px_rgba(0,0,0,0.06)] md:grid-cols-[1.05fr_1fr]">
          {/* 左侧：品牌 + 精读工作台预览 */}
          <div className="hidden flex-col border-r border-white/70 bg-gradient-to-br from-white via-[var(--bg-shell)] to-[#f9e9ef] px-8 py-8 md:flex">
            {/* 品牌行 */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FF2442] text-[16px] font-bold text-white shadow-sm shadow-rose-300/70">
                  IE
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500">
                    IMMERSIVE ENGLISH
                  </span>
                  <span className="text-sm font-medium text-neutral-900">
                    油管 Vlog 精读
                  </span>
                </div>
              </div>
              <YoutubeBadge />
            </div>

            {/* 精读工作台 Mock：视频 + 字幕 + 卡片的抽象预览 */}
            <div className="mt-8 flex flex-1 items-center">
              <div className="w-full rounded-3xl bg-white/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] ring-1 ring-white/70">
                {/* 顶部标签行 */}
                <div className="flex items-center justify-between text-[10px] text-neutral-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      <span className="inline-block h-[6px] w-[6px] rounded-full bg-emerald-400" />
                      正在精读
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                      今日 · 12 分钟
                    </span>
                  </div>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                    连续 · 3 天
                  </span>
                </div>

                {/* 主体区域：左视频 / 右字幕+卡片 */}
                <div className="mt-4 grid grid-cols-[1.2fr_1fr] gap-3">
                  {/* 视频占位 */}
                  <div className="relative h-28 rounded-2xl bg-neutral-900/95">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent rounded-2xl" />
                    <div className="absolute left-3 top-3 flex items-center gap-1.5 text-[9px] font-medium text-white/80">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10">
                        ▶
                      </span>
                      <span>Vlog 精读片段</span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-2/3 rounded-full bg-[#FF2442]" />
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-white/70">
                        <span>00:42</span>
                        <span>02:15</span>
                      </div>
                    </div>
                  </div>

                  {/* 字幕 + 卡片占位 */}
                  <div className="flex flex-col gap-2">
                    <div className="space-y-1 rounded-2xl bg-neutral-50 p-2.5">
                      <div className="h-2 w-5/6 rounded-full bg-neutral-200" />
                      <div className="h-2 w-3/5 rounded-full bg-neutral-200/80" />
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="h-4 rounded-full bg-[var(--hl-purple-bg)] px-2 text-[9px] font-medium text-[var(--hl-purple-text)]">
                          highlight
                        </span>
                        <span className="h-4 rounded-full bg-[var(--hl-pink-bg)] px-2 text-[9px] font-medium text-[var(--hl-pink-text)]">
                          phrase
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1 rounded-2xl bg-neutral-900 px-3 py-2 text-[10px] text-neutral-100 shadow-sm shadow-neutral-900/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-white">
                          精读卡片
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]">
                          word · phrase
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-4/5 rounded-full bg-white/12" />
                      <div className="h-1.5 w-3/5 rounded-full bg-white/10" />
                    </div>
                  </div>
                </div>

                {/* 底部标签 */}
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-neutral-600">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1">
                    双语字幕 · 自动对齐
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1">
                    点击单词 · 弹出卡片
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1">
                    进度自动保存
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：登录表单 */}
          <div className="flex flex-col justify-center bg-[var(--bg-card)] px-6 py-8 sm:px-8 md:px-9">
            <div className="mb-6 flex items-center justify-between md:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FF2442] text-[16px] font-bold text-white shadow-sm shadow-rose-300/70">
                  IE
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500">
                    IMMERSIVE ENGLISH
                  </span>
                  <span className="text-[11px] text-neutral-600">
                    油管 Vlog 精读工作台
                  </span>
                </div>
              </div>
              <YoutubeBadge />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-neutral-900 sm:text-[22px]">
                登录 Immersive English
              </h2>
              <p className="mt-2 text-sm text-neutral-600">
                使用注册邮箱登录，系统会自动续上你上次关闭时的精读进度。
              </p>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="email-address"
                    className="mb-1 block text-xs font-medium text-neutral-700"
                  >
                    邮箱
                  </label>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-xs font-medium text-neutral-700"
                  >
                    密码
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                    placeholder="请输入登录密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-500">
                <div className="flex items-center gap-2">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-[#FF2442] focus:ring-[#FF2442]/20"
                  />
                  <label htmlFor="remember-me" className="select-none">
                    在这台设备上保持登录
                  </label>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
                >
                  忘记密码
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-rose-300/60 transition-colors ${
                  isLoading
                    ? 'cursor-not-allowed bg-[#FF2442]/80'
                    : 'bg-[#FF2442] hover:bg-[#e9203b]'
                }`}
              >
                {isLoading ? '登录中...' : '进入学习大厅'}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between text-xs text-neutral-500">
              <span>还没有账号？</span>
              <Link
                href={`/register?redirect=${redirect}`}
                className="text-xs font-medium text-[#FF2442] underline-offset-2 hover:text-[#e9203b] hover:underline"
              >
                使用邀请码注册一个精读席位 →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
