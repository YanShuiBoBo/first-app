'use client';

import React, { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { Stream, type StreamPlayerApi } from '@cloudflare/stream-react';
import { usePlayerStore } from '@/lib/store/player-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import Header from '@/components/layout/Header';

// 定义视频数据类型
interface VideoData {
  id: string;
  cf_video_id: string;
  title: string;
  poster: string;
  duration: number;
  status: string;
   author?: string | null;
   description?: string | null;
   difficulty?: number | null;
   tags?: string[] | null;
  subtitles: SubtitleItem[];
  cards: KnowledgeCard[];
}

// 定义字幕条目类型
interface SubtitleItem {
  start: number;
  end: number;
  text_en: string;
  text_cn: string;
}

// 定义知识卡片类型
interface KnowledgeCard {
  trigger_word: string;
  data: {
    ipa?: string;
    def: string;
    sentence?: string;
    type?: 'word' | 'phrase' | 'idiom' | 'slang';
  };
}

export default function WatchPage() {
  // 使用useParams获取路由参数
  const params = useParams();
  const videoId = params?.videoId as string;

  const videoRef = useRef<HTMLDivElement>(null);
  // Cloudflare 播放器实例引用，初始为 undefined；类型与 Stream 组件的 streamRef 要求保持一致
  const streamRef = useRef<StreamPlayerApi | undefined>(undefined);

  // 字幕容器与每行字幕的引用，用于自动滚动
  const subtitlesContainerRef = useRef<HTMLDivElement | null>(null);
  const subtitleItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 认证（Phase 1 仅做本地同步，不强制登录）
  const { initialize, user } = useAuthStore();

  // Supabase 客户端只在浏览器端初始化，避免构建 / 预渲染阶段触发环境变量错误
  const [supabase, setSupabase] =
    useState<ReturnType<typeof createBrowserClient> | null>(null);

  // 视频数据状态
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [subtitleMode, setSubtitleMode] = useState<'both' | 'en' | 'cn'>('both');

  // 初始化登录状态（Phase 1 先不做强门禁，只同步一下本地登录信息）
  useEffect(() => {
    initialize();
  }, [initialize]);

  // 首次在浏览器端挂载时初始化 Supabase 客户端
  useEffect(() => {
    const client = createBrowserClient();
    setSupabase(client);
  }, []);

  // 获取视频数据
  useEffect(() => {
    const fetchVideoData = async () => {
      if (!videoId || !supabase) return;

      try {
        setIsLoading(true);
        setError(null);

        // 使用数据库函数获取视频 + 字幕 + 知识卡片的完整数据
        const { data, error } = await supabase.rpc('get_video_with_content', {
          video_cf_id: videoId
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!data) {
          throw new Error('未找到对应视频');
        }

        // get_video_with_content 返回结构:
        // { video: {...}, subtitles: [...], knowledge_cards: [{trigger_word, data}, ...] }
        const { video, subtitles, knowledge_cards } = data as {
          video: {
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
          };
          subtitles: SubtitleItem[] | null;
          knowledge_cards: KnowledgeCard[] | null;
        };

        if (!video) {
          throw new Error('视频数据为空');
        }

        const normalized: VideoData = {
          id: video.id,
          cf_video_id: video.cf_video_id,
          title: video.title,
          poster:
            video.poster ||
            'https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Immersive+English',
          duration: video.duration,
          status: video.status,
          author: video.author,
          description: video.description,
          difficulty: video.difficulty,
          tags: video.tags,
          subtitles: subtitles || [],
          cards: knowledge_cards || []
        };

        setVideoData(normalized);
      } catch (err) {
        console.error('获取视频数据失败:', err);
        setError(err instanceof Error ? err.message : '获取视频数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoData();
  }, [videoId, supabase]);

  // 工具函数：把当前本地时间格式化为 YYYY-MM-DD，避免使用 UTC 导致日期偏移
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 记录学习进度与学习日历
  useEffect(() => {
    const userEmail = user?.email;
    if (!videoData || !userEmail || !supabase) return;

    // 在 Effect 内部固定一个非空引用，避免 TypeScript 将 supabase 视为可能为 null
    const client = supabase;

    const recordProgress = async () => {
      try {
        await client
          .from('user_video_progress')
          .upsert(
            {
              user_email: userEmail,
              video_id: videoData.id,
              status: 'completed',
              last_watched_at: new Date().toISOString()
            },
            {
              onConflict: 'user_email,video_id'
            }
          );
      } catch (err) {
        console.error('记录视频学习进度失败:', err);
      }
    };

    const recordStudyDay = async () => {
      try {
        // 使用本地日期，避免中国时区等地区出现“学在 23 号却记到 22 号”的问题
        const dateStr = getLocalDateString();

        await client
          .from('user_study_days')
          .upsert(
            {
              user_email: userEmail,
              study_date: dateStr
            },
            {
              onConflict: 'user_email,study_date'
            }
          );
      } catch (err) {
        console.error('记录学习日历失败:', err);
      }
    };

    void recordProgress();
    void recordStudyDay();
  }, [supabase, user?.email, videoData]);

  // 播放器状态 - Hooks必须在条件返回之前调用
  const {
    currentSubtitleIndex,
    activeCard,
    playbackRate,
    sentenceLoop,
    setCurrentTime,
    jumpToSubtitle,
    showCard,
    hideCard,
    setCurrentSubtitle,
    setPlaybackRate,
    toggleSentenceLoop
  } = usePlayerStore();

  // 视频时间更新回调：同步到全局播放器状态，并根据时间计算当前字幕行
  const handleTimeUpdate = () => {
    if (!streamRef.current || !videoData?.subtitles) return;
    const time = streamRef.current.currentTime;
    const subtitles = videoData.subtitles;

    setCurrentTime(time);
    setCurrentSubtitle(subtitles, time);

    // 单句循环模式：当前句播放到结尾时回到句首
    const { sentenceLoop: loopOn, currentSubtitleIndex: idx } =
      usePlayerStore.getState();
    if (loopOn) {
      const current = subtitles[idx];
      if (current && time >= current.end - 0.05) {
        streamRef.current.currentTime = current.start;
      }
    }
  };

  // 首次加载视频和字幕后，默认选中第一句，避免播放前完全无高亮
  useEffect(() => {
    if (videoData?.subtitles && videoData.subtitles.length > 0) {
      setCurrentSubtitle(videoData.subtitles, 0);
    }
  }, [videoData?.subtitles, setCurrentSubtitle]);

  const handlePlayerLoaded = () => {
    setIsPlayerReady(true);
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (!streamRef.current) return;
    if (isPlaying) {
      streamRef.current.pause();
    } else {
      // play() 返回 Promise，忽略可能的自动播放策略报错
      void streamRef.current.play();
    }
  };

  const handleChangeSpeed = () => {
    const speeds = [0.8, 1, 1.25];
    const current = usePlayerStore.getState().playbackRate;
    const index = speeds.indexOf(current);
    const next = speeds[(index + 1) % speeds.length];
    setPlaybackRate(next);
  };

  // 播放速度变化时同步到 Cloudflare 播放器
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // 字幕点击事件
  const handleSubtitleClick = (index: number) => {
    if (!videoData?.subtitles || !streamRef.current) return;
    const subtitle = videoData.subtitles[index];
    // 跳转到当前句子的开始时间
    streamRef.current.currentTime = subtitle.start;
    jumpToSubtitle(index);
  };

  // 高亮单词点击事件
  const handleWordClick = (word: string) => {
    if (videoData?.cards) {
      const lower = word.toLowerCase();
      const card = videoData.cards.find(
        card => card.trigger_word.toLowerCase() === lower
      );
      if (card) {
        showCard(card);
      }
    }
  };

  // 点击知识卡片：高亮卡片，并尝试把视频跳到包含这个单词的第一句
  const handleCardClick = (card: KnowledgeCard) => {
    showCard(card);

    if (!videoData?.subtitles || !streamRef.current) return;

    const lower = card.trigger_word.toLowerCase();
    const index = videoData.subtitles.findIndex(sub =>
      sub.text_en.toLowerCase().includes(lower)
    );

    if (index >= 0) {
      const subtitle = videoData.subtitles[index];
      streamRef.current.currentTime = subtitle.start;
      jumpToSubtitle(index);
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  const renderDifficultyStars = (difficulty?: number | null) => {
    const d = Math.min(Math.max(difficulty ?? 3, 1), 5);
    return '🌟'.repeat(d);
  };

  // 当前字幕自动跟随滚动到视图中间
  // 移动端：基于视口高度计算真正“可见区域”，扣掉底部精读控制条和知识卡片 bottom sheet 的遮挡
  useEffect(() => {
    if (!subtitlesContainerRef.current) return;
    const container = subtitlesContainerRef.current;
    const activeEl = subtitleItemRefs.current[currentSubtitleIndex];
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    const offset = elRect.top - containerRect.top;

    let visibleHeight = containerRect.height;

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      // 视口高度 - 字幕容器到顶部的距离 - 底部悬浮区域高度 = 实际可见高度
      const viewportHeight = window.innerHeight;
      const overlaysHeight = activeCard ? 200 : 120; // 精读控制条 + 可能出现的知识卡片 bottom sheet
      visibleHeight = Math.max(
        viewportHeight - containerRect.top - overlaysHeight,
        1
      );
    }

    const target =
      container.scrollTop +
      offset -
      visibleHeight / 2 +
      elRect.height / 2;

    container.scrollTo({
      top: target,
      behavior: 'smooth'
    });
  }, [currentSubtitleIndex, activeCard]);

  // 页面渲染
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
          <p className="text-sm text-slate-400">正在加载精读内容...</p>
        </div>
      </div>
    );
  }

  if (error || !videoData) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-5 text-center text-sm">
          <p className="mb-2 text-base font-semibold">获取视频数据失败</p>
          <p className="text-red-200">{error || '未知错误'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-18%] top-[-20%] h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute right-[-18%] bottom-[-24%] h-80 w-80 rounded-full bg-violet-500/25 blur-3xl" />
      </div>

      <Header />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pb-6 pt-20 lg:gap-6 lg:pb-10 lg:pt-24">
        {/* 顶部：模式标签 + 返回首页 + 时长信息（轻量显示） */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center justify-between gap-3 md:justify-start">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-400">
              Watch · 精读模式
            </p>
            <Link
              href="/"
              className="rounded-full border border-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-300"
            >
              ← 返回首页
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400 md:mt-0 md:justify-end">
            <span className="inline-flex items-center rounded-full bg-slate-900/80 px-3 py-1">
              ⏱ {formatDuration(videoData.duration)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700/80 px-3 py-1">
              双语字幕 · 知识卡片 · 单词点击解释
            </span>
          </div>
        </div>

        {/* 布局：视频 + 弹幕为主角，知识卡片用浮层/抽屉呈现，不再占一整列 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* 左栏 - 视频播放器 (60%) */}
          <div className="lg:col-span-7">
            <div
              ref={videoRef}
              className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-black/80 shadow-xl shadow-slate-950/70"
            >
              <div className="relative aspect-video w-full">
                {!isPlayerReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    <div className="flex flex-col items-center gap-3 text-xs text-slate-400">
                      <div className="h-10 w-10 animate-pulse rounded-full bg-slate-700" />
                      <span>视频加载中...</span>
                    </div>
                  </div>
                )}
                <Stream
                  src={videoData.cf_video_id}
                  controls
                  width="100%"
                  // 使用 Cloudflare 提供的 streamRef 和 onTimeUpdate 来获取时间信息
                  streamRef={streamRef}
                  onTimeUpdate={handleTimeUpdate}
                  poster={videoData.poster}
                  // 尝试多加载一些数据，方便更快切到高清码率
                  preload="auto"
                  onLoadedData={handlePlayerLoaded}
                  onPlay={handlePlay}
                  onPause={handlePause}
                />
              </div>
            </div>

            {/* 视频下方：标题 + 作者 + 难度 + 标签 + 简介 */}
            <div className="mt-4 space-y-2">
              <h1 className="text-xl font-semibold leading-tight text-slate-50 md:text-2xl">
                {videoData.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                {videoData.author && (
                  <span className="inline-flex items-center gap-1">
                    <span>作者</span>
                    <span className="font-medium text-slate-200">
                      {videoData.author}
                    </span>
                  </span>
                )}
                {videoData.difficulty && (
                  <span className="inline-flex items-center gap-1">
                    <span>难度</span>
                    <span>{renderDifficultyStars(videoData.difficulty)}</span>
                  </span>
                )}
              </div>
              {videoData.tags && videoData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                  {videoData.tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-900/80 px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {videoData.description && (
                <p className="max-w-2xl text-sm text-slate-300">
                  {videoData.description}
                </p>
              )}
            </div>
          </div>

          {/* 右侧 - 字幕流（桌面端占较宽比例，便于“弹幕感”阅读），底部带一个简洁的知识卡片入口 */}
          <div className="lg:col-span-5">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">
                  脚本流
                </h2>
                <div className="inline-flex rounded-full bg-slate-900/80 p-0.5 text-[11px] text-slate-300">
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded-full ${
                      subtitleMode === 'both'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300'
                    }`}
                    onClick={() => setSubtitleMode('both')}
                  >
                    中英
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded-full ${
                      subtitleMode === 'en'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300'
                    }`}
                    onClick={() => setSubtitleMode('en')}
                  >
                    英
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded-full ${
                      subtitleMode === 'cn'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300'
                    }`}
                    onClick={() => setSubtitleMode('cn')}
                  >
                    中
                  </button>
                </div>
              </div>

              <div
                ref={subtitlesContainerRef}
                className="mt-1 max-h-[50vh] space-y-3 overflow-y-auto pr-1 text-sm lg:h-[60vh]"
              >
                {videoData.subtitles.map((subtitle, index) => {
                  const words = subtitle.text_en.split(' ');

                  const isActive = currentSubtitleIndex === index;

                  return (
                    <div
                      key={index}
                      ref={el => {
                        subtitleItemRefs.current[index] = el;
                      }}
                      className={`relative cursor-pointer rounded-xl border px-3 py-2 transition-all ${
                        isActive
                          ? 'border-sky-400 bg-sky-500/90 text-slate-950 shadow-lg shadow-sky-900/40'
                          : 'border-transparent bg-slate-900/60 text-slate-50 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                      onClick={() => handleSubtitleClick(index)}
                    >
                      {isActive && (
                        <div className="absolute inset-y-2 left-0 w-1 rounded-full bg-sky-200" />
                      )}

                      <div
                        className={`text-[11px] ${
                          isActive ? 'text-slate-900/80' : 'text-slate-500'
                        }`}
                      >
                        {Math.floor(subtitle.start / 60)}:{Math.floor(subtitle.start % 60).toString().padStart(2, '0')}
                      </div>

                      {(subtitleMode === 'both' || subtitleMode === 'en') && (
                        <div
                          className={`mt-1 font-medium ${
                            isActive ? 'text-slate-950' : 'text-slate-50'
                          }`}
                        >
                          {words.map((word, wordIndex) => {
                            const cleanedWord = word.replace(/[^\w]/g, '');
                            const isTriggerWord = videoData.cards.some(
                              card =>
                                card.trigger_word.toLowerCase() ===
                                cleanedWord.toLowerCase()
                            );

                            if (isTriggerWord) {
                              return (
                                <span
                                  key={wordIndex}
                                  className="cursor-pointer text-sky-400 underline-offset-2 hover:underline"
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleWordClick(cleanedWord);
                                  }}
                                >
                                  {word}{' '}
                                </span>
                              );
                            }

                            return (
                              <span key={wordIndex}>
                                {word}{' '}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {(subtitleMode === 'both' || subtitleMode === 'cn') && (
                        <div
                          className={`mt-1 text-xs ${
                            isActive ? 'text-slate-900/90' : 'text-slate-400'
                          }`}
                        >
                          {subtitle.text_cn}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 桌面端：底部知识卡片小入口，不单独占列，只放在脚本流卡片底部 */}
              <div className="mt-4 hidden border-t border-slate-800/80 pt-3 text-xs text-slate-400 lg:block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-slate-200">
                    知识卡片
                  </span>
                  {activeCard && (
                    <span className="text-sky-300">
                      当前：{activeCard.trigger_word}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {videoData.cards.length > 0 ? (
                    videoData.cards.slice(0, 16).map(card => (
                      <button
                        key={card.trigger_word}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          activeCard?.trigger_word === card.trigger_word
                            ? 'border-sky-500 bg-sky-500/20 text-sky-100'
                            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-200'
                        }`}
                        onClick={() => showCard(card)}
                      >
                        {card.trigger_word}
                      </button>
                    ))
                  ) : (
                    <span className="text-slate-500">
                      暂无知识卡片
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 底部控制条 - 仅在移动端显示，贴近 APP 模式体验 */}
        <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-slate-800/80 bg-slate-950/95 px-4 py-3 text-xs text-slate-200 shadow-[0_-10px_40px_rgba(15,23,42,0.9)] lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">
                  精读控制
                </span>
                <span className="text-[11px] text-slate-500">
                  句子 {currentSubtitleIndex + 1}/{videoData.subtitles.length}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                当前模式：{sentenceLoop ? '单句循环' : '连续播放'}
              </span>
            </div>
            <span className="hidden text-[11px] text-slate-500 sm:block">
              点句子跳转 · 单句循环专注跟读
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* 左侧：句子播放模式 */}
            <button
              type="button"
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 text-[11px] ${
                sentenceLoop
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-200'
              }`}
              onClick={toggleSentenceLoop}
            >
              <span className="text-base leading-none">⟲</span>
              <span>
                {sentenceLoop ? '切换连续播放' : '开启单句循环'}
              </span>
            </button>

            {/* 中间：播放按钮 */}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40"
              onClick={handleTogglePlay}
            >
              <span className="text-lg leading-none">
                {isPlaying ? '⏸' : '▶︎'}
              </span>
            </button>

            {/* 右侧：播放速度 */}
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-slate-900 px-3 py-2 text-[11px] text-slate-200"
              onClick={handleChangeSpeed}
            >
              <span className="text-base leading-none">1x</span>
              <span>{playbackRate.toFixed(2).replace(/\.00$/, '')}x</span>
            </button>
          </div>
        </div>
      </main>

      {/* 桌面端：知识卡片浮层（不改变布局，只覆盖在右侧区域附近） */}
      {activeCard && (
        <div className="pointer-events-none fixed inset-0 z-40 hidden lg:block">
          <div className="pointer-events-auto absolute right-8 top-28 w-[320px] rounded-2xl border border-sky-500/70 bg-slate-950/95 px-4 py-3 text-sm text-slate-100 shadow-xl shadow-sky-900/50">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base font-semibold text-sky-300">
                {activeCard.trigger_word}
              </div>
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={hideCard}
              >
                关闭
              </button>
            </div>
            {activeCard.data.type && (
              <div className="mb-1 inline-flex rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-100">
                {activeCard.data.type}
              </div>
            )}
            {activeCard.data.ipa && (
              <div className="mt-1 text-xs text-slate-300">
                {activeCard.data.ipa}
              </div>
            )}
            <div className="mt-2 text-xs text-slate-100">
              {activeCard.data.def}
            </div>
            {activeCard.data.sentence && (
              <div className="mt-3 text-[11px] text-slate-300">
                <span className="italic">
                  {activeCard.data.sentence}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 移动端：知识卡片 Bottom Sheet */}
      {activeCard && (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-slate-800/80 bg-slate-950/95 px-4 pb-6 pt-4 shadow-[0_-20px_45px_rgba(15,23,42,0.9)] lg:hidden">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-50">
                {activeCard.trigger_word}
              </div>
              <button
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={hideCard}
              >
                收起
              </button>
            </div>
            {activeCard.data.ipa && (
              <div className="mb-1 text-xs text-slate-400">
                {activeCard.data.ipa}
              </div>
            )}
            <div className="text-sm text-slate-100">
              {activeCard.data.def}
            </div>
            {activeCard.data.sentence && (
              <div className="mt-2 text-xs text-slate-400">
                {activeCard.data.sentence}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
