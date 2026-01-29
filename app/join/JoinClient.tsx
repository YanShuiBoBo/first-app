'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

type JoinStatus = 'checking' | 'invalid' | 'error';

export default function JoinClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<JoinStatus>('checking');
  const [message, setMessage] = useState<string>('');
  const [extraInfo, setExtraInfo] = useState<string>('');

  const code = useMemo(() => (searchParams ? searchParams.get('code') || '' : ''), [
    searchParams,
  ]);
  const redirect = useMemo(
    () => (searchParams ? searchParams.get('redirect') || '/' : '/'),
    [searchParams]
  );

  useEffect(() => {
    if (!code) return;

    const supabase = createBrowserClient();
    let cancelled = false;

    const checkCode = async () => {
      try {
        const { data, error } = await supabase
          .from('access_codes')
          .select('code, status, expires_at, kind, valid_days')
          .eq('code', code)
          .maybeSingle();

        if (error) {
          console.error('校验激活码失败:', error);
          if (!cancelled) {
            setStatus('error');
            setMessage('激活码校验失败，请稍后重试。');
          }
          return;
        }

        if (!data) {
          if (!cancelled) {
            setStatus('invalid');
            setMessage('激活码不存在或链接已失效。');
          }
          return;
        }

        if (data.status === 'expired') {
          if (!cancelled) {
            setStatus('invalid');
            setMessage('激活码已过期，链接已失效。');
          }
          return;
        }

        if (data.status === 'active') {
          if (!cancelled) {
            setStatus('invalid');
            setMessage('激活码已被使用，无法再次注册。');
          }
          return;
        }

        // 去掉基于 expires_at 的自动过期判断：
        // 仅当 status = 'expired' 时认为链接已失效

        // 体验卡提示：在 join 页面给出轻量说明
        if (data.kind === 'trial') {
          const days = data.valid_days || 7;
          if (!cancelled) {
            setExtraInfo(
              `检测到这是一个 ${days} 天体验卡，注册成功后账号将在 ${days} 天后自动失效。`
            );
          }
        } else {
          if (!cancelled) {
            setExtraInfo('');
          }
        }

        // 校验通过：跳转到注册页，并自动填入邀请码
        const qs = new URLSearchParams();
        qs.set('inviteCode', code);
        if (redirect) {
          qs.set('redirect', redirect);
        }

        router.replace(`/register?${qs.toString()}`);
      } catch (err) {
        console.error('校验激活码过程中出错:', err);
        if (!cancelled) {
          setStatus('error');
          setMessage('激活码校验失败，请稍后重试。');
        }
      }
    };

    void checkCode();
    return () => {
      cancelled = true;
    };
  }, [code, redirect, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-body)] px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-6 text-sm shadow-[0_18px_60px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-44 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.22),transparent_62%)]" />
        <div className="relative">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF2442] text-[15px] font-bold text-white shadow-sm shadow-rose-300/60">
                IE
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500">
                  IMMERSIVE ENGLISH
                </span>
                <span className="text-sm font-semibold text-neutral-900">
                  激活链接校验
                </span>
              </div>
            </div>
            <span className="rounded-full border border-rose-100 bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
              Magic Link
            </span>
          </div>

          {status === 'checking' && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                <div className="h-9 w-9 rounded-full border-[3px] border-[var(--accent)]/70 border-t-transparent animate-spin" />
                <div>
                  <div className="text-[12px] font-semibold text-neutral-900">
                    正在校验激活码
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    校验通过会自动跳转到注册页
                  </div>
                </div>
              </div>
              {code && (
                <p className="rounded-2xl border border-neutral-100 bg-white px-3 py-2 font-mono text-[11px] text-neutral-500">
                  code: {code}
                </p>
              )}
            </div>
          )}

          {status !== 'checking' && (
            <>
              <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
                <div className="text-[12px] font-semibold text-neutral-900">
                  {status === 'invalid' ? '链接不可用' : '校验失败'}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                  {message}
                </p>
                {extraInfo && (
                  <p className="mt-2 rounded-2xl border border-rose-100 bg-[var(--accent-soft)] px-3 py-2 text-[11px] leading-relaxed text-neutral-700">
                    {extraInfo}
                  </p>
                )}
                {code && (
                  <p className="mt-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 font-mono text-[11px] text-neutral-500">
                    code: {code}
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-full bg-neutral-900 px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_14px_34px_-18px_rgba(15,23,42,0.6)] active:scale-95"
                  onClick={() => {
                    const qs = new URLSearchParams();
                    if (code) {
                      qs.set('inviteCode', code);
                    }
                    router.push(`/register?${qs.toString()}`);
                  }}
                >
                  前往注册页
                </button>
                <button
                  type="button"
                  className="rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-neutral-800 hover:bg-neutral-50 active:scale-95"
                  onClick={() => router.push('/')}
                >
                  返回首页
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
