'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import StatsCard from '@/components/dashboard/StatsCard';
import NotificationCard from '@/components/dashboard/NotificationCard';
import StudyCalendar from '@/components/dashboard/StudyCalendar';
import { useAuthStore } from '@/lib/store/auth-store';
import Header from '@/components/layout/Header';
import { createBrowserClient } from '@/lib/supabase/client';

// 定义视频卡片类型
interface VideoCard {
  id: string;
  cf_video_id: string;
  title: string;
  poster: string | null;
  duration: number;
  status: string;
  author?: string | null;
  description?: string | null;
  difficulty?: number | null;
  tags?: string[] | null;
  cover_image_id?: string | null;
}

export default function Home() {
  const [filteredTag, setFilteredTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [studyDates, setStudyDates] = useState<string[]>([]);

  // Supabase 客户端只在浏览器端初始化，避免构建 / 预渲染阶段触发环境变量错误
  const [supabase, setSupabase] =
    useState<ReturnType<typeof createBrowserClient> | null>(null);

  // 登录状态
  const { initialize, user } = useAuthStore();

  // 首次在浏览器端挂载时初始化 Supabase 客户端
  useEffect(() => {
    const client = createBrowserClient();
    setSupabase(client);
  }, []);

  // 获取视频数据
  const fetchVideos = useCallback(async () => {
    if (!supabase) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('videos')
        .select(
          'id, cf_video_id, title, poster, duration, status, author, description, difficulty, tags, cover_image_id'
        )
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setVideos(data || []);
    } catch (error) {
      console.error('获取视频数据失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // 获取当前用户的学习统计（已学习数量 + 当月学习日历）
  const fetchStudyStats = useCallback(
    async (userEmail: string, videoTotal: number) => {
      if (!supabase) return;

      try {
        // 已学习视频数量：在 user_video_progress 中存在记录即可视为已学
        const { count: learned } = await supabase
          .from('user_video_progress')
          .select('id', { count: 'exact', head: true })
          .eq('user_email', userEmail)
          .eq('status', 'completed');

        setLearnedCount(learned || 0);

        // 本月学习日历（基于本地日期计算，避免 UTC 偏移）
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth(); // 0-based
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const formatLocalDate = (d: Date) => {
          const y = d.getFullYear();
          const m = (d.getMonth() + 1).toString().padStart(2, '0');
          const day = d.getDate().toString().padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const from = formatLocalDate(firstDay);
        const to = formatLocalDate(lastDay);

        const { data: days } = await supabase
          .from('user_study_days')
          .select('study_date')
          .eq('user_email', userEmail)
          .gte('study_date', from)
          .lte('study_date', to);

        const dateList =
          days?.map((d: { study_date: string }) =>
            d.study_date.slice(0, 10)
          ) || [];

        setStudyDates(dateList);
      } catch (error) {
        console.error('获取学习统计失败:', error);
        setLearnedCount(0);
        setStudyDates([]);
      }
    },
    [supabase]
  );

  // 页面加载时初始化登录状态和获取视频数据
  useEffect(() => {
    initialize();
    fetchVideos();
  }, [initialize, fetchVideos]);

  // 登录用户与视频列表就绪后，获取学习统计
  useEffect(() => {
    if (!user?.email || videos.length === 0) return;
    fetchStudyStats(user.email, videos.length);
  }, [user?.email, videos.length, fetchStudyStats]);

  // 过滤视频
  const filteredVideos = videos.filter(video => {
    const matchesSearch = searchQuery ?
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) : true;
    return matchesSearch;
  });

  // 所有标签 - 暂时没有标签功能
  const allTags: string[] = [];

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  const renderDifficultyStars = (difficulty?: number | null) => {
    const d = Math.min(Math.max(difficulty ?? 3, 1), 5);
    return '🌟'.repeat(d);
  };

  // Cloudflare Images 访问地址：
  // 根据你的 cURL：图片 ID 在 cover_image_id 中，例如 eaac49f0-...
  // 页面展示使用 https://imagedelivery.net/<account_hash>/<image_id>/public
  const CF_IMAGES_ACCOUNT_HASH =
    process.env.NEXT_PUBLIC_CF_IMAGES_ACCOUNT_ID || '';

  const getCoverSrc = (video: VideoCard, fallback: string) => {
    if (video.cover_image_id && CF_IMAGES_ACCOUNT_HASH) {
      // 如果直接存的是完整 URL，就直接用
      if (video.cover_image_id.startsWith('http')) {
        return video.cover_image_id;
      }

      // 否则按 imagedelivery.net 规则拼接
      return `https://imagedelivery.net/${CF_IMAGES_ACCOUNT_HASH}/${video.cover_image_id}/public`;
    }

    // 退回到 poster 或本地占位图
    return video.poster || fallback;
  };

  const heroVideo = filteredVideos[0] || videos[0] || null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#09090b] text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-15%] top-[-10%] h-64 w-64 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute right-[-20%] bottom-[-10%] h-80 w-80 rounded-full bg-violet-500/25 blur-3xl" />
      </div>

      {/* Header */}
      <Header />

      {/* 主内容区 - 固定 Header 下方 */}
      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-12 pt-24">
        {/* 主布局：左侧内容 + 右侧侧栏 */}
        <section className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* 左侧：Hero + 文案 + 搜索 + 视频列表 */}
          <div className="space-y-6 lg:col-span-9">
            {/* 左侧 Hero：仅占内容区域，不影响右侧侧栏位置 */}
            {heroVideo && (
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 shadow-lg shadow-black/60">
                <div className="relative h-52 w-full md:h-64 lg:h-72">
                  <Image
                    unoptimized
                    src={getCoverSrc(
                      heroVideo,
                      '/images/hero-placeholder-960x540.png'
                    )}
                    alt={heroVideo.title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
                    <div className="mb-3 flex items-center gap-2 text-[11px] text-zinc-300">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em]">
                        Immersive English
                      </span>
                      <span className="rounded-full bg-emerald-500/80 px-2 py-0.5 text-[10px] text-emerald-50">
                        精选推荐
                      </span>
                    </div>
                    <h1 className="max-w-xl text-2xl font-semibold leading-tight text-zinc-50 md:text-3xl">
                      {heroVideo.title}
                    </h1>
                    {heroVideo.description && (
                      <p className="mt-2 max-w-md text-sm text-zinc-300 line-clamp-2">
                        {heroVideo.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-300">
                      {heroVideo.author && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                          <span>作者</span>
                          <span className="font-medium">
                            {heroVideo.author}
                          </span>
                        </span>
                      )}
                      {heroVideo.difficulty && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                          <span>难度</span>
                          <span>{renderDifficultyStars(heroVideo.difficulty)}</span>
                        </span>
                      )}
                      {heroVideo.tags && heroVideo.tags.length > 0 && (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {heroVideo.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-zinc-800/90 px-2 py-0.5 text-[10px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <Link
                        href={`/watch/${heroVideo.cf_video_id}`}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-xs font-medium text-zinc-950 shadow-md shadow-emerald-500/40 transition-transform hover:-translate-y-0.5 hover:bg-emerald-400"
                      >
                        <span className="text-base leading-none">▶</span>
                        <span>开始精读</span>
                      </Link>
                      <span className="text-xs text-zinc-400">
                        ⏱ {formatDuration(heroVideo.duration)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-400">
                  Immersive · English
                </p>
                <h2 className="mt-3 text-xl font-semibold leading-tight md:text-2xl">
                  精读素材库
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  精选短视频 + 双语脚本 + 知识卡片，碎片时间也能高效进步。
                </p>
              </div>

              <div className="w-full md:w-72">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜一搜你想练的场景，如 travel / movie / daily"
                    className="w-full rounded-full border border-slate-700/70 bg-slate-900/80 px-4 py-2 pl-11 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    value={searchQuery}
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                    <span className="text-sm">🔍</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 左侧下方：全部视频列表，和右侧统计处于同一行，避免中间留大块空白 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    全部内容
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    每一条都是配好字幕和知识卡片的精读素材，刷完就是完整一轮输入。
                  </p>
                </div>
                {!isLoading && (
                  <div className="hidden text-xs text-slate-500 sm:block">
                    共 {filteredVideos.length} 个视频
                  </div>
                )}
              </div>

              {/* 标签筛选 */}
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filteredTag === null
                      ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/40'
                      : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                  }`}
                  onClick={() => setFilteredTag(null)}
                >
                  全部
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filteredTag === tag
                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/40'
                        : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => setFilteredTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* 视频列表 */}
              {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                </div>
              ) : filteredVideos.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {filteredVideos.map(video => (
                    <Link
                      key={video.id}
                      href={`/watch/${video.cf_video_id}`}
                      className="group block overflow-hidden rounded-xl border border-white/5 bg-zinc-900/60 shadow-md shadow-black/60 transition-transform hover:-translate-y-1 hover:border-sky-500/60"
                    >
                      {/* 视频封面 */}
                      <div className="relative">
                        <Image
                          unoptimized
                          src={getCoverSrc(
                            video,
                            '/images/card-placeholder-640x360.png'
                          )}
                          alt={video.title}
                          width={640}
                          height={360}
                          className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] text-slate-100">
                          <span className="inline-flex items-center rounded-full bg-black/70 px-2 py-1">
                            ⏱ {formatDuration(video.duration)}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-zinc-900/80 px-2 py-1 text-[10px] font-medium text-zinc-200">
                            精读视频 · 双语字幕
                          </span>
                        </div>
                      </div>

                      {/* 视频信息 */}
                      <div className="flex items-start justify-between px-4 py-3">
                        <div className="pr-2">
                          <h3 className="line-clamp-2 text-sm font-semibold text-slate-50">
                            {video.title}
                          </h3>
                          {video.author && (
                            <p className="mt-1 text-[11px] text-zinc-400">
                              作者 · {video.author}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                            {video.difficulty && (
                              <span>{renderDifficultyStars(video.difficulty)}</span>
                            )}
                            {video.tags &&
                              video.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-zinc-800/90 px-2 py-0.5 text-[10px] text-zinc-300"
                                >
                                  {tag}
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center text-slate-500">
                  <p className="mb-2 text-lg">没有找到匹配的视频</p>
                  <p className="text-sm">
                    可以换个关键词，或者清空搜索重新试试～
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧：学习统计 & 官方通知玻璃侧栏 */}
          <div className="lg:col-span-3">
            <div className="flex flex-col gap-4 lg:sticky lg:top-24">
              <StatsCard
                totalVideos={videos.length}
                learnedVideos={learnedCount}
                notLearnedVideos={Math.max(
                  videos.length - learnedCount,
                  0
                )}
              />
              <StudyCalendar
                year={new Date().getFullYear()}
                month={new Date().getMonth() + 1}
                studyDates={studyDates}
              />
              <NotificationCard />
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
