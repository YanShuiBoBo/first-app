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
    // 卡片类型与后端保持一致
    // word           单词
    // phrase         短语
    // phrasal_verb   短语动词
    // expression     惯用表达
    // spoken_pattern 口语句式
    // idiom          习语 / 俚语
    // slang          俚语（兼容老数据）
    // proper_noun    专有名词
    type?:
      | 'word'
      | 'phrase'
      | 'phrasal_verb'
      | 'expression'
      | 'spoken_pattern'
      | 'idiom'
      | 'slang'
      | 'proper_noun';
  };
}

// 不同类型卡片在气泡中展示的中文标签
const getCardTypeLabel = (
  type: KnowledgeCard['data']['type'] | undefined
): string | null => {
  switch (type) {
    case 'word':
      return '单词';
    case 'phrase':
      return '短语';
    case 'phrasal_verb':
      return '短语动词';
    case 'expression':
      return '惯用表达';
    case 'spoken_pattern':
      return '口语句式';
    case 'idiom':
    case 'slang':
      return '习语 / 俚语';
    case 'proper_noun':
      return '专有名词';
    default:
      return null;
  }
};

// 不同类型卡片在字幕中的高亮样式（Xiaohongshu 风格）
const getHighlightClassNames = (
  type: KnowledgeCard['data']['type'] | undefined
): string => {
  switch (type) {
    // 1. 单词：深蓝色 + 加粗
    case 'word':
      return 'cursor-pointer font-semibold text-[#1D4ED8] hover:text-[#1E40AF]';
    // 2. 短语：浅蓝色背景
    case 'phrase':
      return 'cursor-pointer rounded bg-blue-50 px-1 text-[#1D4ED8] hover:bg-blue-100';
    // 3. 短语动词：绿色 + 下划线
    case 'phrasal_verb':
      return 'cursor-pointer text-[#16A34A] underline underline-offset-2 hover:text-[#15803D]';
    // 4. 惯用表达：橙色边框 / 背景
    case 'expression':
      return 'cursor-pointer rounded border border-orange-300 bg-orange-50 px-1 text-[#C05621] hover:bg-orange-100';
    // 5. 口语句式：紫色斜体
    case 'spoken_pattern':
      return 'cursor-pointer italic text-[#7C3AED] hover:text-[#6D28D9]';
    // 6. 习语 / 俚语：红色 + 波浪下划线（使用 inline style 做波浪）
    case 'idiom':
    case 'slang':
      return 'cursor-pointer text-[#FF2442]';
    // 7. 专有名词：灰色背景
    case 'proper_noun':
      return 'cursor-pointer rounded bg-gray-100 px-1 text-gray-800 hover:bg-gray-200';
    // 默认：红色下划线（兼容旧数据）
    default:
      return 'cursor-pointer text-[#FF2442] underline-offset-2 hover:underline';
  }
};

// 部分类型需要额外的 inline style（例如习语的波浪下划线）
const getHighlightInlineStyle = (
  type: KnowledgeCard['data']['type'] | undefined
): React.CSSProperties | undefined => {
  if (type === 'idiom' || type === 'slang') {
    return { textDecoration: 'underline wavy #FF2442' };
  }
  return undefined;
};

// 内部结构：一段文本要么是普通文本，要么关联到某个卡片
interface HighlightSegment {
  text: string;
  card?: KnowledgeCard;
}

// 工具函数：判断是否为“单词边界”字符
const isWordBoundaryChar = (ch: string): boolean => {
  // 字母 / 数字以外的都视为边界（空格、标点等）
  return !/[A-Za-z0-9]/.test(ch);
};

// 根据整句英文字幕 + 全部卡片，计算出不重叠的高亮片段
// 支持多词短语 / 短语动词：优先选择“更长的匹配”
const buildHighlightSegments = (
  text: string,
  cards: KnowledgeCard[]
): HighlightSegment[] => {
  if (!text || cards.length === 0) {
    return [{ text }];
  }

  const lowerText = text.toLowerCase();

  type Match = { start: number; end: number; card: KnowledgeCard };
  const matches: Match[] = [];

  for (const card of cards) {
    const rawKeyword = card.trigger_word?.trim();
    if (!rawKeyword) continue;

    const keyword = rawKeyword.toLowerCase();
    if (!keyword.length) continue;

    const isWordLike =
      !card.data.type || card.data.type === 'word' || card.data.type === 'proper_noun';

    let searchStart = 0;
    while (searchStart <= lowerText.length - keyword.length) {
      const idx = lowerText.indexOf(keyword, searchStart);
      if (idx === -1) break;

      const start = idx;
      const end = idx + keyword.length;

      if (isWordLike) {
        const before = start === 0 ? ' ' : lowerText[start - 1];
        const after = end >= lowerText.length ? ' ' : lowerText[end];
        if (!isWordBoundaryChar(before) || !isWordBoundaryChar(after)) {
          searchStart = idx + 1;
          continue;
        }
      }

      matches.push({ start, end, card });
      searchStart = idx + keyword.length;
    }
  }

  if (matches.length === 0) {
    return [{ text }];
  }

  // 按起始位置 + 长度（长的优先）排序，然后去除重叠
  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    return lenB - lenA;
  });

  const nonOverlapping: Match[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  nonOverlapping.forEach((m, index) => {
    if (cursor < m.start) {
      segments.push({ text: text.slice(cursor, m.start) });
    }
    segments.push({
      text: text.slice(m.start, m.end),
      card: m.card
    });
    cursor = m.end;

    // 结束时添加尾部文本
    if (index === nonOverlapping.length - 1 && cursor < text.length) {
      segments.push({ text: text.slice(cursor) });
    }
  });

  return segments;
};

// 简单线性图标，使用 currentColor 作为颜色，尽量做到“一眼能懂”
const IconReplay: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    {/* 外圈圆形 */}
    <circle cx="8" cy="8" r="5.2" />
    {/* 播放三角形，使用填充保证小尺寸下也清晰可见 */}
    <path d="M6.2 5.4L10 8 6.2 10.6Z" fill="currentColor" stroke="none" />
  </svg>
);

const IconMic: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    <rect x="5.2" y="2.2" width="5.6" height="6.6" rx="2.8" />
    <path d="M4.2 7.6V8a3.8 3.8 0 007.6 0v-.4" strokeLinecap="round" />
    <path d="M8 11.4V13.5" strokeLinecap="round" />
    <path d="M6.4 13.5h3.2" strokeLinecap="round" />
  </svg>
);

const IconLoop: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 1024 1024" fill="currentColor" {...props}>
    <path d="M935.005091 459.752727a34.909091 34.909091 0 1 1 49.361454 49.361455l-78.382545 78.382545a34.816 34.816 0 0 1-49.338182 0l-78.405818-78.382545a34.909091 34.909091 0 1 1 49.361455-49.361455l14.801454 14.824728C818.525091 311.738182 678.330182 186.181818 508.928 186.181818c-130.466909 0-250.484364 76.706909-305.710545 195.397818a34.932364 34.932364 0 0 1-63.301819-29.463272C206.522182 208.896 351.418182 116.363636 508.904727 116.363636c210.152727 0 383.534545 159.953455 404.992 364.474182l21.085091-21.085091z m-73.960727 189.021091a34.932364 34.932364 0 0 1 16.965818 46.382546C811.310545 838.353455 666.461091 930.909091 508.951273 930.909091c-210.106182 0-383.534545-159.953455-404.968728-364.497455l-21.108363 21.108364a34.909091 34.909091 0 1 1-49.384727-49.361455l78.42909-78.42909a34.909091 34.909091 0 0 1 49.338182 0l78.382546 78.42909a34.909091 34.909091 0 1 1-49.338182 49.338182l-14.824727-14.801454C199.354182 735.534545 339.549091 861.090909 508.951273 861.090909c130.490182 0 250.507636-76.706909 305.710545-195.397818a34.909091 34.909091 0 0 1 46.382546-16.919273z" />
  </svg>
);

const IconLike: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 1024 1024" fill="currentColor" {...props}>
    <path d="M518.4 149.290667c112.597333-80.789333 267.882667-69.397333 368.128 32 53.866667 54.528 84.138667 128.853333 84.138667 206.378666 0 77.525333-30.293333 151.850667-84.096 206.336l-294.421334 299.52a110.976 110.976 0 0 1-80.213333 34.474667 110.72 110.72 0 0 1-79.914667-34.176L137.322667 593.770667C83.562667 539.242667 53.333333 464.981333 53.333333 387.541333s30.229333-151.722667 84.010667-206.272c100.224-101.376 255.530667-112.768 368.128-31.978666l6.442667 4.778666 6.485333-4.778666z m322.602667 76.970666c-84.629333-85.589333-219.157333-88.64-307.328-6.954666l-21.76 20.138666-21.717334-20.138666c-88.192-81.685333-222.72-78.634667-307.306666 6.933333-41.92 42.496-65.557333 100.608-65.557334 161.28 0 60.693333 23.637333 118.805333 65.6 161.344l295.04 300.416c9.045333 9.450667 21.269333 14.72 33.962667 14.72 12.693333 0 24.917333-5.269333 34.261333-15.04L840.96 549.077333c42.005333-42.496 65.685333-100.650667 65.685333-161.408 0-60.736-23.68-118.912-65.664-161.408z" />
  </svg>
);

const IconEye: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    <path
      d="M2 8s2.2-3.6 6-3.6S14 8 14 8s-2.2 3.6-6 3.6S2 8 2 8z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="8" r="1.8" />
  </svg>
);

const IconList: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    <path d="M3 4h10" strokeLinecap="round" />
    <path d="M3 8h10" strokeLinecap="round" />
    <path d="M3 12h10" strokeLinecap="round" />
  </svg>
);

const IconPrev: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    <path d="M5.5 3.5v9" strokeLinecap="round" />
    <path d="M11 12.5L7.5 8 11 3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconNext: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    <path d="M10.5 3.5v9" strokeLinecap="round" />
    <path d="M5 12.5L8.5 8 5 3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPlay: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M5.8 4.1L11.2 8 5.8 11.9Z" />
  </svg>
);

const IconPause: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <rect x="4.4" y="3.5" width="2.2" height="9" rx="0.6" />
    <rect x="9.4" y="3.5" width="2.2" height="9" rx="0.6" />
  </svg>
);

const IconPrint: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 1024 1024" fill="currentColor" {...props}>
    <path d="M341.333333 640v170.666667h384v-170.666667H341.333333z m-42.666666 42.666667H170.666667V341.333333h128V170.666667h469.333333v170.666666h128v341.333334h-128v170.666666H298.666667v-170.666666z m42.666666-298.666667H213.333333v256h42.666667v-42.666667h554.666667v42.666667h42.666666V384H341.333333z m0-42.666667h384V213.333333H341.333333v128z m-85.333333 85.333334h128v42.666666H256v-42.666666z" />
  </svg>
);

// 知识卡片音标旁的线型播放图标（小号扬声器风格）
const IconSound: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
    <path
      d="M3.5 6.2H2.8A1.3 1.3 0 001.5 7.5v1A1.3 1.3 0 002.8 9.8h.7L6 12.5V3.5L3.5 6.2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 5.3c.7.5 1.1 1.2 1.1 2s-.4 1.5-1.1 2"
      strokeLinecap="round"
    />
    <path
      d="M11.1 3.8C12.1 4.7 12.7 6 12.7 7.3s-.6 2.6-1.6 3.5"
      strokeLinecap="round"
    />
  </svg>
);

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
  const [scriptMode, setScriptMode] = useState<'both' | 'en' | 'cn'>('both');
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
  const ttsVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

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

  // 播放知识卡片的单词 / 触发词（浏览器自带 TTS）
  const playCardAudio = (card: KnowledgeCard) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    const text = card.trigger_word || card.data.sentence || '';
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);

    // 尝试复用之前选择的英文语音
    if (ttsVoiceRef.current) {
      utterance.voice = ttsVoiceRef.current;
    } else {
      const voices = window.speechSynthesis.getVoices();
      const enVoice =
        voices.find(v => v.lang.startsWith('en')) ||
        voices.find(v => v.lang.toLowerCase().includes('en'));
      if (enVoice) {
        ttsVoiceRef.current = enVoice;
        utterance.voice = enVoice;
      }
    }

    utterance.rate = 0.9;
    utterance.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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

    // 计算“有效可视高度”用于视觉居中：桌面直接用容器高度，移动端考虑底部控制条等遮挡
    let visibleHeight = containerRect.height;

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      const viewportHeight = window.innerHeight;
      const overlaysHeight = activeCard ? 260 : 140; // 底部控制条 + 可能出现的知识卡片 bottom sheet
      visibleHeight = Math.max(viewportHeight - containerRect.top - overlaysHeight, 1);
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
      // 底部包含：固定播放器控制条 (~70px)，这里不再根据知识卡片状态改变高度，
      // 避免点击高亮词弹出卡片时强制滚动回当前播放句
      const overlaysHeight = 140;
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
  }, [currentSubtitleIndex]);

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
              {/* 使用稳定的 16:9 容器，吸顶展示，避免滑动就看不到视频 */}
              <div className="bg-black sticky top-0 z-20">
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
                      {buildHighlightSegments(
                        activeSubtitle.text_en,
                        videoData.cards ?? []
                      ).map((segment, segIndex) => {
                        if (!segment.card) {
                          return (
                            <span key={segIndex}>{segment.text}</span>
                          );
                        }

                        const type = segment.card.data.type;
                        return (
                          <span
                            key={segIndex}
                            className={getHighlightClassNames(type)}
                            style={getHighlightInlineStyle(type)}
                            onClick={e => {
                              e.stopPropagation();
                              handleWordClick(
                                segment.card!.trigger_word,
                                e.currentTarget as HTMLElement
                              );
                            }}
                          >
                            {segment.text}
                          </span>
                        );
                      })}
                    </div>
                    <div
                      className={`text-sm ${
                        maskChinese
                          ? 'text-transparent bg-gray-200/90 rounded-[4px] px-2 py-0.5'
                          : 'text-gray-600'
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
                        <IconReplay className="h-4 w-4" />
                        <span>重听</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm hover:bg-gray-50"
                        onClick={() => handleRowMic(currentSubtitleIndex)}
                        disabled={isTrial && trialEnded}
                      >
                        <IconMic className="h-4 w-4" />
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
                        <IconLoop className="h-4 w-4" />
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
                        <IconLike className="h-4 w-4" />
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
                <div className="ml-3 flex items-center gap-2">
                  <button
                      type="button"
                      className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10px] text-gray-400 hover:border-[#FF2442]/50"
                      onClick={() =>
                          setScriptMode(prev =>
                              prev === 'both' ? 'en' : prev === 'en' ? 'cn' : 'both'
                          )
                      }
                      aria-label="切换脚本显示语言"
                  >
                    <span
                        className={`px-0.5 ${
                            scriptMode === 'cn'
                                ? 'text-[#FF2442] font-medium'
                                : 'text-gray-400'
                        }`}
                    >
                      中
                    </span>
                    <span className="px-0.5 text-gray-300">|</span>
                    <span
                        className={`px-0.5 ${
                            scriptMode === 'en'
                                ? 'text-[#FF2442] font-medium'
                                : 'text-gray-400'
                        }`}
                    >
                      英
                    </span>
                    <span className="px-0.5 text-gray-300">|</span>
                    <span
                        className={`px-0.5 ${
                            scriptMode === 'both'
                                ? 'text-[#FF2442] font-medium'
                                : 'text-gray-400'
                        }`}
                    >
                      中/英
                    </span>
                  </button>
                  {/* 打印按钮：线性图标，无文字 */}
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-[#FF2442]"
                    onClick={handleExportTranscript}
                    aria-label="打印字幕"
                  >
                    <IconPrint className="h-4 w-4" />
                  </button>
                  {/* 语言切换按钮：中 | 英 | 中/英 文本分段，根据 scriptMode 高亮 */}
                </div>
              </div>

              {/* 字幕列表 */}
              <div
                ref={subtitlesContainerRef}
                className="flex-1 max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3 text-sm"
              >
                {videoData.subtitles.map((subtitle, index) => {
                  const isActive = currentSubtitleIndex === index;

                  const baseCardClasses =
                    'relative cursor-pointer rounded-xl border px-3 py-2 transition-all';
                  const stateClasses = isActive
                    ? 'border-[#FF2442] bg-red-50'
                    : 'border-transparent bg-white hover:border-gray-200 hover:bg-gray-50';

                  const toolbarDesktopClasses =
                    'mt-2 hidden flex-nowrap items-center gap-2 text-[11px] text-gray-500 lg:flex';
                  // 移动端不再在每行下方展示工具栏，统一放到底部控制条
                  const toolbarMobileClasses = 'hidden lg:hidden';

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

                      {/* 英文行：根据 scriptMode 控制显示 */}
                      {(scriptMode === 'both' || scriptMode === 'en') && (
                        <div className="mt-0.5 text-[13px] font-medium text-gray-800">
                          {buildHighlightSegments(
                            subtitle.text_en,
                            videoData.cards ?? []
                          ).map((segment, segIndex) => {
                            if (!segment.card) {
                              return (
                                <span key={segIndex}>{segment.text}</span>
                              );
                            }

                            const type = segment.card.data.type;
                            return (
                              <span
                                key={segIndex}
                                className={getHighlightClassNames(type)}
                                style={getHighlightInlineStyle(type)}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleWordClick(
                                    segment.card!.trigger_word,
                                    e.currentTarget as HTMLElement
                                  );
                                }}
                              >
                                {segment.text}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* 中文行：根据 scriptMode 控制显示 */}
                      {(scriptMode === 'both' || scriptMode === 'cn') && (
                        <div className="mt-0.5 text-[12px] text-gray-500">
                          {subtitle.text_cn}
                        </div>
                      )}

                      {/* 工具栏：桌面端所有行显示（仅图标，弱化存在感） */}
                      <div className={toolbarDesktopClasses}>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center text-[13px] text-gray-400 hover:text-gray-600"
                          title="重听"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowReplay(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <IconReplay className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center text-[13px] text-gray-400 hover:text-gray-600"
                          title="跟读"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowMic(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <IconMic className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-5 w-5 items-center justify-center text-[13px] ${
                            sentenceLoop && isActive
                              ? 'text-[#FF2442]'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                          title="单句循环"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowLoop(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <IconLoop className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-5 w-5 items-center justify-center text-[13px] ${
                            likedSubtitles.has(index)
                              ? 'text-[#FF2442]'
                              : 'text-gray-300 hover:text-gray-500'
                          }`}
                          title="收藏"
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleLike(index);
                          }}
                        >
                          <IconLike className="h-4 w-4" />
                        </button>
                      </div>

                      {/* 工具栏：移动端仅当前行展开（仅图标） */}
                      <div className={toolbarMobileClasses}>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center text-[13px] text-gray-400 hover:text-gray-600"
                          title="重听"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowReplay(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <IconReplay className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center text-[13px] text-gray-400 hover:text-gray-600"
                          title="跟读"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowMic(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <IconMic className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-5 w-5 items-center justify-center text-[13px] ${
                            sentenceLoop && isActive
                              ? 'text-[#FF2442]'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                          title="单句循环"
                          onClick={e => {
                            e.stopPropagation();
                            handleRowLoop(index);
                          }}
                          disabled={isTrial && trialEnded}
                        >
                          <IconLoop className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-5 w-5 items-center justify-center text-[13px] ${
                            likedSubtitles.has(index)
                              ? 'text-[#FF2442]'
                              : 'text-gray-300 hover:text-gray-500'
                          }`}
                          title="收藏"
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleLike(index);
                          }}
                        >
                          <IconLike className="h-4 w-4" />
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
              {getCardTypeLabel(cardPopover.card.data.type) && (
                <span className="rounded-full bg-[#FF2442]/5 px-2 py-[2px] text-[10px] text-[#FF2442]">
                  {getCardTypeLabel(cardPopover.card.data.type)}
                </span>
              )}
            </div>
            {cardPopover.card.data.ipa && (
              <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
                <span>{cardPopover.card.data.ipa}</span>
                <button
                  type="button"
                  className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-[#FF2442]"
                  onClick={e => {
                    e.stopPropagation();
                    playCardAudio(cardPopover.card);
                  }}
                  aria-label="播放单词读音"
                >
                  <IconSound className="h-3.5 w-3.5" />
                </button>
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
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>{activeCard.data.ipa}</span>
                <button
                  type="button"
                  className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-[#FF2442]"
                  onClick={() => playCardAudio(activeCard)}
                  aria-label="播放单词读音"
                >
                  <IconSound className="h-4 w-4" />
                </button>
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
        {/* 顶部：字幕相关操作（重听 / 跟读 / 循环 / 收藏） */}
        {videoData.subtitles.length > 0 && (
          <div className="mb-2 flex items-center justify-between text-[11px] text-gray-500">
            <button
              type="button"
              className="inline-flex flex-1 flex-col items-center justify-center"
              onClick={() => handleRowReplay(currentSubtitleIndex)}
              disabled={isTrial && trialEnded}
            >
              <IconReplay className="h-4 w-4 text-gray-500" />
              <span className="mt-0.5 text-[10px] text-gray-500">重听</span>
            </button>
            <button
              type="button"
              className="inline-flex flex-1 flex-col items-center justify-center"
              onClick={() => handleRowMic(currentSubtitleIndex)}
              disabled={isTrial && trialEnded}
            >
              <IconMic className="h-4 w-4 text-gray-500" />
              <span className="mt-0.5 text-[10px] text-gray-500">跟读</span>
            </button>
            <button
              type="button"
              className="inline-flex flex-1 flex-col items-center justify-center"
              onClick={() => handleRowLoop(currentSubtitleIndex)}
              disabled={isTrial && trialEnded}
            >
              <IconLoop
                className={`h-4 w-4 ${
                  sentenceLoop ? 'text-[#FF2442]' : 'text-gray-500'
                }`}
              />
              <span
                className={`mt-0.5 text-[10px] ${
                  sentenceLoop ? 'text-[#FF2442]' : 'text-gray-500'
                }`}
              >
                循环
              </span>
            </button>
            <button
              type="button"
              className="inline-flex flex-1 flex-col items-center justify-center"
              onClick={() => handleToggleLike(currentSubtitleIndex)}
            >
              <IconLike
                className={`h-4 w-4 ${
                  likedSubtitles.has(currentSubtitleIndex)
                    ? 'text-[#FF2442]'
                    : 'text-gray-400'
                }`}
              />
              <span
                className={`mt-0.5 text-[10px] ${
                  likedSubtitles.has(currentSubtitleIndex)
                    ? 'text-[#FF2442]'
                    : 'text-gray-500'
                }`}
              >
                收藏
              </span>
            </button>
          </div>
        )}

        {/* 底部：播放控制区域 */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              maskChinese
                ? 'bg-[#FF2442]/10 text-[#FF2442]'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-[#FF2442]'
            }`}
            onClick={() => setMaskChinese(v => !v)}
            aria-label="遮罩中文"
          >
            <IconEye className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            onClick={handlePrevSentence}
            disabled={isTrial && trialEnded}
            aria-label="上一句"
          >
            <IconPrev className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF2442] text-white shadow-md shadow-[#FF2442]/40"
            onClick={handleTogglePlay}
            disabled={isTrial && trialEnded}
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <IconPause className="h-4 w-4" />
            ) : (
              <IconPlay className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            onClick={handleNextSentence}
            disabled={isTrial && trialEnded}
            aria-label="下一句"
          >
            <IconNext className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-[#FF2442]"
            onClick={scrollToCurrentSubtitle}
            aria-label="回到当前句列表位置"
          >
            <IconList className="h-4 w-4" />
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
