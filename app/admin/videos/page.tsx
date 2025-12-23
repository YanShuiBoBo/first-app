"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/store/auth-store";

interface VideoRow {
  id: string;
  cf_video_id: string;
  title: string;
  status: string;
  duration: number;
  created_at: string;
  author?: string | null;
  difficulty?: number | null;
  tags?: string[] | null;
  description?: string | null;
  cover_image_id?: string | null;
}

function formatDuration(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const h = `${d.getHours()}`.padStart(2, "0");
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

const CF_IMAGES_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CF_IMAGES_ACCOUNT_ID || "";

function getCoverUrl(video: VideoRow): string | null {
  if (video.cover_image_id && CF_IMAGES_ACCOUNT_HASH) {
    if (video.cover_image_id.startsWith("http")) {
      return video.cover_image_id;
    }
    return `https://imagedelivery.net/${CF_IMAGES_ACCOUNT_HASH}/${video.cover_image_id}/public`;
  }
  return null;
}

export default function AdminVideosPage() {
  // Supabase 客户端只在浏览器端初始化，避免构建 / 预渲染阶段触发环境变量错误
  const [supabase, setSupabase] =
    useState<ReturnType<typeof createBrowserClient> | null>(null);

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoRow | null>(null);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isSubtitlesModalOpen, setIsSubtitlesModalOpen] = useState(false);
  const [isCardsModalOpen, setIsCardsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 基础信息表单
  const [metaForm, setMetaForm] = useState({
    cf_video_id: "",
    title: "",
    author: "",
    description: "",
    difficulty: "",
    tags: "",
    poster: "",
    duration: "",
    cover_image_id: ""
  });

  // 字幕 / 卡片 JSON 文本
  const [subtitlesText, setSubtitlesText] = useState("");
  const [cardsText, setCardsText] = useState("");

  const [isCreating, setIsCreating] = useState(false);

  const router = useRouter();
  const { user, isLoggedIn } = useAuthStore();

  // 仅管理员账号可访问
  if (!isLoggedIn || user?.email !== "772861967@qq.com") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        仅管理员账号可访问此页面
      </div>
    );
  }

  // 首次在浏览器端挂载时初始化 Supabase 客户端
  useEffect(() => {
    const client = createBrowserClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    const fetchVideos = async () => {
      if (!supabase) return;
      try {
        setIsLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("videos")
          .select(
            "id, cf_video_id, title, status, duration, created_at, author, difficulty, tags, description, cover_image_id"
          )
          .order("created_at", { ascending: false });

        if (error) {
          setError(error.message);
          return;
        }

        setVideos((data as VideoRow[]) || []);
      } catch (err) {
        setError("加载视频列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideos();
  }, [supabase]);

  // 仅管理员账号可访问
  if (!isLoggedIn || user?.email !== "772861967@qq.com") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        仅管理员账号可访问此页面
      </div>
    );
  }

  const openMetaModalForEdit = (video: VideoRow) => {
    setIsCreating(false);
    setSelectedVideo(video);
    setMetaForm({
      cf_video_id: video.cf_video_id,
      title: video.title,
      author: video.author || "",
      description: video.description || "",
      difficulty: video.difficulty ? String(video.difficulty) : "",
      tags: video.tags ? video.tags.join(", ") : "",
      poster: "",
      duration: String(video.duration || ""),
      cover_image_id: video.cover_image_id || ""
    });
    setModalError(null);
    setIsMetaModalOpen(true);
  };

  const openMetaModalForCreate = () => {
    setIsCreating(true);
    setSelectedVideo(null);
    setMetaForm({
      cf_video_id: "",
      title: "",
      author: "",
      description: "",
      difficulty: "3",
      tags: "",
      poster: "",
      duration: "",
      cover_image_id: ""
    });
    setModalError(null);
    setIsMetaModalOpen(true);
  };

  const openSubtitlesModal = async (video: VideoRow) => {
    if (!supabase) {
      setModalError("Supabase 尚未初始化，请刷新页面后重试");
      return;
    }

    setSelectedVideo(video);
    setModalError(null);
    setSubtitlesText("");
    setIsSubtitlesModalOpen(true);

    try {
      const { data, error } = await supabase
        .from("subtitles")
        .select("content")
        .eq("video_id", video.id)
        .maybeSingle();

      if (error) {
        setModalError(error.message);
        return;
      }

      setSubtitlesText(
        JSON.stringify((data as any)?.content || [], null, 2)
      );
    } catch (err) {
      setModalError("加载字幕失败");
    }
  };

  const openCardsModal = async (video: VideoRow) => {
    if (!supabase) {
      setModalError("Supabase 尚未初始化，请刷新页面后重试");
      return;
    }

    setSelectedVideo(video);
    setModalError(null);
    setCardsText("");
    setIsCardsModalOpen(true);

    try {
      const { data, error } = await supabase
        .from("knowledge_cards")
        .select("trigger_word, data")
        .eq("video_id", video.id);

      if (error) {
        setModalError(error.message);
        return;
      }

      setCardsText(JSON.stringify(data || [], null, 2));
    } catch (err) {
      setModalError("加载知识卡片失败");
    }
  };

  const handleSaveMeta = async () => {
    if (!supabase) {
      setModalError("Supabase 尚未初始化，请刷新页面后重试");
      return;
    }

    setIsSaving(true);
    setModalError(null);

    try {
      const difficultyNumber = metaForm.difficulty
        ? Math.min(Math.max(parseInt(metaForm.difficulty, 10), 1), 5)
        : null;

      const tags =
        metaForm.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean) || [];

      if (isCreating) {
        // 新建视频
        const durationNumber = metaForm.duration
          ? parseFloat(metaForm.duration)
          : 0;

        const { data, error } = await supabase
          .from("videos")
          .insert({
            cf_video_id: metaForm.cf_video_id,
            title: metaForm.title,
            poster: metaForm.poster || null,
            duration: durationNumber,
            status: "published",
            author: metaForm.author || null,
            description: metaForm.description || null,
            difficulty: difficultyNumber ?? 3,
            tags,
            cover_image_id: metaForm.cover_image_id || null
          })
          .select()
          .single();

        if (error) {
          setModalError(error.message);
          return;
        }

        setVideos((prev) => [data as VideoRow, ...prev]);
      } else if (selectedVideo) {
        // 更新已有视频
        const { error } = await supabase
          .from("videos")
          .update({
            title: metaForm.title,
            author: metaForm.author || null,
            description: metaForm.description || null,
            difficulty: difficultyNumber,
            tags,
            cover_image_id: metaForm.cover_image_id || null
          })
          .eq("id", selectedVideo.id);

        if (error) {
          setModalError(error.message);
          return;
        }

        setVideos((prev) =>
          prev.map((v) =>
            v.id === selectedVideo.id
              ? {
                  ...v,
                  title: metaForm.title,
                  author: metaForm.author || null,
                  difficulty: difficultyNumber ?? undefined,
                  tags
                }
              : v
          )
        );
      }

      setIsMetaModalOpen(false);
    } catch (err) {
      setModalError("保存基础信息失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSubtitles = async () => {
    if (!selectedVideo) return;
    if (!supabase) {
      setModalError("Supabase 尚未初始化，请刷新页面后重试");
      return;
    }

    setIsSaving(true);
    setModalError(null);

    try {
      const parsed = JSON.parse(subtitlesText);
      if (!Array.isArray(parsed)) {
        throw new Error("字幕 JSON 必须是数组");
      }

      const { error } = await supabase
        .from("subtitles")
        .upsert(
          {
            video_id: selectedVideo.id,
            content: parsed
          },
          { onConflict: "video_id" }
        );

      if (error) {
        setModalError(error.message);
        return;
      }

      setIsSubtitlesModalOpen(false);
    } catch (err: any) {
      setModalError(err?.message || "保存字幕失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCards = async () => {
    if (!selectedVideo) return;
    if (!supabase) {
      setModalError("Supabase 尚未初始化，请刷新页面后重试");
      return;
    }

    setIsSaving(true);
    setModalError(null);

    try {
      const parsed = JSON.parse(cardsText);
      if (!Array.isArray(parsed)) {
        throw new Error("卡片 JSON 必须是数组");
      }

      const rows = parsed.map((item: any) => ({
        video_id: selectedVideo.id,
        trigger_word: item.trigger_word,
        data: item.data
      }));

      // 先删除旧卡片，再插入新卡片
      const { error: delError } = await supabase
        .from("knowledge_cards")
        .delete()
        .eq("video_id", selectedVideo.id);
      if (delError) {
        setModalError(delError.message);
        return;
      }

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from("knowledge_cards")
          .insert(rows);
        if (insertError) {
          setModalError(insertError.message);
          return;
        }
      }

      setIsCardsModalOpen(false);
    } catch (err: any) {
      setModalError(err?.message || "保存知识卡片失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">
              Admin
            </span>
            <span>素材管理后台</span>
          </div>
          <button
            type="button"
            className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm shadow-slate-900/40"
            onClick={() => router.push("/")}
          >
            返回前台
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              视频素材管理
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              查看、检索和跳转到精读页面，便于核对上传内容。
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm shadow-sky-500/40 hover:bg-sky-500"
            onClick={openMetaModalForCreate}
          >
            新建视频
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700">视频列表</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px]">
                共 {videos.length} 条
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              正在加载视频数据...
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-center text-xs text-red-500">
              {error}
            </div>
          ) : videos.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              暂无视频数据，请先通过脚本上传一批素材。
            </div>
          ) : (
            <table className="min-w-full border-t border-slate-100 text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">序号</th>
                  <th className="px-4 py-2 text-left">视频标题</th>
                  <th className="px-4 py-2 text-left">作者</th>
                  <th className="px-4 py-2 text-left">难度</th>
                  <th className="px-4 py-2 text-left">标签</th>
                  <th className="px-4 py-2 text-left">首图预览</th>
                  <th className="px-4 py-2 text-left">首图ID</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">时长</th>
                  <th className="px-4 py-2 text-left">创建时间</th>
                  <th className="px-4 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {videos.map((video, idx) => (
                  <tr key={video.id} className="hover:bg-slate-50/80">
                    {/* 序号：最新的视频在最上面，显示为倒序编号 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-500">
                      {videos.length - idx}
                    </td>
                    {/* 视频标题 + cf_video_id（方便复制） */}
                    <td className="px-4 py-2 align-middle">
                      <div className="max-w-xs truncate text-[13px] font-medium text-slate-900">
                        {video.title}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {video.cf_video_id}
                      </div>
                    </td>
                    {/* 作者 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-600">
                      {video.author || "-"}
                    </td>
                    {/* 难度 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-600">
                      {video.difficulty
                        ? "🌟".repeat(
                            Math.min(Math.max(video.difficulty, 1), 5)
                          )
                        : "-"}
                    </td>
                    {/* 标签 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-500">
                      {video.tags && video.tags.length > 0
                        ? video.tags.slice(0, 3).join(" / ")
                        : "-"}
                    </td>
                    {/* 首图预览 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-500">
                      {(() => {
                        const url = getCoverUrl(video);
                        return url ? (
                          // 为了简单，这里直接用 <img>，不用 next/image
                          <img
                            src={url}
                            alt={video.title}
                            className="h-12 w-20 rounded object-cover"
                          />
                        ) : (
                          <div className="h-12 w-20 rounded bg-slate-100" />
                        );
                      })()}
                    </td>
                    {/* 首图 ID */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-500">
                      {video.cover_image_id || "-"}
                    </td>
                    {/* 状态 */}
                    <td className="px-4 py-2 align-middle">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                          video.status === "published"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {video.status === "published" ? "已发布" : video.status}
                      </span>
                    </td>
                    {/* 时长 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-500">
                      {formatDuration(video.duration)}
                    </td>
                    {/* 创建时间 */}
                    <td className="px-4 py-2 align-middle text-[11px] text-slate-500">
                      {formatDateTime(video.created_at)}
                    </td>
                    {/* 操作按钮 */}
                    <td className="px-4 py-2 align-middle">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded bg-slate-900 px-2 py-1 text-[11px] text-white"
                          onClick={() =>
                            router.push(`/watch/${video.cf_video_id}`)
                          }
                        >
                          精读
                        </button>
                        <button
                          type="button"
                          className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
                          onClick={() => openSubtitlesModal(video)}
                        >
                          字幕
                        </button>
                        <button
                          type="button"
                          className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
                          onClick={() => openCardsModal(video)}
                        >
                          卡片
                        </button>
                        <button
                          type="button"
                          className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
                          onClick={() => openMetaModalForEdit(video)}
                        >
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* 基础信息弹窗 */}
      {isMetaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 text-sm shadow-lg">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              {isCreating ? "新建视频" : "编辑视频基础信息"}
            </h2>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">Cloudflare 视频 ID（cf_video_id）</label>
                <input
                  className="rounded border px-2 py-1 text-xs"
                  value={metaForm.cf_video_id}
                  onChange={(e) =>
                    setMetaForm((f) => ({ ...f, cf_video_id: e.target.value }))
                  }
                  disabled={!isCreating}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">标题</label>
                <input
                  className="rounded border px-2 py-1 text-xs"
                  value={metaForm.title}
                  onChange={(e) =>
                    setMetaForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">作者</label>
                <input
                  className="rounded border px-2 py-1 text-xs"
                  value={metaForm.author}
                  onChange={(e) =>
                    setMetaForm((f) => ({ ...f, author: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">
                  难度（1-5，显示为 🌟）
                </label>
                <input
                  className="rounded border px-2 py-1 text-xs"
                  value={metaForm.difficulty}
                  onChange={(e) =>
                    setMetaForm((f) => ({ ...f, difficulty: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">
                  标签（用逗号分隔，如 日常生活, 旅游）
                </label>
                <input
                  className="rounded border px-2 py-1 text-xs"
                  value={metaForm.tags}
                  onChange={(e) =>
                    setMetaForm((f) => ({ ...f, tags: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">简介</label>
                <textarea
                  className="rounded border px-2 py-1 text-xs"
                  rows={3}
                  value={metaForm.description}
                  onChange={(e) =>
                    setMetaForm((f) => ({
                      ...f,
                      description: e.target.value
                    }))
                  }
                />
              </div>
              {isCreating && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">
                      封面 URL（poster）
                    </label>
                    <input
                      className="rounded border px-2 py-1 text-xs"
                      value={metaForm.poster}
                      onChange={(e) =>
                        setMetaForm((f) => ({ ...f, poster: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">
                      时长（秒）
                    </label>
                    <input
                      className="rounded border px-2 py-1 text-xs"
                      value={metaForm.duration}
                      onChange={(e) =>
                        setMetaForm((f) => ({ ...f, duration: e.target.value }))
                      }
                    />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-600">
                  首图 Cloudflare ID（cover_image_id）
                </label>
                <input
                  className="rounded border px-2 py-1 text-xs"
                  value={metaForm.cover_image_id}
                  onChange={(e) =>
                    setMetaForm((f) => ({
                      ...f,
                      cover_image_id: e.target.value
                    }))
                  }
                />
              </div>
            </div>

            {modalError && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
                {modalError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => setIsMetaModalOpen(false)}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 py-1 text-white"
                onClick={handleSaveMeta}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 字幕编辑弹窗 */}
      {isSubtitlesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 text-sm shadow-lg">
            <h2 className="mb-2 text-base font-semibold text-slate-900">
              编辑字幕 JSON
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              结构示例：[&#123; "start": 0.5, "end": 2.1, "text_en": "Hello", "text_cn": "你好" &#125;]
            </p>
            <textarea
              className="h-64 w-full rounded border px-2 py-1 text-xs font-mono"
              value={subtitlesText}
              onChange={(e) => setSubtitlesText(e.target.value)}
            />
            {modalError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
                {modalError}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => setIsSubtitlesModalOpen(false)}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 py-1 text-white"
                onClick={handleSaveSubtitles}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存字幕"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 知识卡片编辑弹窗 */}
      {isCardsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 text-sm shadow-lg">
            <h2 className="mb-2 text-base font-semibold text-slate-900">
              编辑知识卡片 JSON
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              结构示例：[&#123; "trigger_word": "Hello", "data": &#123; "def": "打招呼", "ipa": "/həˈloʊ/" &#125; &#125;]
            </p>
            <textarea
              className="h-64 w-full rounded border px-2 py-1 text-xs font-mono"
              value={cardsText}
              onChange={(e) => setCardsText(e.target.value)}
            />
            {modalError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
                {modalError}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => setIsCardsModalOpen(false)}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 py-1 text-white"
                onClick={handleSaveCards}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存卡片"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
