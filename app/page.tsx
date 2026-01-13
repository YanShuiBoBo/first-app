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

function IconSearch() {
  return (
    <svg
      className="h-4 w-4 text-slate-400"
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
      className="h-3 w-3"
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

// 类目值：'all' 表示全部，其余直接使用数据库中的真实 tag 文本
type CategoryValue = 'all' | string;
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

  const [activeCategory, setActiveCategory] =
    useState<CategoryValue>('all');
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('hottest');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');
  const [activeThemeTag, setActiveThemeTag] = useState<string | null>(
    null
  );
  const [showAllAuthors, setShowAllAuthors] = useState(false);

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isStatsSheetOpen, setIsStatsSheetOpen] = useState(false);

  // PC 端筛选区：控制“更多筛选”抽屉的展开 / 收起
  const [isDesktopFilterExpanded, setIsDesktopFilterExpanded] =
    useState(false);

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
    const d = difficulty ?? 1;
    if (d === 1) return 'easy';
    if (d === 2) return 'medium';
    if (d === 3) return 'hard';
    return 'easy';
  };

  const getDifficultyStyle = (
    difficulty?: number | null,
    variant: 'banner' | 'card' = 'card'
  ) => {
    const level = getDifficultyLevel(difficulty);

    if (variant === 'banner') {
      if (level === 'easy') {
        return 'border border-emerald-300/40 bg-emerald-400/20 text-emerald-100';
      }
      if (level === 'medium') {
        return 'border border-amber-300/40 bg-amber-400/20 text-amber-100';
      }
      return 'border border-rose-300/40 bg-rose-400/20 text-rose-100';
    }

    // 卡片难度标签：更柔和的“马卡龙 + 毛玻璃”效果
    if (level === 'easy') {
      return 'bg-emerald-50/90 text-emerald-600 border border-emerald-100/70 backdrop-blur';
    }
    if (level === 'medium') {
      return 'bg-amber-50/90 text-amber-700 border border-amber-100/70 backdrop-blur';
    }
    return 'bg-rose-50/90 text-rose-700 border border-rose-100/70 backdrop-blur';
  };

  const completedSet = new Set(completedVideoIds);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchCategory = (video: VideoCard) => {
    if (activeCategory === 'all') return true;
    if (!video.tags || video.tags.length === 0) return false;
    // 类目直接使用真实 tag 文本，点击哪个 tag 就筛哪个
    return video.tags.includes(activeCategory);
  };

  // 作者选项：从当前视频列表中提取
  const authorOptions: string[] = Array.from(
    new Set(
      videos
        .map((v) => v.author)
        .filter((name): name is string => !!name && name.trim().length > 0)
    )
  );

  // 主题标签只用于卡片内部展示，不再在顶部堆叠成标签云，避免视觉噪音
  const themeTags: string[] = Array.from(
    new Set(
      videos
        .flatMap((v) => v.tags || [])
        .filter((tag): tag is string => !!tag && tag.trim().length > 0)
    )
  );

  // 取前若干个 tag 作为首页类目 Tabs 的候选，避免一次性展示过多标签
  const primaryTags: string[] = themeTags.slice(0, 8);

  // PC 端 Hero 使用的进度数据：素材库完成度 + 简化打卡热力图
  const totalVideosCount = videos.length;
  const progressPercent =
    totalVideosCount > 0
      ? Math.min(
          100,
          Math.round((learnedCount / Math.max(totalVideosCount, 1)) * 100)
        )
      : 0;

  // 月度打卡视图所需数据：当前年月 + 当月天数 + 当月打卡日集合
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-based
  const daysInMonth = new Date(currentMonth === 11 ? currentYear + 1 : currentYear, (currentMonth + 1) % 12, 0).getDate();

  const activeDayNumbers = new Set(
    studyDates
      .map((d) => {
        const dayStr = d.slice(8, 10);
        const n = parseInt(dayStr, 10);
        return Number.isNaN(n) ? null : n;
      })
      .filter((n): n is number => n !== null)
  );

  const calendarSlots: number[] = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1
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

  const renderDifficultyLabel = (difficulty?: number | null) => {
    const d = difficulty ?? 1;
    if (d === 1) return '入门';
    if (d === 2) return '进阶';
    if (d === 3) return '大师';
    return '入门';
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
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-900">
      {/* 桌面端导航栏 */}
      <div className="hidden md:block">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

          {/* 移动端顶部导航 + 搜索 + 分类 Tabs（使用数据库真实标签） */}
      <header className="sticky top-0 z-40 border-b border-slate-100/60 bg-white/95 backdrop-blur-md md:hidden">
        <div className="space-y-2 px-4 pb-3 pt-3">
          {/* Row 1: Logo + Search + Bell */}
          <div className="mb-1 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF2442] text-xs font-semibold text-white">
              IE
            </div>
            <div className="flex-1">
              <div className="relative flex h-10 items-center rounded-full bg-slate-100 px-3">
                <div className="mr-2 text-slate-400">
                  <IconSearch />
                </div>
                <input
                  type="text"
                  placeholder="Search vlogs..."
                  className="h-full w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            {/* 通知铃铛 */}
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center"
              aria-label="查看通知"
            >
              <svg
                className="h-6 w-6 text-slate-800"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4a4 4 0 0 0-4 4v2.8c0 .5-.2 1-.6 1.3L6 14h12l-1.4-1.9a2 2 0 0 1-.6-1.3V8a4 4 0 0 0-4-4Z" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-[#FF2442]" />
            </button>
          </div>

          {/* Row 2: 横向滚动 Tabs（All + 前几个真实标签）+ 固定在右侧的筛选图标 */}
          <div className="-mx-4 mt-4 px-4 pb-1">
            <div className="relative flex items-center text-xs">
              {/* 可横向滚动的标签区域 */}
              <div className="no-scrollbar mr-2 flex-1 overflow-x-auto pr-10">
                <div className="flex items-center gap-2">
                  {(
                    [
                      { value: 'all' as CategoryValue, label: '全部' },
                      ...(
                        primaryTags.length > 0
                          ? primaryTags
                          : ['Vlog', 'Business', 'Travel', 'Movie']
                      ).map((tag) => ({
                        value: tag as CategoryValue,
                        label: tag
                      }))
                    ] satisfies { value: CategoryValue; label: string }[]
                  ).map((tab) => {
                    const isActive = activeCategory === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        className={`whitespace-nowrap rounded-full px-4 py-1.5 ${
                          isActive
                            ? 'bg-gray-900 text-white font-medium'
                            : 'bg-gray-100 text-gray-600 font-medium'
                        }`}
                        onClick={() => setActiveCategory(tab.value)}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 筛选按钮：始终固定在右侧，不随标签滚动 */}
              <button
                type="button"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                onClick={() => setIsFilterSheetOpen(true)}
                aria-label="筛选"
              >
                <IconFilter />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-4 md:pb-12 md:pt-24">
        {/* 顶部标题区域 */}
        {/*<section className="space-y-3">*/}
        {/*  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">*/}
        {/*    Immersive · English*/}
        {/*  </p>*/}
        {/*  <h1 className="font-serif text-2xl font-semibold leading-tight text-neutral-900 md:text-3xl">*/}
        {/*    精读学习大厅*/}
        {/*  </h1>*/}
        {/*  <p className="max-w-xl text-sm text-neutral-600">*/}
        {/*    像一本铺在书桌上的精美杂志，精选短视频 + 双语脚本 + 知识卡片，帮你轻松沉浸学英语。*/}
        {/*  </p>*/}
        {/*</section>*/}

        {/* Hero + 右侧控制台 */}
        <section className="mt-4 md:mt-6">
          {heroVideo ? (
            <>
              {/* 桌面端：不对称双拼卡片（左侧进度仪表盘 + 右侧今日练习） */}
              <div className="hidden grid-cols-12 gap-6 md:grid">
                {/* 左侧：进度可视化卡片 */}
                <div className="col-span-4 flex h-[320px] flex-col justify-between rounded-3xl border border-stone-100 bg-white p-6 text-[11px] text-neutral-700 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                          My progress
                        </p>
                        <p className="mt-2 text-sm font-semibold text-neutral-900">
                          {greetingLabel}, {displayName}
                        </p>
                      </div>
                      <div className="flex flex-col items-end text-[10px] text-neutral-500">
                        <span>本月已打卡</span>
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-800">
                            <IconFlame />
                            <span>{studyDates.length} 天</span>
                          </span>
                        </div>
                      </div>

                    {/* 月度打卡热力图：7 列 x N 行的小圆点矩阵 */}
                    <div className="mt-4">
                      <div className="mb-1 text-[11px] text-neutral-500">
                        {currentYear} 年 {currentMonth + 1} 月
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {calendarSlots.map((day) => {
                          const isActive = activeDayNumbers.has(day);
                          return (
                            <div
                              key={day}
                              className={`h-3 w-3 rounded-full ${
                                isActive
                                  ? 'bg-[#FF2442] shadow-[0_0_8px_rgba(255,36,66,0.6)]'
                                  : 'bg-stone-200'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[11px] text-neutral-500">
                        {studyDates.length >= 3
                          ? '状态在线，别让打卡断掉～'
                          : '从今天开始打卡一小集，也是一种进步。'}
                      </p>
                    </div>
                  </div>

                  {/* 素材库进度条：已学 / 总库 */}
                  <div className="mt-6 border-t border-neutral-100 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-neutral-600">
                        素材库进度
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        {progressPercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-stone-100">
                      <div
                        className="h-2 rounded-full bg-neutral-900"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      已学 {learnedCount} / {totalVideosCount} 期
                    </p>
                  </div>
                </div>

                {/* 右侧：今日练习 / 继续精读大卡片 */}
                <Link
                  href={`/watch/${heroVideo.cf_video_id}`}
                  className="col-span-8 group relative flex h-[320px] overflow-hidden rounded-3xl bg-neutral-900 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]"
                >
                  <div className="absolute inset-0">
                    <Image
                      unoptimized
                      src={getCoverSrc(
                        heroVideo,
                        '/images/hero-placeholder-960x540.png'
                      )}
                      alt={heroVideo.title}
                      fill
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  </div>

                  <div className="relative z-10 flex h-full w-full flex-col justify-end p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-white/90">
                      {heroVideo.tags && heroVideo.tags.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
                          #{heroVideo.tags[0]}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-white/80">
                        <IconClock />
                        <span>{formatDuration(heroVideo.duration)}</span>
                      </span>
                      {heroVideo.difficulty && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-white/80">
                          <span>{renderDifficultyLabel(heroVideo.difficulty)}</span>
                        </span>
                      )}
                    </div>

                    <h2 className="line-clamp-2 font-serif text-3xl font-semibold leading-snug text-white">
                      {heroVideo.title}
                    </h2>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/80">
                      {heroVideo.author && (
                        <span className="inline-flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-medium">
                            {heroVideo.author.charAt(0).toUpperCase()}
                          </span>
                          <span>{heroVideo.author}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <IconFlame />
                        <span>已学习 {heroVideo.view_count ?? 0} 次</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-2 self-start rounded-full bg-white px-8 py-3 text-sm font-semibold text-neutral-900 shadow-sm transition-transform duration-200 hover:scale-105 hover:bg-neutral-100"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span>继续精读</span>
                    </button>
                  </div>
                </Link>
              </div>

              {/* 移动端：单张 Hero 卡片（保持原有 Creamy 风格） */}
              <Link
                href={`/watch/${heroVideo.cf_video_id}`}
                className="relative block overflow-hidden rounded-2xl bg-neutral-900 shadow-sm md:hidden"
              >
                <div className="relative aspect-[16/9] w-full">
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-medium text-white">
                    今日精选
                  </span>
                  <h2 className="mt-2 line-clamp-2 font-serif text-lg font-semibold leading-snug text-white">
                    {heroVideo.title}
                  </h2>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-white/80">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                      <IconClock />
                      <span>{formatDuration(heroVideo.duration)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                      <IconFlame />
                      <span>{heroVideo.view_count ?? 0}</span>
                    </span>
                  </div>
                </div>
              </Link>
            </>
          ) : (
            <div className="h-56 animate-pulse rounded-2xl bg-neutral-200" />
          )}
        </section>

        {/* 分隔线 */}
        <div className="my-8 h-px bg-neutral-200/70" />

        {/* 分类 Tabs + 筛选条 */}
        <section className="space-y-4">
          {/* 桌面端：胶囊流 + 智能折叠筛选抽屉（仅在 md+ 显示） */}
          <div className="hidden md:block">
            <div className="rounded-2xl bg-white/95 px-5 py-4 text-[11px] text-neutral-600 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] md:border md:border-neutral-100 md:backdrop-blur md:sticky md:top-20 md:z-30">
              {/* Row 1：一级类目胶囊 + 右侧“更多筛选”按钮 */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: 'all' as CategoryValue, label: '全部' },
                      ...(
                        primaryTags.length > 0
                          ? primaryTags
                          : ['Vlog', '职场', '旅游', '电影']
                      ).map((tag) => ({
                        value: tag as CategoryValue,
                        label: tag
                      }))
                    ] satisfies { value: CategoryValue; label: string }[]
                  ).map((tab, index) => {
                    const isActive = activeCategory === tab.value;
                    const isFirst = index === 0;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        className={`whitespace-nowrap rounded-full px-4 py-1.5 font-medium ${
                          isActive
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-200'
                            : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                        } ${isFirst ? 'text-[11px]' : 'text-[11px]'}`}
                        onClick={() => setActiveCategory(tab.value)}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* 右侧：更多筛选／收起筛选 */}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-stone-50 px-3 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-100"
                  onClick={() =>
                    setIsDesktopFilterExpanded((prev) => !prev)
                  }
                >
                  <IconFilter />
                  <span>{isDesktopFilterExpanded ? '收起筛选' : '更多筛选'}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3 w-3 transition-transform ${
                      isDesktopFilterExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>

              {/* Row 2：展开筛选抽屉（按主题 / 难度 / 状态 + 排序） */}
              <div
                className={`overflow-hidden text-[11px] text-neutral-700 transition-all duration-300 ease-in-out ${
                  isDesktopFilterExpanded
                    ? 'mt-3 max-h-[260px] border-t border-neutral-100/70 pt-3 opacity-100'
                    : 'max-h-0 opacity-0 pointer-events-none'
                }`}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {/* 按主题：使用数据库真实标签 */}
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-neutral-500">
                      按主题
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(themeTags.length > 0
                        ? themeTags.slice(0, 14)
                        : ['电影精读', '留学生活', 'TED 演讲', '职场沟通', '旅行 Vlog']
                      ).map((tag) => {
                        const isActive = activeCategory === tag;
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`rounded-full px-3 py-1 ${
                              isActive
                                ? 'bg-rose-500 text-white shadow-md shadow-rose-200'
                                : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                            }`}
                            onClick={() =>
                              setActiveCategory(tag as CategoryValue)
                            }
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 按难度 */}
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-neutral-500">
                      按难度
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { value: 'all', label: '全部', icon: '•' },
                          { value: 'easy', label: '入门', icon: '🌱' },
                          { value: 'medium', label: '进阶', icon: '🚀' },
                          { value: 'hard', label: '大师', icon: '👑' }
                        ] as { value: DifficultyFilter; label: string; icon: string }[]
                      ).map((opt) => {
                        const isActive = difficultyFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${
                              isActive
                                ? 'bg-[#FFEDF0] text-[#BE185D] border border-[#FF2442]'
                                : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                            }`}
                            onClick={() =>
                              setDifficultyFilter(opt.value)
                            }
                          >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 按状态 + 排序 */}
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-neutral-500">
                        按状态
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* 仅看未学 */}
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 ${
                            statusFilter === 'unlearned'
                              ? 'bg-[#FFEDF0] text-[#BE185D] border border-[#FF2442]'
                              : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                          }`}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === 'unlearned'
                                ? 'all'
                                : 'unlearned'
                            )
                          }
                        >
                          仅看未学
                        </button>
                        {/* 仅看已学完 */}
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 ${
                            statusFilter === 'completed'
                              ? 'bg-[#FFEDF0] text-[#BE185D] border border-[#FF2442]'
                              : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                          }`}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === 'completed'
                                ? 'all'
                                : 'completed'
                            )
                          }
                        >
                          仅看已学完
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-medium text-neutral-500">
                        排序
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 ${
                            sortOrder === 'hottest'
                              ? 'bg-stone-900 text-white shadow-md shadow-black/20'
                              : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                          }`}
                          onClick={() => setSortOrder('hottest')}
                        >
                          最热
                        </button>
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 ${
                            sortOrder === 'latest'
                              ? 'bg-stone-900 text-white shadow-md shadow-black/20'
                              : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                          }`}
                          onClick={() => setSortOrder('latest')}
                        >
                          最新
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 移动端：排序 + 筛选按钮（已整合到顶部 Header 胶囊栏，仅保留 Bottom Sheet 逻辑） */}
        </section>

        {/* 视频卡片：移动端瀑布流 + PC Grid */}
        <section className="mt-4">
          <div className="columns-2 gap-4 space-y-4 md:grid md:grid-cols-4 md:gap-6 md:space-y-0 xl:grid-cols-5">
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
                  className="group mb-4 flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md [break-inside:avoid]"
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
                    {/* 左上角难度 Badge */}
                    {video.difficulty && (
                      <span
                        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${getDifficultyStyle(
                          video.difficulty,
                          'card'
                        )}`}
                      >
                        {renderDifficultyLabel(video.difficulty)}
                      </span>
                    )}
                    {/* 右上角已学习角标 */}
                    {completedSet.has(video.id) && (
                      <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                        已学完
                      </span>
                    )}
                    {/* 右下角时长 Badge */}
                    <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {formatDuration(video.duration)}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <div className="space-y-1.5">
                      <h3 className="line-clamp-2 text-sm font-bold leading-tight text-slate-800">
                        {video.title}
                      </h3>
                      {video.tags && video.tags.length > 0 && (
                        <span className="inline-flex max-w-full items-center rounded-md bg-[var(--color-brand-pink-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-brand-pink-text)]">
                          #{video.tags[0]}
                        </span>
                      )}
                      {video.author && (
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-600">
                              {(video.author || '英')
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <span>{video.author}</span>
                          </div>
                          {/* 右侧观看数 */}
                          <div className="flex items-center gap-1.5">
                            <IconHeart />
                            <span>{video.view_count ?? 0}</span>
                          </div>
                        </div>
                      )}
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
        <div className="fixed inset-0 z-50 flex flex-col md:hidden">
          {/* 遮罩层：黑色透明 + 背景模糊 */}
          <button
            type="button"
            className="absolute inset-0 bg-black/20 backdrop-blur-[4px]"
            onClick={() => setIsFilterSheetOpen(false)}
            aria-label="关闭筛选"
          />

          {/* 抽屉面板 */}
          <div className="relative mt-auto max-h-[70vh] w-full rounded-t-3xl bg-white px-4 pt-4 pb-20 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">
                筛选
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
              {/* 难度：3 列 Grid + 图标 */}
              <div>
                <div className="mb-2 font-medium">按难度</div>
                <div className="grid grid-cols-3 gap-3">
                  {(['easy', 'medium', 'hard'] as DifficultyFilter[]).map(
                    (level) => {
                      const labelMap: Record<DifficultyFilter, string> = {
                        all: '全部',
                        easy: '入门',
                        medium: '进阶',
                        hard: '大师'
                      };
                      const isActive = difficultyFilter === level;
                      const baseClasses =
                        'flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-[11px] transition-colors';
                      const activeClasses =
                        'border-[#FF2442] bg-[#FFEDF0] text-[#BE185D]';
                      const inactiveClasses =
                        'border-neutral-200 bg-neutral-50 text-neutral-600';

                      return (
                        <button
                          key={level}
                          type="button"
                          className={`${baseClasses} ${
                            isActive ? activeClasses : inactiveClasses
                          }`}
                          onClick={() => setDifficultyFilter(level)}
                        >
                          {/* 图标 */}
                          {level === 'easy' && (
                            <svg
                              className={`mb-1 h-5 w-5 ${
                                isActive
                                  ? 'stroke-[#FF2442]'
                                  : 'stroke-gray-400'
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 20c4-6 8-10 16-16" />
                              <path d="M9 19c1-2 2.5-4 4-5.5" />
                            </svg>
                          )}
                          {level === 'medium' && (
                            <svg
                              className={`mb-1 h-5 w-5 ${
                                isActive
                                  ? 'stroke-[#FF2442]'
                                  : 'stroke-gray-400'
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="4" y="14" width="16" height="5" rx="1" />
                              <rect x="6" y="9" width="12" height="4" rx="1" />
                              <rect x="8" y="4" width="8" height="3" rx="1" />
                            </svg>
                          )}
                          {level === 'hard' && (
                            <svg
                              className={`mb-1 h-5 w-5 ${
                                isActive
                                  ? 'stroke-[#FF2442]'
                                  : 'stroke-gray-400'
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
                            </svg>
                          )}
                          <span>{labelMap[level]}</span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* 作者：前 4-6 个 + 展开更多 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">按作者</span>
                  {authorOptions.length > 6 && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] text-[#FF2442]"
                      onClick={() => setShowAllAuthors((v) => !v)}
                    >
                      <span>
                        {showAllAuthors ? '收起全部' : '展开全部'}
                      </span>
                      <svg
                        className={`h-3 w-3 transform transition-transform ${
                          showAllAuthors ? 'rotate-180' : ''
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`flex items-center gap-2 rounded-full px-3 py-1 ${
                      authorFilter === 'all'
                        ? 'bg-[#FFEDF0] text-[#BE185D] border border-[#FF2442]'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                    onClick={() => setAuthorFilter('all')}
                  >
                    <span className="h-5 w-5 rounded-full bg-neutral-200" />
                    <span>全部</span>
                  </button>
                  {(showAllAuthors
                    ? authorOptions
                    : authorOptions.slice(0, 6)
                  ).map((name) => {
                    const isActive = authorFilter === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`flex items-center gap-2 rounded-full px-3 py-1 ${
                          isActive
                            ? 'bg-[#FFEDF0] text-[#BE185D] border border-[#FF2442]'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                        onClick={() => setAuthorFilter(name)}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] ${
                            isActive ? 'ring-2 ring-[#FF2442]' : ''
                          }`}
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 状态：Switch */}
              <div>
                <div className="mb-2 font-medium">按状态</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-600">
                    仅看未学
                  </span>
                  <button
                    type="button"
                    className={`flex h-5 w-10 items-center rounded-full px-0.5 transition-colors ${
                      statusFilter === 'unlearned'
                        ? 'bg-[#FF2442]'
                        : 'bg-gray-200'
                    }`}
                    onClick={() =>
                      setStatusFilter(
                        statusFilter === 'unlearned' ? 'all' : 'unlearned'
                      )
                    }
                    aria-label="切换仅看未学"
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        statusFilter === 'unlearned'
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 底部固定按钮 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-white/95 p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="pointer-events-auto rounded-full border border-neutral-200 px-4 py-1.5 text-xs text-neutral-600"
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
                  className="pointer-events-auto flex-1 rounded-full bg-[#FF2442] py-2.5 text-center text-xs font-medium text-white shadow-[0_0_20px_rgba(255,36,66,0.5)] active:scale-95"
                  onClick={() => setIsFilterSheetOpen(false)}
                >
                  确认显示 ({filteredVideos.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 移动端底部导航栏：iOS 风格毛玻璃悬浮条；当筛选/统计弹窗打开时隐藏 */}
      {/*{!isFilterSheetOpen && !isStatsSheetOpen && (*/}
      {/*  <nav className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 md:hidden">*/}
      {/*    <div className="flex h-[52px] w-[230px] items-center justify-between rounded-full border border-white/20 bg-white/80 px-3 text-[11px] text-slate-500 shadow-lg backdrop-blur-md">*/}
      {/*      /!* 首页 *!/*/}
      {/*      <button*/}
      {/*        type="button"*/}
      {/*        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[#FF2442]"*/}
      {/*        aria-label="回到首页"*/}
      {/*      >*/}
      {/*        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF2442]/5 text-[#FF2442]">*/}
      {/*          <svg*/}
      {/*            viewBox="0 0 24 24"*/}
      {/*            className="h-5 w-5"*/}
      {/*            fill="none"*/}
      {/*            stroke="currentColor"*/}
      {/*            strokeWidth={1.7}*/}
      {/*            strokeLinecap="round"*/}
      {/*            strokeLinejoin="round"*/}
      {/*          >*/}
      {/*            <path d="M3 11.5 12 4l9 7.5" />*/}
      {/*            <path d="M5 10.5v9h5v-5h4v5h5v-9" />*/}
      {/*          </svg>*/}
      {/*        </div>*/}
      {/*        <span className="text-[10px] font-semibold tracking-wide">*/}
      {/*          首页*/}
      {/*        </span>*/}
      {/*      </button>*/}

      {/*      /!* 分割线 *!/*/}
      {/*      <div className="h-8 w-px bg-slate-200/80" />*/}

      {/*      /!* 生词本 *!/*/}
      {/*      <button*/}
      {/*        type="button"*/}
      {/*        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-slate-500"*/}
      {/*        aria-label="打开生词本（即将上线）"*/}
      {/*      >*/}
      {/*        <div className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500">*/}
      {/*          <svg*/}
      {/*            viewBox="0 0 24 24"*/}
      {/*            className="h-5 w-5"*/}
      {/*            fill="none"*/}
      {/*            stroke="currentColor"*/}
      {/*            strokeWidth={1.7}*/}
      {/*            strokeLinecap="round"*/}
      {/*            strokeLinejoin="round"*/}
      {/*          >*/}
      {/*            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />*/}
      {/*            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />*/}
      {/*          </svg>*/}
      {/*        </div>*/}
      {/*        <span className="text-[10px] font-medium">笔记本</span>*/}
      {/*      </button>*/}
      {/*    </div>*/}
      {/*  </nav>*/}
      {/*)}*/}

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
                  <div>已学期数 {learnedCount} 期</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
