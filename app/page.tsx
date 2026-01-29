'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 三段滑杆式滤镜图标，比简单横线更有“设置感” */}
      <path d="M5 7h14" />
      <circle cx="10" cy="7" r="1.6" />
      <path d="M5 12h14" />
      <circle cx="14" cy="12" r="1.6" />
      <path d="M5 17h14" />
      <circle cx="11" cy="17" r="1.6" />
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
type StatusFilter = 'all' | 'unlearned' | 'completed' | 'favorited';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [completedVideoIds, setCompletedVideoIds] = useState<string[]>([]);
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<string[]>([]);

  const [activeCategory, setActiveCategory] =
    useState<CategoryValue>('all');
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('hottest');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');
  const [activeThemeTag] = useState<string | null>(null);
  const [showAllAuthors, setShowAllAuthors] = useState(false);

  // 首页通知是否有“未读”提示（当前简单按本次会话是否打开过通知面板来判断）
  const [hasUnreadNotifications, setHasUnreadNotifications] =
    useState(true);

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isStatsSheetOpen, setIsStatsSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] =
    useState(false);
  const [notificationMode, setNotificationMode] = useState<
    'notices' | 'feedback'
  >('notices');

  // PC 端筛选区：控制“更多筛选”抽屉的展开 / 收起
  const [isDesktopFilterExpanded, setIsDesktopFilterExpanded] =
    useState(false);

  // Supabase 客户端只在浏览器端初始化（用于学习统计等交互，不再直接用于首页列表查询）
  const [supabase, setSupabase] =
    useState<ReturnType<typeof createBrowserClient> | null>(null);

  // 登录状态
  const { initialize, user } = useAuthStore();
  const router = useRouter();

  // 学习统计是否已加载（避免重复请求）
  const [hasLoadedStats, setHasLoadedStats] = useState(false);

  // 复制微信号后的提示文案（用于移动端反馈面板）
  const [wechatCopyHint, setWeChatCopyHint] = useState('');

  // 首次欢迎引导：仅对已登录用户展示一次，状态存入 app_users.onboarding_flags（服务端接口写入，避免 RLS 干扰）
  const [hasLoadedOnboardingFlags, setHasLoadedOnboardingFlags] =
    useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const onboardingEmailRef = useRef<string | null>(null);

  // 当任意首页面板（筛选 / 学习数据 / 通知）打开时，锁定页面滚动，避免误滚动到素材列表
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const body = document.body;
    const previousOverflow = body.style.overflow;

    if (isFilterSheetOpen || isStatsSheetOpen || isNotificationSheetOpen) {
      body.style.overflow = 'hidden';
    }

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [isFilterSheetOpen, isStatsSheetOpen, isNotificationSheetOpen]);

  // 首次在浏览器端挂载时初始化 Supabase 客户端
  useEffect(() => {
    const client = createBrowserClient();
    setSupabase(client);
  }, []);

  // 切换账号时重置 onboarding 加载状态（避免 A 用户的缓存影响 B 用户）
  useEffect(() => {
    const nextEmail = user?.email || null;
    if (onboardingEmailRef.current !== nextEmail) {
      onboardingEmailRef.current = nextEmail;
      setHasLoadedOnboardingFlags(false);
      setShowWelcomeModal(false);
    }
  }, [user?.email]);

  // 加载用户引导状态（onboarding_flags），决定是否展示首次欢迎弹窗
  useEffect(() => {
    const loadOnboardingFlags = async () => {
      if (!user?.email || hasLoadedOnboardingFlags) return;

      try {
        // localStorage 兜底：避免接口异常导致同一次会话反复弹窗（真正的“永久只弹一次”仍以数据库为准）
        const localKey = `immersive:onboarding:first_welcome_shown:${user.email}`;
        if (
          typeof window !== 'undefined' &&
          window.localStorage.getItem(localKey) === '1'
        ) {
          setHasLoadedOnboardingFlags(true);
          return;
        }

        const res = await fetch('/api/onboarding/flags', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!res.ok) {
          console.error('加载用户引导状态失败:', await res.text());
          setHasLoadedOnboardingFlags(true);
          return;
        }

        const payload = (await res.json()) as {
          flags?: Record<string, unknown>;
        };
        const flags = payload.flags || {};
        const firstWelcomeShown = flags.first_welcome_shown === true;

        if (!firstWelcomeShown) {
          const localKey = `immersive:onboarding:first_welcome_shown:${user.email}`;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(localKey, '1');
          }
          // 只要弹出过一次就算“已引导”，避免用户刷新/跳转导致反复弹窗
          void fetch('/api/onboarding/welcome-seen', { method: 'POST' });
          setShowWelcomeModal(true);
        }

        setHasLoadedOnboardingFlags(true);
      } catch (err) {
        console.error('加载用户引导状态异常:', err);
        setHasLoadedOnboardingFlags(true);
      }
    };

    void loadOnboardingFlags();
  }, [user?.email, hasLoadedOnboardingFlags]);

  // 获取视频数据
  const fetchVideos = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/home/videos');
      if (!res.ok) {
        throw new Error(`加载视频列表失败: ${res.status}`);
      }
      const payload = (await res.json()) as { videos?: VideoCard[] };
      setVideos(payload.videos || []);
    } catch (err) {
      console.error('获取视频数据失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    if (hasLoadedStats) return;
    if (!user?.email || videos.length === 0) return;

    let canceled = false;

	    const run = () => {
	      if (canceled) return;
	      void fetchStudyStats(user.email as string)
	        .then(() => {
	          if (!canceled) {
	            setHasLoadedStats(true);
	          }
	        })
	        .catch(() => {
	          // 统计失败不影响首页核心体验，下次进入页面可重试
	        });
	    };

	    if (typeof window !== 'undefined') {
	      const win = window as Window & {
	        requestIdleCallback?: (cb: () => void) => number;
	        cancelIdleCallback?: (id: number) => void;
	      };
	      if (typeof win.requestIdleCallback === 'function') {
	        const id = win.requestIdleCallback(run);
	        return () => {
	          canceled = true;
	          if (typeof win.cancelIdleCallback === 'function') {
	            win.cancelIdleCallback(id);
	          }
	        };
	      }
	    }

    const timeoutId = setTimeout(run, 300);
    return () => {
      canceled = true;
      clearTimeout(timeoutId);
    };
  }, [user?.email, videos.length, fetchStudyStats, hasLoadedStats]);

  // 加载当前用户收藏的视频列表（用于首页「仅看已收藏」筛选）
  useEffect(() => {
    const loadFavorites = async () => {
      if (!supabase || !user?.email) {
        setFavoriteVideoIds([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_video_favorites')
          .select('video_id')
          .eq('user_email', user.email as string);
        if (error) {
          console.error('获取收藏视频列表失败:', error);
          return;
        }
        setFavoriteVideoIds(
          (data || []).map((row: { video_id: string }) => row.video_id)
        );
      } catch (err) {
        console.error('加载收藏视频列表异常:', err);
      }
    };

    void loadFavorites();
  }, [supabase, user?.email]);

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
  const todayDayNumber = today.getDate();
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

  const formatLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const studyDateSet = useMemo(() => new Set(studyDates), [studyDates]);
  const todayKey = formatLocalDateKey(new Date());
  const hasStudyToday = studyDateSet.has(todayKey);

  // 连续打卡：若今天未打卡，则从昨天开始计算“最近连续 X 天”，避免用户被 0 直接劝退
  const currentStreak = useMemo(() => {
    if (studyDates.length === 0) return 0;

    const anchorOffset = hasStudyToday ? 0 : 1;
    let streak = 0;
    for (let offset = anchorOffset; offset < 366; offset += 1) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      if (studyDateSet.has(formatLocalDateKey(d))) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }, [studyDates.length, hasStudyToday, studyDateSet]);

  // 将 welcome 弹窗标记为已读：关闭弹窗并写入 app_users.onboarding_flags
  const markWelcomeSeen = useCallback(async () => {
    setShowWelcomeModal(false);

    if (!user?.email) {
      return;
    }

    try {
      const localKey = `immersive:onboarding:first_welcome_shown:${user.email}`;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(localKey, '1');
      }

      const res = await fetch('/api/onboarding/welcome-seen', {
        method: 'POST',
      });

      if (!res.ok) {
        console.error('更新用户引导状态失败:', await res.text());
      }
    } catch (err) {
      console.error('更新用户引导状态异常:', err);
    }
  }, [user?.email]);

  // 全局“第几期”编号：按 created_at 降序返回的视频列表，最新为第 N 期，最早为第 1 期
  const episodeNoById = useMemo(() => {
    const map = new Map<string, number>();
    const total = videos.length;
    videos.forEach((video, index) => {
      map.set(video.id, total - index);
    });
    return map;
  }, [videos]);

  // 列表懒加载：先渲染前 N 条，减少初次渲染压力
  const INITIAL_VISIBLE_COUNT = 20;
  const [visibleCount, setVisibleCount] =
    useState<number>(INITIAL_VISIBLE_COUNT);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 过滤视频：先按条件筛选，再根据排序方式决定是否按热度重新排序
  const favoriteSet = useMemo(
    () => new Set(favoriteVideoIds),
    [favoriteVideoIds]
  );

  const filteredVideosBase = videos
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
      if (statusFilter === 'favorited') {
        // 未登录时，收藏筛选视为没有命中任何视频
        if (!user?.email) return false;
        return favoriteSet.has(video.id);
      }
      return true;
    });

  const filteredVideos =
    sortOrder === 'hottest'
      ? [...filteredVideosBase].sort((a, b) => {
          const av = a.view_count ?? 0;
          const bv = b.view_count ?? 0;
          return bv - av;
        })
      : filteredVideosBase;

  const visibleVideos = filteredVideos.slice(0, visibleCount);

  // 当筛选条件变化时重置可见数量，避免旧的滚动状态影响新结果
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [
    searchQuery,
    activeCategory,
    difficultyFilter,
    authorFilter,
    sortOrder,
    statusFilter,
    activeThemeTag
  ]);

  // 监听底部 sentinel，滚动到接近底部时自动增加可见数量
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = loadMoreRef.current;
    if (!target) return;
    if (visibleCount >= filteredVideos.length) return;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCount(prev =>
          Math.min(prev + INITIAL_VISIBLE_COUNT, filteredVideos.length)
        );
      },
      {
        root: null,
        // 提前一些触发，避免用户看到明显的“空白等待”
        rootMargin: '0px 0px 400px 0px',
        threshold: 0.1
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [visibleCount, filteredVideos.length]);

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

  // 首页推荐视频：直接使用最新发布的一条（接口已按 created_at 降序返回）
  const heroVideo = videos.length > 0 ? videos[0] : null;

  // 欢迎弹窗中点击“查看详细指南”：标记已读并跳转到完整版指南页
  const openGuideFromWelcome = useCallback(() => {
    void markWelcomeSeen();
    router.push('/guide');
  }, [markWelcomeSeen, router]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-900">
      {/* 桌面端导航栏 */}
      <div className="hidden md:block">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNotificationClick={() => {
            setNotificationMode('notices');
            setIsNotificationSheetOpen(true);
          }}
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
            {/* 通知铃铛：打开官方通知 / 反馈中心 */}
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center"
              aria-label="查看通知"
              onClick={() => {
                setNotificationMode('notices');
                setIsNotificationSheetOpen(true);
                setHasUnreadNotifications(false);
              }}
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
              {hasUnreadNotifications && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-[#FF2442]" />
              )}
            </button>
          </div>

          {/* Row 2: 横向滚动 Tabs（All + 前几个真实标签）+ 固定在右侧的筛选图标 */}
          <div className="-mx-4 mt-4 px-4 pb-1">
            <div className="relative flex items-center text-[12px]">
              {/* 可横向滚动的标签区域 */}
              <div className="no-scrollbar mr-2 flex-1 overflow-x-auto pr-10">
                <div className="flex items-center gap-2">
                  {(
                    [
                      { value: 'all' as CategoryValue, label: '全部' },
                      ...(
                        primaryTags.length > 0
                          ? primaryTags
                          : []
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
                        className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[12px] font-medium ${
                          isActive
                            ? 'border-transparent bg-neutral-900 text-white shadow-md shadow-black/20'
                            : 'border-neutral-200 bg-white/90 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
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
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/60 bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_8px_22px_rgba(255,36,66,0.22)]"
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
                      priority
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
                      {episodeNoById.get(heroVideo.id)
                        ? `第${episodeNoById.get(heroVideo.id)}期：${heroVideo.title}`
                        : heroVideo.title}
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
                    priority
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
                    {episodeNoById.get(heroVideo.id)
                      ? `第${episodeNoById.get(heroVideo.id)}期：${heroVideo.title}`
                      : heroVideo.title}
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
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                              isActive
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.04)]'
                                : 'border-transparent bg-stone-50 text-stone-600 hover:bg-stone-100'
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
                          className={`rounded-full border px-3 py-1 ${
                            statusFilter === 'unlearned'
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.04)]'
                              : 'border-transparent bg-stone-50 text-stone-600 hover:bg-stone-100'
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
                          className={`rounded-full border px-3 py-1 ${
                            statusFilter === 'completed'
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.04)]'
                              : 'border-transparent bg-stone-50 text-stone-600 hover:bg-stone-100'
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
                        {/* 仅看已收藏（登录后可用） */}
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 ${
                            statusFilter === 'favorited' && user?.email
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.04)]'
                              : user?.email
                              ? 'border-transparent bg-stone-50 text-stone-600 hover:bg-stone-100'
                              : 'border-transparent bg-stone-50 text-stone-300 cursor-not-allowed'
                          }`}
                          onClick={() =>
                            user?.email
                              ? setStatusFilter(
                                  statusFilter === 'favorited'
                                    ? 'all'
                                    : 'favorited'
                                )
                              : typeof window !== 'undefined'
                              ? window.alert('请登录后使用收藏筛选')
                              : undefined
                          }
                        >
                          仅看已收藏
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

        {/* 视频卡片：移动端保持两列，但把信息“分层”：海报负责吸引，文字放到白底信息区，避免叠在图上造成拥挤 */}
        <section className="mt-4">
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-6 xl:grid-cols-5">
            {isLoading ? (
              <>
                <div className="h-52 animate-pulse rounded-3xl bg-neutral-200" />
                <div className="h-52 animate-pulse rounded-3xl bg-neutral-200" />
                <div className="h-52 animate-pulse rounded-3xl bg-neutral-200" />
                <div className="h-52 animate-pulse rounded-3xl bg-neutral-200" />
              </>
            ) : filteredVideos.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
                暂无视频数据，稍后再来看看～
              </div>
            ) : (
              <>
                {visibleVideos.map((video) => (
                  <Link
                    key={video.id}
                    href={`/watch/${video.cf_video_id}`}
                    className="group flex flex-col overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-[0_12px_34px_-20px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_44px_-22px_rgba(15,23,42,0.45)]"
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden">
                      <Image
                        unoptimized
                        src={getCoverSrc(
                          video,
                          '/images/card-placeholder-640x360.png'
                        )}
                        alt={video.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                      {/* 海报遮罩：只为角标提供对比度，不在海报上堆文字 */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

                      {/* 已学完角标：保留在海报上，信息明确且不占位置 */}
                      {completedSet.has(video.id) && (
                        <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                          ✓ 已学完
                        </span>
                      )}

                      {/* 时长：海报右下角 */}
                      <span className="absolute bottom-3 right-3 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                        {formatDuration(video.duration)}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-3">
                      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900">
                        {episodeNoById.get(video.id)
                          ? `第${episodeNoById.get(video.id)}期：${video.title}`
                          : video.title}
                      </h3>

                      {video.tags && video.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {video.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex max-w-full items-center truncate rounded-full bg-neutral-50 px-2 py-1 text-[10px] font-semibold text-neutral-600"
                            >
                              #{tag}
                            </span>
                          ))}
                          {video.tags.length > 2 && (
                            <span className="inline-flex items-center rounded-full bg-neutral-50 px-2 py-1 text-[10px] font-semibold text-neutral-500">
                              +{video.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        {video.author ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-700">
                              {(video.author || '英').charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate">{video.author}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">沉浸式精读</span>
                        )}
                        {video.difficulty ? (
                          <span className="flex-shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--accent)]">
                            {renderDifficultyLabel(video.difficulty)}
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-[10px] text-neutral-400">
                            进入精读
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}

                {visibleCount < filteredVideos.length && (
                  <div
                    ref={loadMoreRef}
                    className="col-span-full mt-2 flex justify-center py-2 text-[11px] text-neutral-500"
                  >
                    正在为你预加载更多精读视频...
                  </div>
                )}
              </>
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

          {/* 抽屉面板：使用 flex 布局，让中间内容区域成为真正的滚动容器 */}
          <div className="relative mt-auto flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-16px_50px_rgba(15,23,42,0.18)]">
            {/* 顶部柔光：更“小红书”的奶油质感 */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.22),transparent_60%)]" />

            {/* 顶部把手 + 标题 */}
            <div className="relative px-4 pt-4">
              <div className="mb-2 flex justify-center">
                <div className="h-1 w-10 rounded-full bg-neutral-200" />
              </div>
              <button
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
                aria-label="关闭筛选面板"
                onClick={() => setIsFilterSheetOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="pt-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent)]">
                  今天想练哪种感觉？
                </div>
                <h2 className="mt-2 text-[18px] font-semibold leading-tight text-neutral-900">
                  选 1 个主题 + 1 个难度就够了
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                  想快速见效：建议「只看未学」+「入门/进阶」。
                </p>
              </div>
            </div>

            <div className="relative flex-1 space-y-3 overflow-y-auto px-4 pb-24 pt-3 text-[13px] text-neutral-800">
              {/* 学习状态 */}
              <div className="rounded-3xl border border-neutral-100 bg-neutral-50/80 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    学习状态
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    只看你现在想刷的
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {[
                    { value: 'unlearned' as StatusFilter, label: '未学' },
                    { value: 'completed' as StatusFilter, label: '已学完' },
                    { value: 'favorited' as StatusFilter, label: '已收藏' }
                  ].map(option => {
                    const active = statusFilter === option.value;
                    const disabled =
                      option.value === 'favorited' && !user?.email;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex-1 rounded-full border px-3 py-2 text-[12px] font-semibold transition-colors ${
                          disabled
                            ? 'border-neutral-100 bg-white/70 text-neutral-300 cursor-not-allowed'
                            : active
                            ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm shadow-black/15'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        }`}
                        onClick={() => {
                          if (disabled) {
                            if (typeof window !== 'undefined') {
                              window.alert('登录后可以按“已收藏”筛选视频');
                            }
                            return;
                          }
                          setStatusFilter(prev =>
                            prev === option.value ? 'all' : option.value
                          );
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {statusFilter === 'favorited' && !user?.email && (
                  <p className="mt-2 text-[11px] text-neutral-400">
                    登录后可用：收藏筛选更适合反复练同一批句子。
                  </p>
                )}
              </div>

              {/* 难度 */}
              <div className="rounded-3xl border border-neutral-100 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    难度
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
                    onClick={() => setDifficultyFilter('all')}
                  >
                    清除
                  </button>
                </div>
                <div className="rounded-full bg-neutral-100 p-1">
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { value: 'easy' as DifficultyFilter, label: '入门' },
                        { value: 'medium' as DifficultyFilter, label: '进阶' },
                        { value: 'hard' as DifficultyFilter, label: '大师' }
                      ] satisfies { value: DifficultyFilter; label: string }[]
                    ).map(opt => {
                      const active = difficultyFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`rounded-full py-2 text-[12px] font-semibold transition-all ${
                            active
                              ? 'bg-white text-neutral-900 shadow-sm'
                              : 'text-neutral-500'
                          }`}
                          onClick={() =>
                            setDifficultyFilter(prev =>
                              prev === opt.value ? 'all' : opt.value
                            )
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                  <span className="rounded-full bg-neutral-50 px-2.5 py-1">
                    入门：听得懂就能跟
                  </span>
                  <span className="rounded-full bg-neutral-50 px-2.5 py-1">
                    进阶：更接近日常语速
                  </span>
                  <span className="rounded-full bg-neutral-50 px-2.5 py-1">
                    大师：表达更密集更地道
                  </span>
                </div>
              </div>

              {/* 作者（可选） */}
              <div className="rounded-3xl border border-neutral-100 bg-neutral-50/80 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    作者（可选）
                  </div>
                  {authorOptions.length > 6 && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800"
                      onClick={() => setShowAllAuthors(v => !v)}
                    >
                      <span>
                        {showAllAuthors ? '收起' : '更多'}
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
                <div className="no-scrollbar flex flex-wrap gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-semibold ${
                      authorFilter === 'all'
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                    onClick={() => setAuthorFilter('all')}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700">
                      All
                    </span>
                    <span>全部</span>
                  </button>
                  {(showAllAuthors ? authorOptions : authorOptions.slice(0, 6)).map(
                    name => {
                      const isActive = authorFilter === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-semibold ${
                            isActive
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                          }`}
                          onClick={() => setAuthorFilter(name)}
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700">
                            {name.charAt(0).toUpperCase()}
                          </span>
                          <span>{name}</span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* 排序 */}
              <div className="rounded-3xl border border-neutral-100 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    排序
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    默认最热更好刷
                  </span>
                </div>
                <div className="rounded-full bg-neutral-100 p-1">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      className={`rounded-full py-2 text-[12px] font-semibold transition-all ${
                        sortOrder === 'hottest'
                          ? 'bg-white text-neutral-900 shadow-sm'
                          : 'text-neutral-500'
                      }`}
                      onClick={() => setSortOrder('hottest')}
                    >
                      最热
                    </button>
                    <button
                      type="button"
                      className={`rounded-full py-2 text-[12px] font-semibold transition-all ${
                        sortOrder === 'latest'
                          ? 'bg-white text-neutral-900 shadow-sm'
                          : 'text-neutral-500'
                      }`}
                      onClick={() => setSortOrder('latest')}
                    >
                      最新
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-rose-100 bg-[var(--accent-soft)]/80 p-3 text-[12px] text-neutral-700">
                <div className="text-[11px] font-semibold text-[var(--accent)]">
                  小提示
                </div>
                <p className="mt-1 leading-relaxed">
                  想更快提升口语：每次只练 3～5 句。先单句循环听顺，再点麦克风跟读 2 遍。
                </p>
              </div>
            </div>

            {/* 底部固定按钮 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-white/98 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="pointer-events-auto rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-semibold text-neutral-700"
                  onClick={() => {
                    setDifficultyFilter('all');
                    setAuthorFilter('all');
                    setStatusFilter('all');
                    setSortOrder('hottest');
                  }}
                >
                  重置
                </button>
                <button
                  type="button"
                  className="pointer-events-auto flex-1 rounded-full bg-neutral-900 py-2.5 text-center text-[13px] font-semibold text-white shadow-[0_14px_34px_-18px_rgba(15,23,42,0.6)] active:scale-95"
                  onClick={() => setIsFilterSheetOpen(false)}
                >
                  查看结果（{filteredVideos.length}）
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

	      {/* 移动端学习数据浮动按钮：仅在首页列表空闲时显示 */}
	      {user?.email &&
	        !isFilterSheetOpen &&
	        !isStatsSheetOpen &&
	        !isNotificationSheetOpen && (
	          <button
	            type="button"
	            className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-[0_14px_40px_-22px_rgba(15,23,42,0.6)] backdrop-blur md:hidden"
	            aria-label="查看学习打卡"
	            onClick={() => setIsStatsSheetOpen(true)}
	          >
	            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm">
	              <span className="text-[14px] font-semibold leading-none">
	                {studyDates.length}
	              </span>
	            </div>
	            <div className="flex flex-col items-start leading-tight">
	              <span className="text-[10px] text-neutral-500">
	                {hasStudyToday ? '今天已打卡' : '今天还没打卡'}
	              </span>
	              <span className="text-[12px] font-semibold text-neutral-900">
	                本月 {studyDates.length} 天
	              </span>
	            </div>
	          </button>
	        )}

	      {/* 移动端学习数据 Bottom Sheet：样式对齐 PC 端 My progress 卡片 */}
	      {isStatsSheetOpen && (
	        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 md:hidden">
	          <button
            type="button"
            className="flex-1"
            onClick={() => setIsStatsSheetOpen(false)}
          />
	          <div className="relative mt-auto max-h-[82vh] w-full overflow-hidden rounded-t-[28px] bg-white px-4 pb-4 pt-3 shadow-[0_-16px_50px_rgba(15,23,42,0.18)]">
	            {/* 顶部柔光：温柔一点的“打卡氛围” */}
	            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.22),transparent_60%)]" />

	            {/* 顶部增加常见 Bottom Sheet 把手 + 标题行，视觉更完整 */}
	            <div className="mb-2 flex justify-center">
	              <div className="h-1 w-10 rounded-full bg-neutral-200" />
	            </div>
            <button
              type="button"
              className="absolute right-4 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[11px] text-neutral-500"
              aria-label="收起学习数据面板"
              onClick={() => setIsStatsSheetOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
	            <div className="relative space-y-3 overflow-y-auto pb-2 text-xs">
	              {/* 1) 主成就卡：先给情绪奖励 */}
	              <div className="rounded-3xl border border-rose-100 bg-[linear-gradient(180deg,rgba(252,238,239,0.95),rgba(255,255,255,0.96))] p-5 shadow-sm">
	                <div className="flex items-start justify-between gap-3">
	                  <div>
	                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
	                      Check-in
	                    </div>
	                    <div className="mt-2 text-[13px] font-semibold text-neutral-900">
	                      {hasStudyToday ? '今天已打卡，继续保持～' : '今天还没打卡，练 3 句就够'}
	                    </div>
	                  </div>
	                  <div className="flex flex-col items-end">
	                    <span className="text-[10px] text-neutral-500">本月</span>
	                    <div className="mt-1 flex items-end gap-1 text-neutral-900">
	                      <span className="text-3xl font-semibold leading-none">
	                        {studyDates.length}
	                      </span>
	                      <span className="pb-[2px] text-[12px] font-semibold">
	                        天
	                      </span>
	                    </div>
	                  </div>
	                </div>
	                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
	                  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 font-semibold text-neutral-700">
	                    <IconFlame />
	                    连续 {currentStreak} 天
	                  </span>
	                  <span className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-2.5 py-1 font-medium text-neutral-600">
	                    {currentYear} 年 {currentMonth + 1} 月
	                  </span>
	                </div>
	              </div>

	              {/* 2) 今日建议：把“下一步”讲清楚 */}
	              <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
	                <div className="flex items-center justify-between gap-3">
	                  <div className="text-[12px] font-semibold text-neutral-900">
	                    今日建议
	                  </div>
	                  <span className="rounded-full bg-neutral-50 px-2.5 py-1 text-[10px] font-semibold text-neutral-600">
	                    3 分钟
	                  </span>
	                </div>
	                <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-neutral-600">
	                  <li>选一集你喜欢的素材，先听一遍找感觉。</li>
	                  <li>点字幕跳回原句，开「单句循环」听顺。</li>
	                  <li>点「麦克风」跟读：录音→停止→回放，重复 2 遍。</li>
	                </ol>
	                {heroVideo && (
	                  <Link
	                    href={`/watch/${heroVideo.cf_video_id}`}
	                    className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_14px_34px_-18px_rgba(15,23,42,0.6)] active:scale-95"
	                    onClick={() => setIsStatsSheetOpen(false)}
	                  >
	                    去练一集（今日精选）
	                  </Link>
	                )}
	              </div>

	              {/* 3) 月度打卡：保留热力图，但更温柔 */}
	              <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
	                <div className="flex items-center justify-between">
	                  <div className="text-[12px] font-semibold text-neutral-900">
	                    本月打卡
	                  </div>
	                  <span className="text-[11px] text-neutral-500">
	                    今天：{hasStudyToday ? '已打卡' : '未打卡'}
	                  </span>
	                </div>
	                <div className="mt-3 grid grid-cols-7 gap-1.5">
	                  {calendarSlots.map(day => {
	                    const isActive = activeDayNumbers.has(day);
	                    const isToday = day === todayDayNumber;
	                    return (
	                      <div
	                        key={day}
	                        className={`h-3 w-3 rounded-full ${
	                          isActive
	                            ? 'bg-[var(--accent)] shadow-[0_0_10px_rgba(232,141,147,0.55)]'
	                            : 'bg-neutral-200'
	                        } ${isToday ? 'ring-2 ring-black/10 ring-offset-2 ring-offset-white' : ''}`}
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

	              {/* 4) 素材库进度：保留但更“生活方式”一点 */}
	              <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
	                <div className="flex items-center justify-between">
	                  <div className="text-[12px] font-semibold text-neutral-900">
	                    素材库进度
	                  </div>
	                  <span className="text-[11px] text-neutral-500">
	                    {progressPercent}%
	                  </span>
	                </div>
	                <div className="mt-2 h-2.5 w-full rounded-full bg-neutral-100">
	                  <div
	                    className="h-2.5 rounded-full bg-neutral-900"
	                    style={{ width: `${progressPercent}%` }}
	                  />
	                </div>
	                <p className="mt-2 text-[11px] text-neutral-500">
	                  已学 {learnedCount} / {totalVideosCount} 期
	                </p>
	              </div>
	            </div>
	          </div>
	        </div>
	      )}

	      {/* 官方通知 / 反馈 / 使用指南面板：从顶部下拉，贴近导航区域（移动端 + PC 复用） */}
	      {isNotificationSheetOpen && (
	        <div
	          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20"
	          onClick={() => setIsNotificationSheetOpen(false)}
	        >
	          {/* 顶部下拉面板本体：靠近导航，从上往下出现；PC 端限制最大宽度 */}
	          <div
	            className="mx-4 mt-16 flex w-full max-w-md max-h-[70vh] flex-col rounded-2xl bg-white px-4 pt-4 pb-5 shadow-lg"
	            onClick={event => event.stopPropagation()}
	          >
	            <div className="mb-3 flex flex-shrink-0 items-center justify-between">
	              <div>
	                <h2 className="text-sm font-semibold text-neutral-900">
	                  {notificationMode === 'notices' ? '官方通知' : '意见与反馈'}
	                </h2>
	                <p className="mt-0.5 text-[11px] text-neutral-500">
	                  {notificationMode === 'notices'
	                    ? '了解最新内容和功能更新。'
	                    : '用起来哪里不顺手，都可以直接告诉我们。'}
	                </p>
	              </div>
	              <div className="flex items-center gap-2">
	                <button
	                  type="button"
	                  className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-700"
	                  aria-label={
	                    notificationMode === 'notices'
	                      ? '进入反馈界面'
	                      : '返回通知列表'
	                  }
	                  onClick={() =>
	                    setNotificationMode(mode =>
	                      mode === 'notices' ? 'feedback' : 'notices'
	                    )
	                  }
	                >
	                  {notificationMode === 'notices' ? '反馈' : '返回通知'}
	                </button>
	                <button
	                  type="button"
	                  className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white shadow-sm shadow-black/10 hover:bg-neutral-800"
	                  aria-label="打开使用指南"
	                  onClick={() => {
	                    setIsNotificationSheetOpen(false);
	                    router.push('/guide');
	                  }}
	                >
	                  使用指南
	                </button>
	              </div>
	            </div>
	            <div className="flex-1 space-y-4 overflow-y-auto text-xs text-neutral-700">
	              {notificationMode === 'notices' ? (
	                <div className="space-y-3">
	                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3 shadow-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        新内容
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        2026-01-22
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-neutral-900">
                      新增几集「日常聊天」精读视频
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
                      适合通勤路上刷一小集，专门拆解地道聊天句子，和精读页搭配使用效果更好。
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3 shadow-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                        功能更新
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        2026-01-20
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-neutral-900">
                      生词本默认收集所有高亮单词
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
                      现在打开生词本，一屏就能预览当前精读里的所有单词，点「认识」即可清理熟词。
                    </p>
                  </div>

                  <p className="px-1 text-[11px] text-neutral-500">
                    更多更新会在小红书置顶笔记同步。
                  </p>
	                </div>
	              ) : (
	                <div className="space-y-4 text-[13px]">
                  <p>
                    用起来哪里不顺手、哪些地方想优化，或者你希望多哪些学习场景，都可以直接在这里告诉我们。
                  </p>
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      WeChat
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-neutral-900">
                          WeiWeiLad
                        </div>
                        <div className="mt-0.5 text-[11px] text-neutral-500">
                          打开微信扫一扫右侧二维码，备注「网站反馈」或「精读反馈」，我们会拉你进内测群。
                        </div>
                        <button
                          type="button"
                          className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-white shadow-sm active:scale-95"
                          onClick={() => {
                            if (typeof navigator !== 'undefined') {
                              const nav = navigator as Navigator & {
                                clipboard?: {
                                  writeText?: (text: string) => Promise<void>;
                                };
                              };
                              if (nav.clipboard?.writeText) {
                                void nav.clipboard
                                  .writeText('WeiWeiLad')
                                  .then(() => {
                                    setWeChatCopyHint(
                                      '已复制微信号，打开微信搜索添加即可（记得备注「网站反馈」）。'
                                    );
                                  })
                                  .catch(() => {
                                    setWeChatCopyHint(
                                      '复制可能没有成功，可以长按微信号手动复制。'
                                    );
                                  });
                              } else {
                                setWeChatCopyHint(
                                  '复制可能没有成功，可以长按微信号手动复制。'
                                );
                              }
                            } else {
                              setWeChatCopyHint(
                                '复制可能没有成功，可以长按微信号手动复制。'
                              );
                            }
                          }}
                        >
                          <span>复制微信号</span>
                        </button>
                        {wechatCopyHint && (
                          <p className="mt-2 text-[11px] text-[var(--accent)]">
                            {wechatCopyHint}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1">
                          <Image
                            src="/images/hero-placeholder-960x540.png"
                            alt="微信反馈二维码"
                            width={128}
                            height={168}
                            className="h-40 w-28 rounded-xl object-contain bg-white"
                          />
                        </div>
                        <p className="mt-1 text-center text-[10px] text-neutral-400">
                          长按识别二维码添加
                        </p>
                      </div>
                    </div>
                  </div>
	                  <p className="px-1 text-[11px] text-neutral-500">
	                    我们会认真看每一条反馈，重要更新会在「官方通知」里第一时间告诉你。
	                  </p>
	                </div>
	              )}
	            </div>
	          </div>
	        </div>
	      )}

	      {/* 首次登录 / 注册欢迎弹窗：柔和色系，与首页整体风格统一 */}
	      {showWelcomeModal && user?.email && (
	        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
	          <div
	            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-[var(--bg-shell)] px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.35)]"
	            onClick={event => event.stopPropagation()}
	          >
	            {/* 顶部柔光：保持奶油风，不抢主体文字 */}
	            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.25),transparent_60%)]" />
	            <button
	              type="button"
	              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[11px] text-neutral-500"
	              aria-label="关闭欢迎引导"
	              onClick={() => {
	                void markWelcomeSeen();
	              }}
	            >
	              <svg
	                viewBox="0 0 24 24"
	                className="h-3.5 w-3.5"
	                fill="none"
	                stroke="currentColor"
	                strokeWidth={1.7}
	                strokeLinecap="round"
	                strokeLinejoin="round"
	              >
	                <path d="M6 6l12 12M18 6L6 18" />
	              </svg>
	            </button>
	            <div className="relative">
	              <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent)]">
	                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] shadow-sm">
	                  1
	                </span>
	                新手引导
	              </div>

	              <h2 className="mt-3 text-[20px] font-semibold leading-tight text-neutral-900">
	                第一次来？3 分钟上手精读
	              </h2>
	              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
	                这不是网课，是「素材 + 工具」。建议先打开使用指南，把「跟读怎么用」看一遍，马上就能练起来。
	              </p>

	              <div className="mt-4 space-y-2">
	                <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
	                  <div className="flex items-start justify-between gap-3">
	                    <div className="flex items-start gap-2.5">
	                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-neutral-900 shadow-sm shadow-black/5">
	                        <svg
	                          viewBox="0 0 24 24"
	                          className="h-4 w-4"
	                          fill="none"
	                          stroke="currentColor"
	                          strokeWidth={1.8}
	                          strokeLinecap="round"
	                          strokeLinejoin="round"
	                        >
	                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
	                          <path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5V4A2.5 2.5 0 0 1 6.5 2z" />
	                        </svg>
	                      </div>
	                      <div>
	                        <div className="text-[12px] font-semibold text-neutral-900">
	                          使用指南入口
	                        </div>
	                        <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
	                          首页右上角点「通知」→ 右上角点「使用指南」；
	                        </p>
	                      </div>
	                    </div>
	                  </div>
	                </div>

	                <div className="rounded-2xl border border-rose-100 bg-[var(--accent-soft)]/90 p-3">
	                  <div className="flex items-start gap-2.5">
	                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-[var(--accent)] shadow-sm shadow-black/5">
	                      <svg
	                        viewBox="0 0 24 24"
	                        className="h-4 w-4"
	                        fill="none"
	                        stroke="currentColor"
	                        strokeWidth={1.8}
	                        strokeLinecap="round"
	                        strokeLinejoin="round"
	                      >
	                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
	                      </svg>
	                    </div>
	                    <div>
	                      <div className="text-[12px] font-semibold text-neutral-900">
	                        反馈通道（我们会持续优化）
	                      </div>
	                      <p className="mt-1 text-[11px] leading-relaxed text-neutral-700">
	                        在「通知」面板切到「意见与反馈」，复制微信号就能直接联系我：<span className="font-semibold">WeiWeiLad</span>
	                      </p>
	                    </div>
	                  </div>
	                </div>

	                <div className="rounded-2xl border border-neutral-100 bg-white p-3">
	                  <div className="text-[12px] font-semibold text-neutral-900">
	                    今日最稳练法（照做就行）
	                  </div>
	                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-neutral-600">
	                    <li>选一条短视频，先全屏听一遍找感觉。</li>
	                    <li>点字幕跳回原句，开「单句循环」听顺。</li>
	                    <li>点「麦克风」跟读：点一次录音，再点一次停止，出现回放就听自己。</li>
	                  </ol>
	                </div>
	              </div>
	            </div>

	            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
	              <button
	                type="button"
	                className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-medium text-white shadow-sm shadow-black/20 hover:bg-neutral-800"
	                onClick={openGuideFromWelcome}
	              >
	                打开使用指南
	              </button>
	              <button
	                type="button"
	                className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-800 hover:bg-neutral-50"
	                onClick={() => {
	                  void markWelcomeSeen();
	                }}
	              >
	                我先开始精读
	              </button>
	            </div>
	          </div>
	        </div>
	      )}
	    </div>
	  );
	}
