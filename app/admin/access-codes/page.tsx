"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/store/auth-store";

interface AccessCodeRow {
  code: string;
  user_id: string | null;
  valid_days: number;
  status: "unused" | "reserved" | "active" | "expired" | string;
  activated_at: string | null;
  expires_at: string | null;
  created_at: string;
}

type FilterType = "all" | "valid" | "unused";

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const h = `${d.getHours()}`.padStart(2, "0");
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

function formatStatus(status: string): string {
  if (status === "unused") return "未使用";
  if (status === "reserved") return "已发放（待使用）";
  if (status === "active") return "已激活";
  if (status === "expired") return "已过期";
  return status;
}

function generateRandomCode(): string {
  // 简单的激活码格式：XXXX-XXXX-XXXX（只包含大写字母和数字）
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () =>
    Array.from({ length: 4 })
      .map(
        () => chars[Math.floor(Math.random() * chars.length)]
      )
      .join("");
  return `${segment()}-${segment()}-${segment()}`;
}

function AccessCodesContent() {
  // Supabase 客户端只在浏览器端初始化，避免在构建 / 预渲染阶段触发环境变量错误
  const [supabase, setSupabase] = useState<ReturnType<typeof createBrowserClient> | null>(null);

  const [codes, setCodes] = useState<AccessCodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterType>("valid");
  const [searchKeyword, setSearchKeyword] = useState("");

  const [generateCount, setGenerateCount] = useState("10");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [lastAssignedCode, setLastAssignedCode] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // 首次在浏览器端挂载时初始化 Supabase 客户端
  useEffect(() => {
    // 这段代码只会在客户端执行，SSR / 预渲染阶段不会运行 useEffect
    const client = createBrowserClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const fetchCodes = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("access_codes")
          .select(
            "code, user_id, valid_days, status, activated_at, expires_at, created_at"
          )
          .order("created_at", { ascending: false });

        if (error) {
          setError(error.message);
          return;
        }

        setCodes((data as AccessCodeRow[]) || []);
      } catch (error) {
        console.error("加载激活码列表失败:", error);
        setError("加载激活码列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCodes();
  }, [supabase]);

  const filteredCodes = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return codes.filter((c) => {
      // 状态 /有效性 过滤
      if (filter === "unused" && c.status !== "unused") {
        return false;
      }

      if (filter === "valid" && c.status === "expired") {
        // “未过期”仅依赖状态，不再按时间字段判断
        return false;
      }

      // 关键字搜索：按激活码部分匹配（不区分大小写）
      if (keyword) {
        const codeLower = c.code.toLowerCase();
        if (!codeLower.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }, [codes, filter, searchKeyword]);

  const stats = useMemo(() => {
    const total = codes.length;
    let unused = 0;
    let reserved = 0;
    let active = 0;
    let expired = 0;

    for (const c of codes) {
      if (c.status === "unused") unused += 1;
      else if (c.status === "reserved") reserved += 1;
      else if (c.status === "active") active += 1;
      else if (c.status === "expired") expired += 1;
    }

    return {
      total,
      unused,
      reserved,
      active,
      expired
    };
  }, [codes]);

  const dailyUsage = useMemo(() => {
    const map = new Map<string, number>();

    for (const c of codes) {
      if (!c.activated_at) continue;
      const d = new Date(c.activated_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + 1);
    }

    // 转为数组并按日期升序排列
    const entries = Array.from(map.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
    );

    // 只展示最近 14 天（用于折线图）
    return entries.slice(-14);
  }, [codes]);

  const handleGenerate = async () => {
    setGenerateError(null);
    const count = parseInt(generateCount, 10);

    if (!Number.isFinite(count) || count <= 0) {
      setGenerateError("生成数量必须是大于 0 的数字");
      return;
    }

    if (count > 200) {
      setGenerateError("单次最多生成 200 个激活码");
      return;
    }

    if (!supabase) {
      setGenerateError("Supabase 尚未初始化，请稍后重试");
      return;
    }

    setIsGenerating(true);
    try {
      const rows = Array.from({ length: count }).map(() => ({
        code: generateRandomCode(),
        user_id: null,
        // 当前阶段不再使用 valid_days / expires_at 控制有效期，仅作为占位字段
        valid_days: 0,
        status: "unused" as const,
        activated_at: null,
        expires_at: null
      }));

      const { data, error } = await supabase
        .from("access_codes")
        .insert(rows)
        .select(
          "code, user_id, valid_days, status, activated_at, expires_at, created_at"
        );

      if (error) {
        setGenerateError(error.message || "生成激活码失败");
        return;
      }

      setCodes((prev) => ([...(data as AccessCodeRow[]), ...prev]));
    } catch (error) {
      console.error("生成激活码失败:", error);
      setGenerateError("生成激活码失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefresh = async () => {
    if (!supabase) {
      setError("Supabase 尚未初始化，请稍后重试");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("access_codes")
        .select(
          "code, user_id, valid_days, status, activated_at, expires_at, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
        return;
      }

      setCodes((data as AccessCodeRow[]) || []);
    } catch (error) {
      console.error("刷新激活码列表失败:", error);
      setError("刷新激活码列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignRandomCode = async () => {
    setAssignError(null);

    if (!supabase) {
      setAssignError("Supabase 尚未初始化，请稍后重试");
      return;
    }

    const available = codes.filter((c) => c.status === "unused");
    if (available.length === 0) {
      setAssignError("当前没有可发放的未使用激活码");
      return;
    }

    const picked =
      available[Math.floor(Math.random() * available.length)];

    setIsAssigning(true);
    try {
      const { data, error } = await supabase
        .from("access_codes")
        .update({ status: "reserved" })
        .eq("code", picked.code)
        .eq("status", "unused")
        .select(
          "code, user_id, valid_days, status, activated_at, expires_at, created_at"
        )
        .maybeSingle();

      if (error) {
        setAssignError(error.message || "获取激活码失败");
        return;
      }

      if (!data) {
        setAssignError("本次获取激活码失败，请重试");
        return;
      }

      const updated = data as AccessCodeRow;

      setCodes((prev) =>
        prev.map((c) => (c.code === updated.code ? updated : c))
      );
      setLastAssignedCode(updated.code);

      // 成功获取激活码后，自动将完整激活链接写入剪贴板，方便直接发给用户
      if (
        typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
        const origin = window.location.origin;
        const joinBase = origin
          ? `${origin}/join?code=`
          : "https://example.com/join?code=";
        const joinUrl = `${joinBase}${encodeURIComponent(updated.code)}`;
        try {
          await navigator.clipboard.writeText(joinUrl);
        } catch (clipboardError) {
          console.error("复制激活链接到剪贴板失败:", clipboardError);
        }
      }
    } catch (error) {
      console.error("获取激活码失败:", error);
      setAssignError("获取激活码失败");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (filteredCodes.length === 0) {
      alert("当前列表为空，无法下载");
      return;
    }

    if (!supabase) {
      alert("Supabase 尚未初始化，请稍后重试");
      return;
    }

    // 导出当前列表中的激活码：
    // - 对于其中状态为 unused 的激活码，在导出同时标记为 reserved（中间状态）
    const codesToLock = filteredCodes.filter(
      (c) => c.status === "unused"
    );

    if (codesToLock.length > 0) {
      try {
        const codesList = codesToLock.map((c) => c.code);
        const { data, error } = await supabase
          .from("access_codes")
          .update({ status: "reserved" })
          .in("code", codesList)
          .eq("status", "unused")
          .select(
            "code, user_id, valid_days, status, activated_at, expires_at, created_at"
          );

        if (error) {
          console.error("批量更新激活码状态失败:", error);
        } else if (data) {
          const updatedRows = data as AccessCodeRow[];
          const updatedMap = new Map(
            updatedRows.map((row) => [row.code, row])
          );
          setCodes((prev) =>
            prev.map((c) =>
              updatedMap.has(c.code) ? updatedMap.get(c.code)! : c
            )
          );
        }
      } catch (error) {
        console.error("批量更新激活码状态失败:", error);
      }
    }

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const joinBase = origin
      ? `${origin}/join?code=`
      : "https://example.com/join?code=";

    const header =
      "code,status,valid_days,created_at,activated_at,expires_at,join_url\n";
    const lines = filteredCodes
      .map((c) => {
        const joinUrl = `${joinBase}${encodeURIComponent(c.code)}`;
        return [
          c.code,
          c.status,
          c.valid_days,
          c.created_at || "",
          c.activated_at || "",
          c.expires_at || "",
          joinUrl
        ]
          .map((v) => `"${String(v).replace(/\"/g, '""')}"`)
          .join(",");
      })
      .join("\n");

    const csv = header + lines;
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `access_codes_${filter}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">
              Admin
            </span>
            <span>激活码管理</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              返回首页
            </Link>
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? "刷新中..." : "刷新列表"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 text-sm">
        {/* 统计总览 + 快捷操作 */}
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            使用概览
          </h2>
          <div className="mb-3 grid gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">总激活码</div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                {stats.total}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">剩余可发放</div>
              <div className="mt-1 text-base font-semibold text-emerald-700">
                {stats.unused}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">已发放待使用</div>
              <div className="mt-1 text-base font-semibold text-sky-700">
                {stats.reserved}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">已注册占用</div>
              <div className="mt-1 text-base font-semibold text-indigo-700">
                {stats.active}
              </div>
            </div>
          </div>
          {dailyUsage.length > 0 && (
            <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              <div className="mb-1 text-[11px] font-semibold text-slate-500">
                最近 14 天使用激活码注册人数（折线图）
              </div>
              {dailyUsage.length === 1 ? (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="font-mono">{dailyUsage[0][0]}</span>
                  <span>注册 {dailyUsage[0][1]} 人</span>
                </div>
              ) : (
                <>
                  <svg
                    viewBox="0 0 100 60"
                    className="mt-2 h-24 w-full text-emerald-600"
                  >
                    {(() => {
                      const counts = dailyUsage.map(([, count]) => count);
                      const maxCount = Math.max(...counts, 1);
                      const len = dailyUsage.length;
                      const points = dailyUsage
                        .map(([, count], index) => {
                          const x =
                            (len === 1
                              ? 50
                              : (index / (len - 1)) * 96 + 2);
                          const y =
                            56 -
                            (count / maxCount) * 40; // 上下留边
                          return `${x},${y}`;
                        })
                        .join(" ");

                      return (
                        <>
                          <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            points={points}
                          />
                          {dailyUsage.map(([, count], index) => {
                            const x =
                              (len === 1
                                ? 50
                                : (index / (len - 1)) * 96 + 2);
                            const y =
                              56 -
                              (count / maxCount) * 40;
                            return (
                              <circle
                                key={x}
                                cx={x}
                                cy={y}
                                r={1.5}
                                fill="currentColor"
                              />
                          );
                        })}
                      </>
                    );
                  })()}
                  </svg>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-600">
                    {dailyUsage.map(([date, count]) => {
                      const [, month, day] = date.split("-");
                      return (
                        <div
                          key={date}
                          className="flex items-center justify-between rounded bg-white px-2 py-1"
                        >
                          <span className="font-mono">
                            {month}/{day}
                          </span>
                          <span className="font-semibold">
                            {count} 人
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              className="inline-flex items-center rounded bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={handleAssignRandomCode}
              disabled={isAssigning || isLoading || !supabase}
            >
              {isAssigning ? "获取中..." : "获取一个激活码"}
            </button>
            {lastAssignedCode && (
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-700">
                <span className="text-slate-500">最新获取：</span>
                <span>{lastAssignedCode}</span>
              </div>
            )}
          </div>
          {assignError && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-600">
              {assignError}
            </div>
          )}
        </section>

        {/* 生成激活码 */}
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            生成激活码
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">
                生成数量（最多 200）
              </label>
              <input
                type="number"
                min={1}
                max={200}
                className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                value={generateCount}
                onChange={(e) => setGenerateCount(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center rounded bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "生成中..." : "生成激活码"}
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              onClick={handleDownloadCsv}
            >
              下载当前列表（CSV）
            </button>
          </div>
          {generateError && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
              {generateError}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            提示：下载的 CSV 中包含完整的激活链接（形如{" "}
            <code className="rounded bg-slate-100 px-1">
              /join?code=XXXXX
            </code>
            ），可以直接发给用户。
          </p>
        </section>

        {/* 激活码列表 */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              激活码列表
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 ${
                    filter === "valid"
                      ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
                onClick={() => setFilter("valid")}
              >
                未过期
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  filter === "unused"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
                onClick={() => setFilter("unused")}
              >
                未使用
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  filter === "all"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
                onClick={() => setFilter("all")}
                  >
                    全部
                  </button>
                </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="按激活码搜索（支持部分匹配）"
                  className="w-48 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-500">
              正在加载激活码...
            </div>
          ) : filteredCodes.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-500">
              当前没有符合条件的激活码
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border-b border-slate-200 px-2 py-1 text-left">
                      激活码
                    </th>
                    <th className="border-b border-slate-200 px-2 py-1 text-left">
                      状态
                    </th>
                    <th className="border-b border-slate-200 px-2 py-1 text-left">
                      有效天数
                    </th>
                    <th className="border-b border-slate-200 px-2 py-1 text-left">
                      创建时间
                    </th>
                    <th className="border-b border-slate-200 px-2 py-1 text-left">
                      激活时间
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((c) => (
                    <tr key={c.code} className="hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-2 py-1 font-mono text-[11px]">
                        {c.code}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1">
                        {formatStatus(c.status)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1">
                        {c.valid_days}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1">
                        {formatDateTime(c.created_at)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1">
                        {formatDateTime(c.activated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function AdminAccessCodesPage() {
  const { user, isLoggedIn } = useAuthStore();

  // 仅管理员账号可访问
  if (!isLoggedIn || user?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        仅管理员账号可访问此页面
      </div>
    );
  }

  return <AccessCodesContent />;
}
