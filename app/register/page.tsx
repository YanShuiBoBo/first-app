"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { register } from "@/lib/auth";
import { useAuthStore } from "@/lib/store/auth-store";

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

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams ? searchParams.get("redirect") || "/" : "/";
  const initialInviteCode = searchParams
    ? searchParams.get("inviteCode") || ""
    : "";

  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginAction = useAuthStore((state) => state.login);

  useEffect(() => {
    const codeFromUrl = searchParams
      ? searchParams.get("inviteCode") || ""
      : "";
    if (codeFromUrl && !inviteCode) {
      setInviteCode(codeFromUrl);
    }
  }, [searchParams, inviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("两次密码输入不一致");
      setIsLoading(false);
      return;
    }

    if (!inviteCode.trim()) {
      setError("请输入激活码");
      setIsLoading(false);
      return;
    }

    if (!nickname.trim()) {
      setError("请输入昵称");
      setIsLoading(false);
      return;
    }

    if (!phone.trim()) {
      setError("请输入手机号");
      setIsLoading(false);
      return;
    }

    try {
      const result = await register(email, password, inviteCode, {
        nickname,
        phone,
      });

      if (!result.success) {
        setError(result.error || "注册失败");
        setIsLoading(false);
        return;
      }

      if (result.user) {
        loginAction(result.user, result.token);
      }

      router.push(redirect);
    } catch (err) {
      setError("注册失败，请检查信息是否正确");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-body)]">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-3xl border border-white/80 bg-[var(--bg-shell)] shadow-[0_16px_40px_rgba(0,0,0,0.06)] md:grid-cols-[1.05fr_1fr]">
          {/* 左侧：品牌区域 + 注册步骤预览 */}
          <div className="hidden flex-col border-r border-white/70 bg-gradient-to-br from-white via-[var(--bg-shell)] to-[#f9e9ef] px-8 py-8 md:flex">
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
                    油管 Vlog 精读工作台
                  </span>
                </div>
              </div>
              <YoutubeBadge />
            </div>

            {/* 三步注册流程：贴近实际操作，减少冗余介绍 */}
            <div className="mt-8 flex flex-1 items-center">
              <div className="w-full rounded-3xl bg-white/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.08)] ring-1 ring-white/70">
                <div className="mb-3 flex items-center justify-between text-[10px] text-neutral-500">
                  <span className="text-[11px] font-semibold text-neutral-700">
                    用激活码开通精读账号
                  </span>
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[9px] font-medium text-white">
                    预计 30 秒完成
                  </span>
                </div>

                <div className="space-y-3 text-[11px] text-neutral-700">
                  {/* Step 1 */}
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white shadow-sm shadow-neutral-400/40">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-neutral-900">
                        填写邮箱和昵称
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        邮箱用于登录，昵称会显示在首页头像旁。
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FF2442] text-[11px] font-semibold text-white shadow-sm shadow-rose-300/60">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-neutral-900">
                        输入激活码
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        例如：VIP-XHS-001，提交后将占用该激活码。
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-neutral-900">
                        设置密码并提交
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        提交成功后会自动登录，并跳转到首页学习大厅。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-[10px] text-neutral-500">
                  <span>支持手机 / 电脑多设备登录</span>
                  <span>激活码仅在首次注册时使用一次</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：注册表单 */}
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
                使用激活码注册
              </h2>
              <p className="mt-2 text-sm text-neutral-600">
                填写基础信息和激活码，提交后系统会自动为你完成首次登录。
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
                    placeholder="用于登录和接收学习通知"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="nickname"
                      className="mb-1 block text-xs font-medium text-neutral-700"
                    >
                      昵称
                    </label>
                    <input
                      id="nickname"
                      name="nickname"
                      type="text"
                      required
                      className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                      placeholder="展示在首页头像旁"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-1 block text-xs font-medium text-neutral-700"
                    >
                      手机号
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      required
                      className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                      placeholder="用于后续通知（选国内手机号即可）"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="invite-code"
                    className="mb-1 block text-xs font-medium text-neutral-700"
                  >
                    激活码
                  </label>
                  <input
                    id="invite-code"
                    name="inviteCode"
                    type="text"
                    required
                    className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                    placeholder="例如：VIP-XHS-001（从博主私信获取）"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="password"
                      className="mb-1 block text-xs font-medium text-neutral-700"
                    >
                      设置密码
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                      placeholder="至少 6 位，建议英文 + 数字组合"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="mb-1 block text-xs font-medium text-neutral-700"
                    >
                      确认密码
                    </label>
                    <input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-inner shadow-neutral-100 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                      placeholder="再次输入密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-rose-300/60 transition-colors ${
                  isLoading
                    ? "cursor-not-allowed bg-[#FF2442]/80"
                    : "bg-[#FF2442] hover:bg-[#e9203b]"
                }`}
              >
                {isLoading ? "注册中..." : "注册并立即进入学习大厅"}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between text-xs text-neutral-500">
              <span>已经有账号？</span>
              <Link
                href={`/login?redirect=${redirect}`}
                className="text-xs font-medium text-[#FF2442] underline-offset-2 hover:text-[#e9203b] hover:underline"
              >
                直接登录继续刷油管 Vlog →
              </Link>
            </div>

            <div className="mt-6 text-[11px] text-neutral-500">
              <p>提交注册即表示你同意我们正在编写中的服务条款和隐私政策。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
