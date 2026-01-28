"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

type JoinStatus = "checking" | "invalid" | "error";

export default function JoinClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<JoinStatus>("checking");
  const [message, setMessage] = useState<string>("");
  const [currentCode, setCurrentCode] = useState<string>("");
  const [extraInfo, setExtraInfo] = useState<string>("");

  useEffect(() => {
    const code = searchParams ? searchParams.get("code") || "" : "";
    const redirect = searchParams ? searchParams.get("redirect") || "/" : "/";

    setCurrentCode(code);

    if (!code) {
      setStatus("invalid");
      setMessage("链接无效：未检测到激活码参数。");
      return;
    }

    const supabase = createBrowserClient();

    const checkCode = async () => {
      try {
        const { data, error } = await supabase
          .from("access_codes")
          .select("code, status, expires_at, kind, valid_days")
          .eq("code", code)
          .maybeSingle();

        if (error) {
          console.error("校验激活码失败:", error);
          setStatus("error");
          setMessage("激活码校验失败，请稍后重试。");
          return;
        }

        if (!data) {
          setStatus("invalid");
          setMessage("激活码不存在或链接已失效。");
          return;
        }

        if (data.status === "expired") {
          setStatus("invalid");
          setMessage("激活码已过期，链接已失效。");
          return;
        }

        if (data.status === "active") {
          setStatus("invalid");
          setMessage("激活码已被使用，无法再次注册。");
          return;
        }

        // 去掉基于 expires_at 的自动过期判断：
        // 仅当 status = 'expired' 时认为链接已失效

        // 体验卡提示：在 join 页面给出轻量说明
        if (data.kind === "trial") {
          const days = data.valid_days || 7;
          setExtraInfo(`检测到这是一个 ${days} 天体验卡，注册成功后账号将在 ${days} 天后自动失效。`);
        } else {
          setExtraInfo("");
        }

        // 校验通过：跳转到注册页，并自动填入邀请码
        const qs = new URLSearchParams();
        qs.set("inviteCode", code);
        if (redirect) {
          qs.set("redirect", redirect);
        }

        router.replace(`/register?${qs.toString()}`);
      } catch (err) {
        console.error("校验激活码过程中出错:", err);
        setStatus("error");
        setMessage("激活码校验失败，请稍后重试。");
      }
    };

    void checkCode();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-sm shadow-xl shadow-black/40">
        <h1 className="mb-3 text-base font-semibold">
          激活链接校验
        </h1>

        {status === "checking" && (
          <div className="space-y-2">
            <p className="text-slate-300">
              正在校验激活链接，请稍候...
            </p>
            {currentCode && (
              <p className="font-mono text-xs text-slate-500">
                code: {currentCode}
              </p>
            )}
          </div>
        )}

        {status !== "checking" && (
          <>
            <p className="mb-3 text-slate-300">
              {message}
            </p>
            {extraInfo && (
              <p className="mb-3 text-xs text-slate-400">
                {extraInfo}
              </p>
            )}
            {currentCode && (
              <p className="mb-4 font-mono text-[11px] text-slate-500">
                code: {currentCode}
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-slate-100 hover:bg-slate-700"
                onClick={() => router.push("/")}
              >
                返回首页
              </button>
              <button
                type="button"
                className="rounded border border-slate-500 bg-sky-600 px-3 py-1 text-slate-50 hover:bg-sky-500"
                onClick={() => {
                  const qs = new URLSearchParams();
                  if (currentCode) {
                    qs.set("inviteCode", currentCode);
                  }
                  router.push(`/register?${qs.toString()}`);
                }}
              >
                前往注册页，手动输入激活码
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
