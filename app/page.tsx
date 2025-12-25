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
  view_count?: number | null;
}

export default function Home() {
  const [filteredTag, setFilteredTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [studyDates, setStudyDates] = useState<string[]>([]);

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

  // 过滤视频
  const filteredVideos = videos.filter((video) => {
    const matchesSearch = searchQuery
      ? video.title.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesSearch;
  });

  // 所有标签 - 暂时没有标签功能（预留）
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
    filteredVideos.length > 0
      ? filteredVideos.reduce((best, v) => {
          const bestViews = best.view_count ?? 0;
          const currentViews = v.view_count ?? 0;
          return currentViews > bestViews ? v : best;
        }, filteredVideos[0])
      : null;

  return (
    <div className="min-h-screen bg-[#F8F8F8] text-gray-900">
      <Header />

      <main className="mx-auto flex max-w-7xl flex-1 flex-col gap-6 px-4 pb-10 pt-20 md:flex-row md:items-start md:gap-8">
        {/* 左侧主区域 */}
        <section className="flex-1 space-y-4">
          {/* 顶部：标题 + 搜索 */}
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-gray-400">
                Immersive · English
              </p>
              <h2 className="mt-2 text-xl font-semibold leading-tight text-gray-900 md:text-2xl">
                精读素材库
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                精选短视频 + 双语脚本 + 知识卡片，小红书风格的高颜值精读体验。
              </p>
            </div>

            <div className="w-full md:w-80">
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜一搜你想练的场景，如 travel / movie / daily"
                  className="w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#FF2442] focus:outline-none focus:ring-2 focus:ring-[#FF2442]/20"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  value={searchQuery}
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                  <span className="text-sm">🔍</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex gap-6 text-sm">
              <button
                type="button"
                className={`pb-1 ${
                  filteredTag === null
                    ? 'border-b-2 border-[#FF2442] font-semibold text-gray-900'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                onClick={() => setFilteredTag(null)}
              >
                推荐
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`pb-1 ${
                    filteredTag === tag
                      ? 'border-b-2 border-[#FF2442] font-semibold text-gray-900'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  onClick={() =>
                    setFilteredTag((prev) => (prev === tag ? null : tag))
                  }
                >
                  {tag}
                </button>
              ))}
            </div>
            {!isLoading && (
              <div className="hidden text-xs text-gray-500 sm:block">
                共 {filteredVideos.length} 个视频
              </div>
            )}
          </div>

          {/* 推荐位：使用点击量最高的视频 */}
          {heroVideo && (
            <Link
              href={`/watch/${heroVideo.cf_video_id}`}
              className="block overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-col md:flex-row">
                <div className="relative w-full md:w-1/2">
                  <div className="relative h-48 w-full overflow-hidden md:h-full">
                    <Image
                      unoptimized
                      src={getCoverSrc(
                        heroVideo,
                        '/images/hero-placeholder-960x540.png'
                      )}
                      alt={heroVideo.title}
                      fill
                      className="object-cover transition-transform duration-300 hover:scale-[1.03]"
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-between gap-3 p-4 md:p-5">
                  <div>
                    <div className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-[#FF2442]">
                      今日主推
                    </div>
                    <h1 className="mt-2 line-clamp-2 text-[16px] font-semibold leading-snug text-gray-900">
                      {heroVideo.title}
                    </h1>
                    {heroVideo.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                        {heroVideo.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      {heroVideo.author && (
                        <span className="inline-flex items-center gap-1">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] text-gray-600">
                            {heroVideo.author.charAt(0).toUpperCase()}
                          </span>
                          <span>{heroVideo.author}</span>
                        </span>
                      )}
                      {heroVideo.difficulty && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                          <span>难度</span>
                          <span>{renderDifficultyStars(heroVideo.difficulty)}</span>
                        </span>
                      )}
                      {heroVideo.tags && heroVideo.tags.length > 0 && (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {heroVideo.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                        <span>⏱</span>
                        <span>{formatDuration(heroVideo.duration)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                        <span>🔥</span>
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
          )}

          {/* 视频网格列表：小红书风格卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading ? (
              <>
                <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
              </>
            ) : filteredVideos.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                暂无视频数据，稍后再来看看～
              </div>
            ) : (
              filteredVideos.map((video) => (
                <Link
                  key={video.id}
                  href={`/watch/${video.cf_video_id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative h-40 w-full overflow-hidden">
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
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <div>
                      <h3 className="line-clamp-2 text-[15px] font-semibold text-gray-900">
                        {video.title}
                      </h3>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                      {/* 左侧：作者行 */}
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[11px] text-gray-600">
                          {(video.author || '英').charAt(0).toUpperCase()}
                        </div>
                        <span>{video.author || '创作者'}</span>
                      </div>
                      {/* 右侧：点赞 / 次数 */}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-gray-400">
                          <span className="transition-colors group-hover:text-[#FF2442]">
                            ❤️
                          </span>
                          <span>{video.view_count ?? 0}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 右侧侧边栏：改为独立白色卡片 */}
        <aside className="mt-4 w-full space-y-4 md:mt-20 md:w-72">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <StatsCard
              totalVideos={videos.length}
              learnedVideos={learnedCount}
              notLearnedVideos={Math.max(videos.length - learnedCount, 0)}
            />
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <StudyCalendar
              year={new Date().getFullYear()}
              month={new Date().getMonth() + 1}
              studyDates={studyDates}
            />
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <NotificationCard />
          </div>
        </aside>
      </main>
    </div>
  );
}

