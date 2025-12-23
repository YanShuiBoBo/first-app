"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/store/auth-store";

interface AccessCodeRow {
  code: string;
  user_id: string | null;
  valid_days: number;
  status: "unused" | "active" | "expired" | string;
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

export default function AdminAccessCodesPage() {
  const supabase = createBrowserClient();
  const { user, isLoggedIn } = useAuthStore();

  const [codes, setCodes] = useState<AccessCodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterType>("valid");

  const [generateCount, setGenerateCount] = useState("10");
  const [generateValidDays, setGenerateValidDays] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // 仅管理员账号可访问
  if (!isLoggedIn || user?.email !== "772861967@qq.com") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        仅管理员账号可访问此页面
      </div>
    );
  }

  useEffect(() => {
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
      } catch (err) {
        setError("加载激活码列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCodes();
  }, [supabase]);

  const filteredCodes = useMemo(() => {
    const now = new Date();
    return codes.filter((c) => {
      if (filter === "unused") {
        return c.status === "unused";
      }

      if (filter === "valid") {
        // 未过期：状态不是 expired，并且未设置过期时间或过期时间在未来
        if (c.status === "expired") return false;
        if (!c.expires_at) return true;
        const exp = new Date(c.expires_at);
        if (Number.isNaN(exp.getTime())) return true;
        return exp > now;
      }

      return true;
    });
  }, [codes, filter]);

  const handleGenerate = async () => {
    setGenerateError(null);
    const count = parseInt(generateCount, 10);
    const validDays = parseInt(generateValidDays, 10) || 30;

    if (!Number.isFinite(count) || count <= 0) {
      setGenerateError("生成数量必须是大于 0 的数字");
      return;
    }

    if (count > 200) {
      setGenerateError("单次最多生成 200 个激活码");
      return;
    }

    if (!Number.isFinite(validDays) || validDays <= 0) {
      setGenerateError("有效天数必须是大于 0 的数字");
      return;
    }

    setIsGenerating(true);
    try {
      const now = Date.now();
      const expiresAt = new Date(
        now + validDays * 24 * 60 * 60 * 1000
      ).toISOString();

      const rows = Array.from({ length: count }).map(() => ({
        code: generateRandomCode(),
        user_id: null,
        valid_days: validDays,
        status: "unused" as const,
        activated_at: null,
        expires_at: expiresAt
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
    } catch (err) {
      setGenerateError("生成激活码失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefresh = async () => {
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
    } catch (err) {
      setError("刷新激活码列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (filteredCodes.length === 0) {
      alert("当前列表为空，无法下载");
      return;
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
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? "刷新中..." : "刷新列表"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 text-sm">
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
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">
                有效天数（从生成开始算起）
              </label>
              <input
                type="number"
                min={1}
                className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                value={generateValidDays}
                onChange={(e) => setGenerateValidDays(e.target.value)}
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              激活码列表
            </h2>
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
                    <th className="border-b border-slate-200 px-2 py-1 text-left">
                      过期时间
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
                      <td className="border-b border-slate-100 px-2 py-1">
                        {formatDateTime(c.expires_at)}
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

