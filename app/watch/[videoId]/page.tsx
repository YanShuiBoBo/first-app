'use client';

import React, { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { Stream, type StreamPlayerApi } from '@cloudflare/stream-react';
import { usePlayerStore } from '@/lib/store/player-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

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
  view_count?: number | null;
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
  const [trialEnded, setTrialEnded] = useState(false);
  const [maskChinese, setMaskChinese] = useState(false);
  const [likedSubtitles, setLikedSubtitles] = useState<Set<number>>(
    () => new Set()
  );
  const [cardPopover, setCardPopover] = useState<{
    card: KnowledgeCard;
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const isTrial = searchParams?.get('trial') === '1';
  const TRIAL_LIMIT_SECONDS = 6 * 60;

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
        // { video: {..., view_count?}, subtitles: [...], knowledge_cards: [{trigger_word, data}, ...] }
        const result = data as {
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
            view_count?: number | null;
          };
          subtitles: SubtitleItem[] | null;
          knowledge_cards: KnowledgeCard[] | null;
        };

        const { video, subtitles, knowledge_cards } = result;

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
          view_count: video.view_count ?? 0,
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

  // 记录视频点击量（不依赖登录，只要进入精读页就算一次点击）
  useEffect(() => {
    if (!supabase || !videoId) return;

    const client = supabase;
    const cfId = videoId;

    const incrementView = async () => {
      try {
        await client.rpc('increment_video_view', {
          p_cf_video_id: cfId
        });
      } catch (err) {
        console.error('记录视频点击量失败:', err);
      }
    };

    void incrementView();
  }, [supabase, videoId]);

  // 播放器状态 - Hooks必须在条件返回之前调用
  const {
    currentTime,
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

    const subtitles = videoData.subtitles;
    let time = streamRef.current.currentTime;

    // 先读取当前句索引和循环开关，再根据“旧索引”判断是否需要回到句首
    const { sentenceLoop: loopOn, currentSubtitleIndex: idx } =
      usePlayerStore.getState();

    // 试看模式：超过限制时间后强制暂停，并标记试看结束
    if (isTrial && !trialEnded && time >= TRIAL_LIMIT_SECONDS) {
      streamRef.current.pause();
      setTrialEnded(true);
      time = TRIAL_LIMIT_SECONDS;
    }

    // 试看结束后不再做单句循环等逻辑，直接锁定在限制时间
    if (isTrial && trialEnded) {
      if (time > TRIAL_LIMIT_SECONDS) {
        streamRef.current.currentTime = TRIAL_LIMIT_SECONDS;
        time = TRIAL_LIMIT_SECONDS;
      }
      setCurrentTime(time);
      setCurrentSubtitle(subtitles, time);
      return;
    }

    if (loopOn) {
      const current = subtitles[idx];
      if (current) {
        // 预留一个稍大的阈值，避免移动端 onTimeUpdate 触发不够频繁导致错过判定点
        const nearEnd = time >= current.end - 0.15;
        if (nearEnd) {
          streamRef.current.currentTime = current.start;
          time = current.start;
        }
      }
    }

    setCurrentTime(time);
    setCurrentSubtitle(subtitles, time);
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

    // 试看已结束：不允许继续播放
    if (isTrial && trialEnded) return;
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

    // 试看已结束：不允许再通过点击句子跳转
    if (isTrial && trialEnded) return;

    const subtitle = videoData.subtitles[index];

    // 试看模式：不允许跳转到试看范围之外
    if (isTrial && subtitle.start >= TRIAL_LIMIT_SECONDS) {
      return;
    }
    // 跳转到当前句子的开始时间
    streamRef.current.currentTime = subtitle.start;
    jumpToSubtitle(index);
  };

  // 高亮单词点击事件（桌面端：气泡；移动端：Bottom Sheet）
  const handleWordClick = (word: string, target?: HTMLElement | null) => {
    if (!videoData?.cards) return;

    const lower = word.toLowerCase();
    const card = videoData.cards.find(
      item => item.trigger_word.toLowerCase() === lower
    );
    if (!card) return;

    // 始终更新全局 activeCard，用于知识卡片列表和移动端 bottom sheet
    showCard(card);

    if (!target || typeof window === 'undefined') {
      return;
    }

    // 移动端直接用 bottom sheet，不使用悬浮气泡
    if (window.innerWidth < 1024) {
      setCardPopover(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const bubbleWidth = 260;
    const bubbleHeight = 140;
    const margin = 16;

    // 默认在单词下方
    let top = rect.bottom + 8;
    let placement: 'top' | 'bottom' = 'bottom';

    // 若接近底部，则在上方展示
    if (rect.bottom + bubbleHeight + margin > viewportHeight) {
      top = rect.top - bubbleHeight - 8;
      placement = 'top';
    }

    // 水平居中对齐单词，再根据左右边缘做修正
    let left = rect.left + rect.width / 2 - bubbleWidth / 2;

    if (left + bubbleWidth + margin > viewportWidth) {
      left = viewportWidth - bubbleWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    setCardPopover({
      card,
      top,
      left,
      placement
    });
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  // 上一句 / 下一句
  const handlePrevSentence = () => {
    if (!videoData?.subtitles) return;
    const prevIndex = Math.max(currentSubtitleIndex - 1, 0);
    if (prevIndex === currentSubtitleIndex) return;
    handleSubtitleClick(prevIndex);
  };

  const handleNextSentence = () => {
    if (!videoData?.subtitles) return;
    const nextIndex = Math.min(
      currentSubtitleIndex + 1,
      videoData.subtitles.length - 1
    );
    if (nextIndex === currentSubtitleIndex) return;
    handleSubtitleClick(nextIndex);
  };

  // 行内工具栏：重听当前句
  const handleRowReplay = (index: number) => {
    if (!streamRef.current) return;
    handleSubtitleClick(index);
    // 试看结束后不再自动播放
    if (isTrial && trialEnded) return;
    void streamRef.current.play();
  };

  // 行内工具栏：单句循环并跳转到该句
  const handleRowLoop = (index: number) => {
    if (!videoData?.subtitles || !streamRef.current) return;

    // 试看结束后不允许再操作
    if (isTrial && trialEnded) return;

    const subtitle = videoData.subtitles[index];

    // 试看模式：不允许跳转到试看范围之外
    if (isTrial && subtitle.start >= TRIAL_LIMIT_SECONDS) {
      return;
    }

    const { sentenceLoop: loopOn, currentSubtitleIndex: currentIndex } =
      usePlayerStore.getState();

    // 跳转到当前句子的开始时间
    streamRef.current.currentTime = subtitle.start;
    jumpToSubtitle(index);

    // 逻辑：
    // - 若当前已经在单句循环且再次点击的是同一行，则关闭单句循环；
    // - 若当前不是单句循环，则打开单句循环；
    // - 若当前是单句循环但点击的是另一行，则保持单句循环，只是切换句子。
    if (loopOn && currentIndex === index) {
      toggleSentenceLoop();
    } else if (!loopOn) {
      toggleSentenceLoop();
    }
  };

  // 行内工具栏：跟读（跳到句首并暂停，留给用户自己朗读）
  const handleRowMic = (index: number) => {
    if (!videoData?.subtitles || !streamRef.current) return;
    handleSubtitleClick(index);
    // 试看结束后不再变更播放状态
    if (isTrial && trialEnded) return;
    streamRef.current.pause();
  };

  // 行内工具栏：收藏 / 取消收藏（本地状态，后续可接入后端）
  const handleToggleLike = (index: number) => {
    setLikedSubtitles(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // 将当前高亮句滚动到可视区域中间
  const scrollToCurrentSubtitle = () => {
    if (!subtitlesContainerRef.current) return;
    const container = subtitlesContainerRef.current;
    const activeEl = subtitleItemRefs.current[currentSubtitleIndex];
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    const offset = elRect.top - containerRect.top;
    const target =
      container.scrollTop +
      offset -
      containerRect.height / 2 +
      elRect.height / 2;

    container.scrollTo({
      top: target,
      behavior: 'smooth'
    });
  };

  // 导出脚本：简单复制到剪贴板
  // 导出 / 打印脚本：打开新窗口，提供「中/英/中英」三种模式和打印按钮
  const handleExportTranscript = async () => {
    if (!videoData?.subtitles?.length || typeof window === 'undefined') return;

    try {
      const escapeHtml = (text: string) =>
        text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const rowsHtml = videoData.subtitles
        .map(sub => {
          const timeLabel = formatDuration(sub.start);
          return `
            <div class="item">
              <div class="time">[${timeLabel}]</div>
              <div class="line-en">${escapeHtml(sub.text_en)}</div>
              <div class="line-cn">${escapeHtml(sub.text_cn)}</div>
            </div>
          `;
        })
        .join('\n');

      const title = escapeHtml(videoData.title || '精读字幕');

      const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title} - 打印字幕</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 16px 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        background: #f8f8f8;
        color: #111827;
      }
      #toolbar {
        position: sticky;
        top: 0;
        padding: 12px 0 16px;
        margin-bottom: 8px;
        background: #f8f8f8;
      }
      #toolbar h1 {
        margin: 0 0 8px;
        font-size: 16px;
        font-weight: 600;
      }
      #toolbar .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
      }
      #toolbar button {
        border-radius: 999px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        padding: 6px 12px;
        cursor: pointer;
      }
      #toolbar button.mode-active {
        border-color: #ff2442;
        background: #ffe7ec;
        color: #ff2442;
      }
      #toolbar button#print-btn {
        border-color: #ff2442;
        background: #ff2442;
        color: #ffffff;
      }
      .subtitle-list {
        margin-top: 4px;
      }
      .item {
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
        page-break-inside: avoid;
      }
      .time {
        font-size: 11px;
        color: #9ca3af;
        margin-bottom: 2px;
      }
      .line-en {
        font-size: 13px;
        color: #111827;
        margin-bottom: 2px;
      }
      .line-cn {
        font-size: 12px;
        color: #4b5563;
      }

      body.mode-en .line-cn { display: none; }
      body.mode-cn .line-en { display: none; }

      @media print {
        #toolbar { display: none; }
        body {
          background: #ffffff;
          padding: 0 16px;
        }
      }
    </style>
  </head>
  <body class="mode-both">
    <div id="toolbar">
      <h1>打印字幕 - ${title}</h1>
      <div class="buttons">
        <button id="btn-both" class="mode-active" type="button">中 / 英</button>
        <button id="btn-en" type="button">英</button>
        <button id="btn-cn" type="button">中</button>
        <button id="print-btn" type="button">🖨 打印</button>
      </div>
    </div>
    <div class="subtitle-list">
      ${rowsHtml}
    </div>
    <script>
      (function () {
        var body = document.body;
        var btnBoth = document.getElementById('btn-both');
        var btnEn = document.getElementById('btn-en');
        var btnCn = document.getElementById('btn-cn');
        var btnPrint = document.getElementById('print-btn');

        function setMode(mode) {
          body.classList.remove('mode-both', 'mode-en', 'mode-cn');
          body.classList.add('mode-' + mode);
          btnBoth.classList.remove('mode-active');
          btnEn.classList.remove('mode-active');
          btnCn.classList.remove('mode-active');
          if (mode === 'both') btnBoth.classList.add('mode-active');
          if (mode === 'en') btnEn.classList.add('mode-active');
          if (mode === 'cn') btnCn.classList.add('mode-active');
        }

        btnBoth.addEventListener('click', function () { setMode('both'); });
        btnEn.addEventListener('click', function () { setMode('en'); });
        btnCn.addEventListener('click', function () { setMode('cn'); });
        btnPrint.addEventListener('click', function () { window.print(); });
      })();
    </script>
  </body>
</html>`;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        console.error('无法打开打印窗口');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    } catch (err) {
      console.error('导出脚本失败:', err);
    }
  };

  // 点击页面空白处关闭桌面端知识卡片气泡
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('[data-card-popover="true"]')) {
        return;
      }

      setCardPopover(null);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleClickOutside);
      return () => {
        window.removeEventListener('click', handleClickOutside);
      };
    }

    return undefined;
  }, []);

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
      // 底部包含：固定播放器控制条 (~70px) + 可能出现的知识卡片 bottom sheet
      const overlaysHeight = activeCard ? 260 : 140;
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
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F8] text-gray-700">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FF2442]/30 border-t-[#FF2442]" />
          <p className="text-sm text-gray-500">正在加载精读内容...</p>
        </div>
      </div>
    );
  }

  if (error || !videoData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F8] text-gray-900">
        <div className="rounded-2xl border border-red-100 bg-white px-6 py-5 text-center text-sm shadow-sm shadow-red-100/60">
          <p className="mb-2 text-base font-semibold">获取视频数据失败</p>
          <p className="text-xs text-gray-500">{error || '未知错误'}</p>
        </div>
      </div>
    );
  }

  const activeSubtitle =
    videoData.subtitles[currentSubtitleIndex] ?? null;

  const currentTimeLabel = formatDuration(currentTime);
  const totalTimeLabel = formatDuration(videoData.duration ?? 0);

  return (
    <div className="relative flex min-h-screen flex-col bg-[#F8F8F8] text-gray-900">
      {/* 左上角返回首页 */}
      <Link
        href="/"
        className="fixed left-4 top-4 z-30 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs text-gray-700 shadow-sm hover:border-gray-300 hover:bg-white"
      >
        <span className="text-lg leading-none">←</span>
        <span>返回首页</span>
      </Link>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 pb-24 pt-16 lg:pb-10 lg:pt-20">
        <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-start">
          {/* 左侧：全能学习台 THE STATION */}
          <section className="flex w-full flex-col lg:w-[70%] lg:max-w-[960px]">
            <div
              ref={videoRef}
              className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
            >
              {/* Layer 1: Header（桌面端显示） */}
              <div className="hidden h-14 items-center justify-between border-b border-gray-100 px-6 sm:flex">
                <div className="flex flex-col overflow-hidden">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {videoData.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                    {videoData.tags &&
                      videoData.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="rounded-full bg-gray-100 px-2 py-0.5"
                        >
                          #{tag}
                        </span>
                      ))}
                    {videoData.difficulty && (
                      <span className="rounded-full bg-[#FFF0F2] px-2 py-0.5 text-[#FF2442]">
                        Level {videoData.difficulty}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden text-[11px] text-gray-400 md:flex md:flex-col md:items-end">
                  <span>时长 {formatDuration(videoData.duration)}</span>
                  <span className="mt-0.5">
                    已学习 {videoData.view_count ?? 0} 次
                  </span>
                </div>
              </div>

              {/* Layer 2: 视频区域 */}
              {/* 使用稳定的 16:9 容器，避免加载前后高度变化 */}
              <div className="bg-black">
                <div className="relative aspect-video w-full">
                  {!isPlayerReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <div className="flex flex-col items-center gap-3 text-xs text-gray-300">
                        <div className="h-10 w-10 animate-pulse rounded-full bg-gray-700" />
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
                    preload="auto"
                    onLoadedData={handlePlayerLoaded}
                    onPlay={handlePlay}
                    onPause={handlePause}
                  />
                </div>
              </div>

              {/* Layer 3: 播放控制栏（桌面端） */}
              <div className="hidden h-14 items-center justify-between border-t border-gray-100 px-6 text-xs text-gray-600 lg:flex">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                    {currentTimeLabel} / {totalTimeLabel}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200"
                    onClick={handlePrevSentence}
                    disabled={isTrial && trialEnded}
                  >
                    <span className="text-base leading-none">⏮</span>
                    <span>上一句</span>
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF2442] text-white shadow-md shadow-[#FF2442]/40"
                    onClick={handleTogglePlay}
                    disabled={isTrial && trialEnded}
                  >
                    <span className="text-lg leading-none">
                      {isPlaying ? '⏸' : '▶'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200"
                    onClick={handleNextSentence}
                    disabled={isTrial && trialEnded}
                  >
                    <span>下一句</span>
                    <span className="text-base leading-none">⏭</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 hover:bg-gray-200"
                    onClick={handleChangeSpeed}
                    disabled={isTrial && trialEnded}
                  >
                    <span className="text-[11px] text-gray-500">倍速</span>
                    <span className="text-xs font-medium text-gray-800">
                      {playbackRate.toFixed(2).replace(/\.00$/, '')}x
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                      sentenceLoop
                        ? 'bg-[#FF2442]/10 text-[#FF2442]'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                    onClick={toggleSentenceLoop}
                    disabled={isTrial && trialEnded}
                  >
                    <span className="text-sm leading-none">🔂</span>
                    <span>{sentenceLoop ? '单句循环' : '连续播放'}</span>
                  </button>
                </div>
              </div>

              {/* Layer 4: 当前句放大面板（桌面端） */}
              {/* 使用较紧凑的最小高度，减少整体占用，让整块内容尽量压缩在视口内 */}
              <div className="hidden min-h-[6rem] flex-col justify-center gap-2 border-t border-gray-100 bg-gray-50/80 px-8 py-3 lg:flex">
                {activeSubtitle ? (
                  <>
                    <div className="text-[15px] font-semibold text-gray-900">
                      {activeSubtitle.text_en}
                    </div>
                    <div
                      className={`text-sm text-gray-600 ${
                        maskChinese ? 'blur-sm opacity-70' : ''
                      }`}
                    >
                      {activeSubtitle.text_cn}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-600">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm hover:bg-gray-50"
                        onClick={() => handleRowReplay(currentSubtitleIndex)}
                        disabled={isTrial && trialEnded}
                      >
                        <span>🔊</span>
                        <span>重听</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm hover:bg-gray-50"
                        onClick={() => handleRowMic(currentSubtitleIndex)}
                        disabled={isTrial && trialEnded}
                      >
                        <span>🎤</span>
                        <span>跟读</span>
                      </button>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 shadow-sm ${
                          sentenceLoop
                            ? 'bg-[#FF2442]/10 text-[#FF2442]'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => handleRowLoop(currentSubtitleIndex)}
                        disabled={isTrial && trialEnded}
                      >
                        <span>🔂</span>
                        <span>循环</span>
                      </button>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 shadow-sm ${
                          likedSubtitles.has(currentSubtitleIndex)
                            ? 'bg-[#FF2442]/10 text-[#FF2442]'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => handleToggleLike(currentSubtitleIndex)}
                      >
                        <span>❤️</span>
                        <span>收藏</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400">
                    开始播放后，这里会放大显示当前句子。
                  </div>
                )}
              </div>
            </div>

            {/* 移动端：视频下方的基础信息 */}
            <div className="mt-3 flex flex-col gap-2 text-xs text-gray-500 lg:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-white px-2 py-1">
                  ⏱ {formatDuration(videoData.duration)}
                </span>
                <span className="inline-flex items-center rounded-full bg-white px-2 py-1">
                  🔥 已学习 {videoData.view_count ?? 0} 次
                </span>
              </div>
              {videoData.description && (
                <p className="text-[12px] leading-relaxed text-gray-600">
                  {videoData.description}
                </p>
              )}
            </div>
          </section>

          {/* 右侧：交互式课本 THE LIST */}
          <aside className="mt-4 flex w-full flex-col lg:mt-0 lg:w-[30%]">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:max-h-[calc(100vh-180px)]">
              {/* 顶部工具栏（Sticky） */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 text-xs text-gray-500">
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium text-gray-900">
                    交互式课本
                  </span>
                  <span className="mt-0.5 text-[11px] text-gray-400">
                    共 {videoData.subtitles.length} 句 · 点击句子即可跳转
                  </span>
                </div>
                <div className="ml-3 flex flex-col items-end gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:bg-gray-50"
                    onClick={handleExportTranscript}
                  >
                    <span>🖨️</span>
                    <span>打印</span>
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
                      maskChinese
                        ? 'border-[#FF2442]/40 bg-[#FF2442]/5 text-[#FF2442]'
                        : 'border-gray-200 bg-white text-gray-500'
                    }`}
                    onClick={() => setMaskChinese(v => !v)}
                  >
                    <span>👁️</span>
                    <span>遮罩: {maskChinese ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>

              {/* 字幕列表 */}
              <div
                ref={subtitlesContainerRef}
                className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
              >
                {videoData.subtitles.map((subtitle, index) => {
                  const isActive = currentSubtitleIndex === index;
                  const words = subtitle.text_en.split(' ');

                  const baseCardClasses =
                    'relative cursor-pointer rounded-xl border px-3 py-2 transition-all';
                  const stateClasses = isActive
                    ? 'border-[#FF2442] bg-red-50'
                    : 'border-transparent bg-white hover:border-gray-200 hover:bg-gray-50';

                  const toolbarDesktopClasses =
                    'mt-2 hidden flex-nowrap items-center gap-1 text-[11px] text-gray-500 lg:flex';
                  const toolbarMobileClasses = `mt-2 items-center gap-2 text-[11px] text-gray-500 lg:hidden ${
                    isActive ? 'flex' : 'hidden'
                  }`;

                  return (
                    <div
                      key={index}
                      ref={el => {
                        subtitleItemRefs.current[index] = el;
                      }}
                      className={`${baseCardClasses} ${stateClasses}`}
                      onClick={() => handleSubtitleClick(index)}
                    >
                      {isActive && (
                        <div className="absolute inset-y-2 left-0 w-1 rounded-full bg-[#FF2442]" />
                      )}

                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>{formatDuration(subtitle.start)}</span>
                        {likedSubtitles.has(index) && (
                          <span className="text-[#FF2442]">❤️</span>
                        )}
                      </div>

                      <div className="mt-0.5 text-[13px] font-medium text-gray-800">
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
                                className="cursor-pointer text-[#FF2442] underline-offset-2 hover:underline"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleWordClick(
                                    cleanedWord,
                                    e.currentTarget as HTMLElement
                                  );
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

                      <div
                        className={`mt-0.5 text-[12px] text-gray-500 ${
                          maskChinese ? 'blur-sm opacity-70' : ''
                        }`}
                      >
                        {subtitle.text_cn}
                      </div>

                      {/* 工具栏：桌面端所有行显示（仅图标，弱化存在感） */}
                      <div className={toolbarDesktopClasses}>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-[13px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="重听"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowReplay(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <span>🔊</span>
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-[13px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="跟读"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowMic(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <span>🎤</span>
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                            sentenceLoop && isActive
                              ? 'bg-[#FF2442]/10 text-[#FF2442]'
                              : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                          }`}
                          title="单句循环"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowLoop(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <span>🔂</span>
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                            likedSubtitles.has(index)
                              ? 'bg-[#FF2442]/10 text-[#FF2442]'
                              : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                          }`}
                          title="收藏"
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleLike(index);
                          }}
                        >
                          <span>❤️</span>
                        </button>
                      </div>

                      {/* 工具栏：移动端仅当前行展开（仅图标） */}
                      <div className={toolbarMobileClasses}>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-[13px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="重听"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowReplay(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <span>🔊</span>
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-[13px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="跟读"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowMic(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <span>🎤</span>
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                            sentenceLoop && isActive
                              ? 'bg-[#FF2442]/10 text-[#FF2442]'
                              : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                          }`}
                          title="单句循环"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowLoop(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <span>🔂</span>
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                            likedSubtitles.has(index)
                              ? 'bg-[#FF2442]/10 text-[#FF2442]'
                              : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                          }`}
                          title="收藏"
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleLike(index);
                          }}
                        >
                          <span>❤️</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </aside>
        </div>
      </main>

      {/* 桌面端：知识卡片气泡 Popover */}
      {cardPopover && (
        <div
          className="pointer-events-none fixed inset-0 z-40 hidden lg:block"
          // 背景层不拦截点击，只用来承载绝对定位的气泡
        >
          <div
            data-card-popover="true"
            className="pointer-events-auto absolute w-[260px] rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-xs text-gray-800 shadow-lg shadow-black/20"
            style={{
              top: cardPopover.top,
              left: cardPopover.left
            }}
          >
            {/* 小三角 */}
            <div
              className={`absolute h-2 w-2 rotate-45 border border-gray-200 bg-white ${
                cardPopover.placement === 'bottom'
                  ? 'left-1/2 -translate-x-1/2 -top-1 border-b-0 border-r-0'
                  : 'left-1/2 -translate-x-1/2 -bottom-1 border-t-0 border-l-0'
              }`}
            />
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">
                {cardPopover.card.trigger_word}
              </span>
              {cardPopover.card.data.type && (
                <span className="rounded-full bg-[#FF2442]/5 px-2 py-[2px] text-[10px] text-[#FF2442]">
                  {cardPopover.card.data.type}
                </span>
              )}
            </div>
            {cardPopover.card.data.ipa && (
              <div className="mb-1 text-[11px] text-gray-500">
                {cardPopover.card.data.ipa}
              </div>
            )}
            <div className="text-[11px] leading-relaxed text-gray-800">
              {cardPopover.card.data.def}
            </div>
            {cardPopover.card.data.sentence && (
              <div className="mt-2 text-[11px] text-gray-500">
                {cardPopover.card.data.sentence}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 移动端：知识卡片 Bottom Sheet */}
      {activeCard && (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-gray-200 bg-white px-4 pb-6 pt-4 shadow-[0_-18px_40px_rgba(0,0,0,0.18)] lg:hidden">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                {activeCard.trigger_word}
              </div>
              <button
                className="text-xs text-gray-400 hover:text-gray-700"
                onClick={hideCard}
              >
                收起
              </button>
            </div>
            {activeCard.data.ipa && (
              <div className="mb-1 text-xs text-gray-500">
                {activeCard.data.ipa}
              </div>
            )}
            <div className="text-sm text-gray-800">
              {activeCard.data.def}
            </div>
            {activeCard.data.sentence && (
              <div className="mt-2 text-xs text-gray-500">
                {activeCard.data.sentence}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 移动端：底部播放器控制条 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white px-4 py-2.5 text-xs text-gray-600 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            句子 {currentSubtitleIndex + 1}/{videoData.subtitles.length} ·{' '}
            {sentenceLoop ? '单句循环' : '连续播放'}
          </span>
          <span className="text-[11px] text-gray-400">
            {currentTimeLabel} / {totalTimeLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-[11px] ${
              maskChinese
                ? 'text-[#FF2442]'
                : 'text-gray-600 hover:text-[#FF2442]'
            }`}
            onClick={() => setMaskChinese(v => !v)}
          >
            <span className="text-base leading-none">👁️</span>
            <span className="ml-1">遮罩</span>
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            onClick={handlePrevSentence}
            disabled={isTrial && trialEnded}
          >
            ⏮
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF2442] text-white shadow-md shadow-[#FF2442]/40"
            onClick={handleTogglePlay}
            disabled={isTrial && trialEnded}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            onClick={handleNextSentence}
            disabled={isTrial && trialEnded}
          >
            ⏭
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[11px] text-gray-600 hover:text-[#FF2442]"
            onClick={scrollToCurrentSubtitle}
          >
            <span className="text-base leading-none">🔁</span>
            <span className="ml-1">列表</span>
          </button>
        </div>
      </div>

      {/* 试看结束提示遮罩 */}
      {isTrial && trialEnded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6 text-center text-sm text-gray-800">
          <div className="max-w-xs rounded-2xl bg-white p-4 shadow-xl shadow-black/20">
            <h2 className="mb-2 text-base font-semibold text-gray-900">
              6 分钟试看已结束
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              想解锁完整精读、无限次回看和全部知识卡片，请使用激活码注册后登录。
            </p>
            <div className="flex flex-col gap-2 text-xs">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full rounded-full bg-[#FF2442] px-3 py-2 font-medium text-white shadow-sm shadow-[#FF2442]/40 hover:bg-[#ff4a61]"
              >
                去登录 / 注册
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full rounded-full border border-gray-200 px-3 py-2 text-gray-700 hover:border-gray-300 hover:text-gray-900"
              >
                回到首页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
