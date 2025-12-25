'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import StatsCard from '@/components/dashboard/StatsCard';
import StudyCalendar from '@/components/dashboard/StudyCalendar';
import { useAuthStore } from '@/lib/store/auth-store';
import Header from '@/components/layout/Header';
import { createBrowserClient } from '@/lib/supabase/client';

function IconFlame() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3.5S17 6 17 9.5a5 5 0 0 1-10 0c0-1.6.5-3.2 1.4-4.5" />
      <path d="M9.5 10.5c0 1.5.8 2.5 2.5 2.5 1.1 0 2-.5 2.3-1.6" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 9v4l2 1" />
    </svg>
  );
}

function IconStack() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 17 8 4 8-4" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5h16" />
      <path d="M7 12h10" />
      <path d="M10 19h4" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19s-4.5-2.8-6.7-5A3.8 3.8 0 0 1 5 8c1.7-2 4.3-1.4 5.5.2C11.7 6.6 14.3 6 16 8a3.8 3.8 0 0 1-.3 6c-2.2 2.2-6.7 5-6.7 5Z" />
    </svg>
  );
}

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
  view_count?: number | null;
}

type CategoryValue = 'all' | 'vlog' | 'work' | 'tech' | 'movie' | 'speech';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';
type SortOrder = 'hottest' | 'latest';
type StatusFilter = 'all' | 'unlearned' | 'completed';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [completedVideoIds, setCompletedVideoIds] = useState<string[]>([]);

  const [activeCategory] = useState<CategoryValue>('all');
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('hottest');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');
  const [activeThemeTag, setActiveThemeTag] = useState<string | null>(
    null
  );

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isStatsSheetOpen, setIsStatsSheetOpen] = useState(false);

  // Supabase 客户端只在浏览器端初始化
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
          'id, cf_video_id, title, poster, duration, status, author, description, difficulty, tags, cover_image_id, view_count'
        )
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVideos(data || []);
    } catch (err) {
      console.error('获取视频数据失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // 获取当前用户的学习统计（已学习数量 + 当月学习日历）
  const fetchStudyStats = useCallback(
    async (userEmail: string) => {
      if (!supabase) return;

      try {
        // 已学习视频数量
        const { count: learned } = await supabase
          .from('user_video_progress')
          .select('id', { count: 'exact', head: true })
          .eq('user_email', userEmail)
          .eq('status', 'completed');

        setLearnedCount(learned || 0);

        // 当前用户的已完成视频列表，用于筛选“未学 / 已学”
        const { data: progressRows } = await supabase
          .from('user_video_progress')
          .select('video_id, status')
          .eq('user_email', userEmail);

        const completedIds =
          progressRows
            ?.filter((row) => row.status === 'completed')
            .map((row) => row.video_id) || [];

        setCompletedVideoIds(completedIds);

        // 本月学习日历
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
      } catch (err) {
        console.error('获取学习统计失败:', err);
        setLearnedCount(0);
        setCompletedVideoIds([]);
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
    fetchStudyStats(user.email);
  }, [user?.email, videos.length, fetchStudyStats]);

  // 工具函数：难度映射到档位
  const getDifficultyLevel = (
    difficulty?: number | null
  ): Exclude<DifficultyFilter, 'all'> => {
    const d = difficulty ?? 3;
    if (d <= 2) return 'easy';
    if (d === 3) return 'medium';
    return 'hard';
  };

  const completedSet = new Set(completedVideoIds);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchCategory = (video: VideoCard) => {
    if (activeCategory === 'all') return true;
    if (!video.tags || video.tags.length === 0) return false;

    const tags = video.tags.map((t) => t.toLowerCase());

    if (activeCategory === 'vlog') {
      return tags.some((t) => t.includes('vlog'));
    }
    if (activeCategory === 'work') {
      return tags.some((t) => t.includes('work') || t.includes('职场'));
    }
    if (activeCategory === 'tech') {
      return tags.some((t) => t.includes('tech') || t.includes('科技'));
    }
    if (activeCategory === 'movie') {
      return tags.some((t) => t.includes('movie') || t.includes('电影'));
    }
    if (activeCategory === 'speech') {
      return tags.some(
        (t) => t.includes('speech') || t.includes('演讲') || t.includes('ted')
      );
    }

    return true;
  };

  // 作者选项：从当前视频列表中提取
  const authorOptions: string[] = Array.from(
    new Set(
      videos
        .map((v) => v.author)
        .filter((name): name is string => !!name && name.trim().length > 0)
    )
  );

  const themeTags: string[] = Array.from(
    new Set(
      videos
        .flatMap((v) => v.tags || [])
        .filter((tag): tag is string => !!tag && tag.trim().length > 0)
    )
  );

  // 过滤视频
  const filteredVideos = videos
    .filter((video) => {
      if (!normalizedQuery) return true;

      const inTitle = video.title
        .toLowerCase()
        .includes(normalizedQuery);
      const inAuthor = (video.author || '')
        .toLowerCase()
        .includes(normalizedQuery);
      const inTags = (video.tags || []).some((tag) =>
        tag.toLowerCase().includes(normalizedQuery)
      );

      return inTitle || inAuthor || inTags;
    })
    .filter((video) => matchCategory(video))
    .filter((video) => {
      if (difficultyFilter === 'all') return true;
      return getDifficultyLevel(video.difficulty) === difficultyFilter;
    })
    .filter((video) => {
      if (!activeThemeTag) return true;
      return (video.tags || []).includes(activeThemeTag);
    })
    .filter((video) => {
      if (authorFilter === 'all') return true;
      return (video.author || '') === authorFilter;
    })
    .filter((video) => {
      if (statusFilter === 'all') return true;
      const completed = completedSet.has(video.id);
      if (statusFilter === 'completed') return completed;
      if (statusFilter === 'unlearned') return !completed;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'hottest') {
        const av = a.view_count ?? 0;
        const bv = b.view_count ?? 0;
        return bv - av;
      }
      return 0;
    });

  const totalDurationSeconds = videos.reduce(
    (sum, video) => sum + (video.duration || 0),
    0
  );
  const totalDurationHours = totalDurationSeconds / 3600;

  const displayName =
    (user?.email && user.email.split('@')[0]) || '朋友';

  const hour = new Date().getHours();
  let greetingLabel = 'Good evening';
  if (hour < 12) {
    greetingLabel = 'Good morning';
  } else if (hour < 18) {
    greetingLabel = 'Good afternoon';
  }

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

  // Cloudflare Images 访问地址（作为 poster 之后的兜底方案）
  const CF_IMAGES_ACCOUNT_HASH =
    process.env.NEXT_PUBLIC_CF_IMAGES_ACCOUNT_ID || '';

  const getCoverSrc = (video: VideoCard, fallback: string) => {
    if (video.poster) return video.poster;

    if (video.cover_image_id) {
      if (video.cover_image_id.startsWith('http')) {
        return video.cover_image_id;
      }
      if (CF_IMAGES_ACCOUNT_HASH) {
        return `https://imagedelivery.net/${CF_IMAGES_ACCOUNT_HASH}/${video.cover_image_id}/public`;
      }
    }

    return fallback;
  };

  // 首页推荐视频：使用点击量最高的视频作为推荐来源（如果有数据）
  const heroVideo =
    videos.length > 0
      ? videos.reduce((best, v) => {
          const bestViews = best.view_count ?? 0;
          const currentViews = v.view_count ?? 0;
          return currentViews > bestViews ? v : best;
        }, videos[0])
      : null;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-24">
        {/* 顶部标题区域 */}
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">
            Immersive · English
          </p>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-neutral-900 md:text-3xl">
            精读学习大厅
          </h1>
          <p className="max-w-xl text-sm text-neutral-600">
            像一本铺在书桌上的精美杂志，精选短视频 + 双语脚本 + 知识卡片，帮你轻松沉浸学英语。
          </p>
        </section>

        {/* 移动端数据胶囊 */}
        <section className="mt-4 flex gap-3 overflow-x-auto pb-1 text-xs text-neutral-600 md:hidden">
          <button
            type="button"
            className="inline-flex min-w-[180px] items-center justify-between rounded-2xl bg-gradient-to-r from-rose-50 to-rose-100 px-4 py-3 shadow-sm"
            onClick={() => setIsStatsSheetOpen(true)}
          >
            <div className="flex items-center gap-2">
              <IconFlame />
              <div className="text-left">
                <div className="text-[11px] text-neutral-500">
                  连击天数
                </div>
                <div className="text-xs font-medium text-neutral-700">
                  本月已打卡
                </div>
              </div>
            </div>
            <div className="whitespace-nowrap text-sm font-semibold text-neutral-900">
              {studyDates.length} 天
            </div>
          </button>
          <button
            type="button"
            className="inline-flex min-w-[180px] items-center justify-between rounded-2xl bg-gradient-to-r from-sky-50 to-sky-100 px-4 py-3 shadow-sm"
            onClick={() => setIsStatsSheetOpen(true)}
          >
            <div className="flex items-center gap-2">
              <IconClock />
              <div className="text-left">
                <div className="text-[11px] text-neutral-500">
                  累计时长
                </div>
                <div className="text-xs font-medium text-neutral-700">
                  统计全库精读时长
                </div>
              </div>
            </div>
            <div className="whitespace-nowrap text-sm font-semibold text-neutral-900">
              {totalDurationHours.toFixed(1)} h
            </div>
          </button>
          <div className="inline-flex min-w-[180px] items-center justify-between rounded-2xl bg-gradient-to-r from-amber-50 to-amber-100 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <IconStack />
              <div className="text-left">
                <div className="text-[11px] text-neutral-500">
                  素材总数
                </div>
                <div className="text-xs font-medium text-neutral-700">
                  当前可精读的视频
                </div>
              </div>
            </div>
            <div className="whitespace-nowrap text-sm font-semibold text-neutral-900">
              {videos.length} 部
            </div>
          </div>
        </section>

        {/* Hero + 右侧控制台 */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          {/* 左侧：今日精选 Hero Poster */}
          <div>
            {heroVideo ? (
              <Link
                href={`/watch/${heroVideo.cf_video_id}`}
                className="block overflow-hidden rounded-2xl bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex flex-col md:flex-row">
                  {/* 左侧封面图 */}
                  <div className="relative w-full md:w-1/2">
                    <div className="relative h-56 w-full overflow-hidden md:h-full">
                      <Image
                        unoptimized
                        src={getCoverSrc(
                          heroVideo,
                          '/images/hero-placeholder-960x540.png'
                        )}
                        alt={heroVideo.title}
                        fill
                        className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                      />
                    </div>
                  </div>

                  {/* 右侧内容区 */}
                  <div className="flex flex-1 flex-col justify-between gap-3 p-4 md:p-5">
                    {/* 标题 + 基本信息 */}
                    <div>
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-[#FF2442]">
                        今日精选
                      </span>
                      <h2 className="mt-2 line-clamp-2 text-[16px] font-semibold leading-snug text-neutral-900 md:text-lg">
                        {heroVideo.title}
                      </h2>
                      {heroVideo.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                          {heroVideo.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                        {heroVideo.author && (
                          <span className="inline-flex items-center gap-1">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] text-neutral-700">
                              {heroVideo.author.charAt(0).toUpperCase()}
                            </span>
                            <span>{heroVideo.author}</span>
                          </span>
                        )}
                        {heroVideo.difficulty && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                            <span>难度</span>
                            <span>{renderDifficultyStars(heroVideo.difficulty)}</span>
                          </span>
                        )}
                        {heroVideo.tags && heroVideo.tags.length > 0 && (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            {heroVideo.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 预习概览区：展示核心词汇 / 金句预览 */}
                    {/*<div className="mt-3 border-t border-neutral-100 pt-3">*/}
                    {/*  <div className="flex items-center justify-between">*/}
                    {/*    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">*/}
                    {/*      Pre-study preview*/}
                    {/*    </span>*/}
                    {/*    <span className="text-[10px] text-neutral-400">*/}
                    {/*      点击进入可查看完整卡片*/}
                    {/*    </span>*/}
                    {/*  </div>*/}
                    {/*  /!*{heroVideo.tags && heroVideo.tags.length > 0 && (*!/*/}
                    {/*  /!*  <div className="mt-2 flex flex-wrap gap-2">*!/*/}
                    {/*  /!*    {heroVideo.tags.slice(0, 3).map((tag) => (*!/*/}
                    {/*  /!*      <span*!/*/}
                    {/*  /!*        key={tag}*!/*/}
                    {/*  /!*        className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] text-neutral-700"*!/*/}
                    {/*  /!*      >*!/*/}
                    {/*  /!*        {tag}*!/*/}
                    {/*  /!*      </span>*!/*/}
                    {/*  /!*    ))}*!/*/}
                    {/*  /!*  </div>*!/*/}
                    {/*  /!*)}*!/*/}
                    {/*  /!*{!heroVideo.tags?.length && heroVideo.description && (*!/*/}
                    {/*  /!*  <p className="mt-2 line-clamp-2 text-[12px] text-neutral-600">*!/*/}
                    {/*  /!*    {heroVideo.description}*!/*/}
                    {/*  /!*  </p>*!/*/}
                    {/*  /!*)}*!/*/}
                    {/*</div>*/}

                    {/* 底部：时长 / 热度 + 主播放按钮 */}
                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5">
                          <IconClock />
                          <span>{formatDuration(heroVideo.duration)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5">
                          <IconFlame />
                          <span>已学习 {heroVideo.view_count ?? 0} 次</span>
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FF2442] px-3 py-1 text-[11px] font-medium text-white">
                        <span>▶</span>
                        <span>开始精读</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="h-56 animate-pulse rounded-2xl bg-neutral-200" />
            )}
          </div>

          {/* 右侧：个人数据控制台 */}
          <aside className="space-y-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-400">
                    {greetingLabel}, {displayName}
                  </p>
                  <p className="mt-1 text-sm text-neutral-700">
                    Little steps, big dreams.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <StudyCalendar
                  year={new Date().getFullYear()}
                  month={new Date().getMonth() + 1}
                  studyDates={studyDates}
                />
              </div>

              <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-neutral-400">
                    <IconClock />
                    <span>总学习时长</span>
                  </div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {totalDurationHours.toFixed(1)} h
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-neutral-400">
                    <IconStack />
                    <span>库内素材</span>
                  </div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {videos.length} 部
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                系统将于本周五凌晨进行例行更新，届时可能短暂无法访问。
              </div>
            </div>
          </aside>
        </section>

        {/* 分隔线 */}
        <div className="my-8 h-px bg-neutral-200/70" />

        {/* 分类 Tabs + 筛选条 */}
        <section className="space-y-4">


          {/* 主题：从视频 tags 动态生成 */}
          {themeTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
              <span className="text-neutral-400">主题:</span>
              {themeTags.map((tag) => {
                const isActive = activeThemeTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full px-3 py-1 ${
                      isActive
                        ? 'bg-neutral-900 text-white'
                        : 'bg-white text-neutral-600 shadow-sm hover:bg-neutral-100'
                    }`}
                    onClick={() =>
                      setActiveThemeTag(isActive ? null : tag)
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}

          {/* 二级筛选栏 - 桌面端 */}
          <div className="hidden items-center gap-4 rounded-full bg-neutral-100/80 px-4 py-2 text-[11px] text-neutral-600 md:flex">
            {/* 难度筛选 */}
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">难度:</span>
              {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map(
                (level) => {
                  const labelMap: Record<DifficultyFilter, string> = {
                    all: '全部',
                    easy: '入门',
                    medium: '进阶',
                    hard: '大师'
                  };
                  const colorMap: Record<DifficultyFilter, string> = {
                    all: 'bg-white text-neutral-600',
                    easy: 'bg-emerald-50 text-emerald-600',
                    medium: 'bg-amber-50 text-amber-700',
                    hard: 'bg-rose-50 text-rose-600'
                  };
                  const isActive = difficultyFilter === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      className={`rounded-full px-3 py-1 ${
                        isActive
                          ? colorMap[level]
                          : 'bg-white text-neutral-500 hover:bg-neutral-50'
                      }`}
                      onClick={() => setDifficultyFilter(level)}
                    >
                      {labelMap[level]}
                    </button>
                  );
                }
              )}
            </div>

            {/* 作者筛选 */}
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">作者:</span>
              <select
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] text-neutral-700 focus:border-[#FF2442] focus:outline-none focus:ring-1 focus:ring-[#FF2442]/20"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
              >
                <option value="all">全部作者</option>
                {authorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* 排序 */}
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">排序:</span>
              <select
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] text-neutral-700 focus:border-[#FF2442] focus:outline-none focus:ring-1 focus:ring-[#FF2442]/20"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as SortOrder)
                }
              >
                <option value="hottest">最热</option>
                <option value="latest">最新</option>
              </select>
            </div>

            {/* 状态 */}
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">状态:</span>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  statusFilter === 'unlearned'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
                onClick={() =>
                  setStatusFilter(
                    statusFilter === 'unlearned' ? 'all' : 'unlearned'
                  )
                }
              >
                仅看未学
              </button>
            </div>
          </div>

          {/* 移动端：排序 + 筛选按钮 */}
          <div className="flex items-center justify-between text-xs text-neutral-600 md:hidden">
            <div className="flex items-center gap-2">
              <span>排序:</span>
              <select
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] text-neutral-700 focus:border-[#FF2442] focus:outline-none focus:ring-1 focus:ring-[#FF2442]/20"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as SortOrder)
                }
              >
                <option value="hottest">综合</option>
                <option value="latest">最新</option>
              </select>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white"
              onClick={() => setIsFilterSheetOpen(true)}
            >
              <IconFilter />
              <span>筛选</span>
            </button>
          </div>
        </section>

        {/* 视频卡片 Grid */}
        <section className="mt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
            {isLoading ? (
              <>
                <div className="h-48 animate-pulse rounded-xl bg-neutral-200" />
                <div className="h-48 animate-pulse rounded-xl bg-neutral-200" />
                <div className="h-48 animate-pulse rounded-xl bg-neutral-200" />
                <div className="h-48 animate-pulse rounded-xl bg-neutral-200" />
              </>
            ) : filteredVideos.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
                暂无视频数据，稍后再来看看～
              </div>
            ) : (
              filteredVideos.map((video) => (
                <Link
                  key={video.id}
                  href={`/watch/${video.cf_video_id}`}
                  className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    <Image
                      unoptimized
                      src={getCoverSrc(
                        video,
                        '/images/card-placeholder-640x360.png'
                      )}
                      alt={video.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    {completedSet.has(video.id) && (
                      <span className="absolute left-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[10px] font-medium text-white">
                        已完成
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <div className="space-y-1">
                      <h3 className="line-clamp-2 text-[15px] font-semibold text-neutral-900">
                        {video.title}
                      </h3>
                      {video.author && (
                        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-[11px] text-neutral-600">
                            {(video.author || '英')
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <span>{video.author}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <IconHeart />
                          <span>{video.view_count ?? 0}</span>
                        </span>
                        {video.difficulty && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5">
                            <span>难度</span>
                            <span>{renderDifficultyStars(video.difficulty)}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-400">
                        {formatDuration(video.duration)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>

      {/* 移动端筛选 Bottom Sheet */}
      {isFilterSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 md:hidden">
          <button
            type="button"
            className="flex-1"
            onClick={() => setIsFilterSheetOpen(false)}
          />
          <div className="mt-auto max-h-[70vh] w-full rounded-t-3xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">
                筛选条件
              </h2>
              <button
                type="button"
                className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-500"
                onClick={() => setIsFilterSheetOpen(false)}
              >
                关闭
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto text-xs text-neutral-700">
              {/* 难度 */}
              <div>
                <div className="mb-2 font-medium">难度 Difficulty</div>
                <div className="flex flex-wrap gap-2">
                  {(['easy', 'medium', 'hard'] as DifficultyFilter[]).map(
                    (level) => {
                      const labelMap: Record<DifficultyFilter, string> = {
                        all: '全部',
                        easy: '入门',
                        medium: '进阶',
                        hard: '大师'
                      };
                      const colorMap: Record<DifficultyFilter, string> = {
                        all: 'bg-white text-neutral-600',
                        easy: 'bg-emerald-50 text-emerald-600',
                        medium: 'bg-amber-50 text-amber-700',
                        hard: 'bg-rose-50 text-rose-600'
                      };
                      const isActive = difficultyFilter === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          className={`rounded-full px-3 py-1 text-xs ${
                            isActive
                              ? colorMap[level]
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                          onClick={() => setDifficultyFilter(level)}
                        >
                          {labelMap[level]}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* 作者 */}
              <div>
                <div className="mb-2 font-medium">作者 Creator</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 ${
                      authorFilter === 'all'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                    onClick={() => setAuthorFilter('all')}
                  >
                    全部
                  </button>
                  {authorOptions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`rounded-full px-3 py-1 ${
                        authorFilter === name
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                      onClick={() => setAuthorFilter(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 状态 */}
              <div>
                <div className="mb-2 font-medium">状态</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-full px-3 py-1 ${
                      statusFilter === 'unlearned'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                    onClick={() =>
                      setStatusFilter(
                        statusFilter === 'unlearned' ? 'all' : 'unlearned'
                      )
                    }
                  >
                    仅看未学
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-full px-3 py-1 ${
                      statusFilter === 'completed'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                    onClick={() =>
                      setStatusFilter(
                        statusFilter === 'completed'
                          ? 'all'
                          : 'completed'
                      )
                    }
                  >
                    仅看已完成
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  className="rounded-full border border-neutral-200 px-4 py-1.5 text-xs text-neutral-600"
                  onClick={() => {
                    setDifficultyFilter('all');
                    setAuthorFilter('all');
                    setStatusFilter('all');
                  }}
                >
                  重置
                </button>
                <button
                  type="button"
                  className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white"
                  onClick={() => setIsFilterSheetOpen(false)}
                >
                  确认显示 ({filteredVideos.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 移动端学习数据 Bottom Sheet */}
      {isStatsSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 md:hidden">
          <button
            type="button"
            className="flex-1"
            onClick={() => setIsStatsSheetOpen(false)}
          />
          <div className="mt-auto max-h-[80vh] w-full rounded-t-3xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">
                学习数据总览
              </h2>
              <button
                type="button"
                className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-500"
                onClick={() => setIsStatsSheetOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto text-xs">
              <div className="rounded-2xl bg-neutral-50 p-3">
                <StudyCalendar
                  year={new Date().getFullYear()}
                  month={new Date().getMonth() + 1}
                  studyDates={studyDates}
                />
              </div>
              <StatsCard
                totalVideos={videos.length}
                learnedVideos={learnedCount}
                notLearnedVideos={Math.max(videos.length - learnedCount, 0)}
              />
              <div className="rounded-2xl bg-neutral-50 p-3 text-neutral-600">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Snapshot
                </div>
                <div className="space-y-1">
                  <div>本月已打卡 {studyDates.length} 天</div>
                  <div>素材总时长约 {totalDurationHours.toFixed(1)} 小时</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
