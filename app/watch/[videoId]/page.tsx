'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stream, type StreamPlayerApi } from '@cloudflare/stream-react';
import { usePlayerStore } from '@/lib/store/player-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import type {
  VocabItem,
  VocabStatus
} from '@/components/watch/VocabPanel';

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

// 根据当前时间在字幕列表中查找句子索引（与全局 store 的 setCurrentSubtitle 保持一致）
const findSubtitleIndex = (subtitles: SubtitleItem[], time: number): number => {
  if (!subtitles || subtitles.length === 0) {
    return 0;
  }

  let left = 0;
  let right = subtitles.length - 1;
  let currentIndex = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const sub = subtitles[mid];

    if (time >= sub.start && time < sub.end) {
      currentIndex = mid;
      break;
    } else if (time < sub.start) {
      right = mid - 1;
    } else {
      left = mid + 1;
      currentIndex = mid;
    }
  }

  return currentIndex;
};

// 定义知识卡片类型
interface KnowledgeCard {
  trigger_word: string;
  data: {
    // 统一 headword（原形），如果缺失则前端回退到 trigger_word
    headword?: string;
    ipa?: string;
    def: string;
    sentence?: string;
    pos?: string;
    collocations?: string[];
    synonyms?: string[];
    difficulty_level?: string;
    structure?: string;
    register?: string;
    paraphrase?: string;
    function_label?: string;
    scenario?: string;
    source?: {
      sentence_en?: string;
      sentence_cn?: string;
      timestamp_start?: number;
      timestamp_end?: number;
    };
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

// 不同类型卡片在字幕中的高亮样式（Creamy 荧光笔风格，对齐 HTML demo 的 .hl / .hl-p / .hl-y）
const getHighlightClassNames = (
  type: KnowledgeCard['data']['type'] | undefined
): string => {
  switch (type) {
    case 'word':
    case 'proper_noun':
      // 单词/专有名词：紫色荧光标记
      return 'hl hl-p';
    case 'phrase':
    case 'phrasal_verb':
      // 短语/动词短语：粉色荧光标记
      return 'hl hl-y';
    case 'expression':
    case 'spoken_pattern':
    case 'idiom':
    case 'slang':
      // 惯用表达/口语句式/习语：默认使用粉色荧光
      return 'hl hl-y';
    // 默认：紫色荧光
    default:
      return 'hl hl-p';
  }
};

// 高亮不再使用额外的 inline style，下划线等效果全部交给 CSS 控制，保持和 HTML demo 一致
const getHighlightInlineStyle = (
  type: KnowledgeCard['data']['type'] | undefined
): React.CSSProperties | undefined => {
  return undefined;
};

// 统一从知识卡里抽取 headword 的 key（小写），用于生词状态映射
const getHeadwordKey = (card: KnowledgeCard): string => {
  const headword =
    card.data.headword?.trim() ||
    card.trigger_word?.trim() ||
    '';
  return headword.toLowerCase();
};

// 内部结构：一段文本要么是普通文本，要么关联到某个卡片
interface HighlightSegment {
  text: string;
  card?: KnowledgeCard;
}

// 生词本 / 知识卡展示用的归一化类型
type NormalizedVocabKind = 'word' | 'phrase' | 'expression';

interface NormalizedKnowledge {
  kind: NormalizedVocabKind;
  headword: string;
  ipa?: string;
  pos?: string;
  def: string;
  collocations?: string[];
  synonyms?: string[];
  structure?: string;
  register?: string;
  paraphrase?: string;
  functionLabel?: string;
  scenario?: string;
  sourceSentenceEn?: string;
  sourceSentenceCn?: string;
  timestampStart?: number;
  timestampEnd?: number;
}

// 将更细粒度的后端 type（word/phrase/phrasal_verb/expression/...）
// 归一到前端使用的 3 种分类：单词 / 短语 / 表达
const mapCardTypeToKind = (
  type: KnowledgeCard['data']['type'] | undefined
): NormalizedVocabKind => {
  switch (type) {
    case 'phrase':
    case 'phrasal_verb':
      return 'phrase';
    case 'expression':
    case 'spoken_pattern':
    case 'idiom':
    case 'slang':
      return 'expression';
    case 'word':
    case 'proper_noun':
    default:
      return 'word';
  }
};

// 把后端 KnowledgeCard 规范化成前端展示所需的信息结构
const normalizeKnowledgeForDisplay = (
  card: KnowledgeCard,
  subtitles?: SubtitleItem[]
): NormalizedKnowledge => {
  const kind = mapCardTypeToKind(card.data.type);

  const headword =
    card.data.headword?.trim() ||
    card.trigger_word?.trim() ||
    '';

  const ipa = card.data.ipa?.trim() || undefined;
  const pos = card.data.pos?.trim() || undefined;
  const def =
    card.data.def?.trim() ||
    card.data.paraphrase?.trim() ||
    '';

  // 语境句：优先使用 data.source.sentence_en/sentence_cn，其次回退到 data.sentence，
  // 最后再从字幕中推断第一次出现该词的整句。
  let sentenceEn =
    card.data.source?.sentence_en?.trim() ||
    card.data.sentence?.trim() ||
    undefined;
  let sentenceCn =
    card.data.source?.sentence_cn?.trim() || undefined;

  let tsStart =
    card.data.source?.timestamp_start ?? undefined;
  let tsEnd =
    card.data.source?.timestamp_end ?? undefined;

  if (
    (!sentenceEn || typeof tsStart !== 'number' || !Number.isFinite(tsStart)) &&
    subtitles &&
    subtitles.length > 0 &&
    headword
  ) {
    const keyword = headword.toLowerCase();
    const hit = subtitles.find(sub =>
      sub.text_en.toLowerCase().includes(keyword)
    );
    if (hit) {
      if (!sentenceEn) {
        sentenceEn = hit.text_en;
      }
      if (!sentenceCn) {
        sentenceCn = hit.text_cn;
      }
      if (typeof tsStart !== 'number' || !Number.isFinite(tsStart)) {
        tsStart = hit.start;
      }
      if (typeof tsEnd !== 'number' || !Number.isFinite(tsEnd)) {
        tsEnd = hit.end;
      }
    }
  }

  const normalizeStringArray = (
    value: unknown,
    maxItems: number
  ): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of value) {
      const text = String(raw).trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
      if (result.length >= maxItems) break;
    }
    return result.length > 0 ? result : undefined;
  };

  const collocations = normalizeStringArray(
    card.data.collocations,
    3
  );
  const synonyms = normalizeStringArray(
    card.data.synonyms,
    3
  );

  const structure = card.data.structure?.trim() || undefined;
  const register = card.data.register?.trim() || undefined;
  const paraphrase = card.data.paraphrase?.trim() || undefined;
  const functionLabel =
    card.data.function_label?.trim() || undefined;
  const scenario = card.data.scenario?.trim() || undefined;

  return {
    kind,
    headword,
    ipa,
    pos,
    def,
    collocations,
    synonyms,
    structure,
    register,
    paraphrase,
    functionLabel,
    scenario,
    sourceSentenceEn: sentenceEn,
    sourceSentenceCn: sentenceCn,
    timestampStart: tsStart,
    timestampEnd: tsEnd
  };
};

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

    // 只要触发词本身是“单个英文/数字单词”，无论类型是什么，都按完整单词匹配，
    // 避免出现 "yo" 高亮到 "you" 这种子串误匹配
    const isSingleToken = /^[a-z0-9]+$/i.test(keyword);

    let searchStart = 0;
    while (searchStart <= lowerText.length - keyword.length) {
      const idx = lowerText.indexOf(keyword, searchStart);
      if (idx === -1) break;

      const start = idx;
      const end = idx + keyword.length;

      if (isSingleToken) {
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

// 单句循环图标（桌面端和部分位置使用）：细线条风格
const IconLoop: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconLike: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 1024 1024" fill="currentColor" {...props}>
    <path d="M518.4 149.290667c112.597333-80.789333 267.882667-69.397333 368.128 32 53.866667 54.528 84.138667 128.853333 84.138667 206.378666 0 77.525333-30.293333 151.850667-84.096 206.336l-294.421334 299.52a110.976 110.976 0 0 1-80.213333 34.474667 110.72 110.72 0 0 1-79.914667-34.176L137.322667 593.770667C83.562667 539.242667 53.333333 464.981333 53.333333 387.541333s30.229333-151.722667 84.010667-206.272c100.224-101.376 255.530667-112.768 368.128-31.978666l6.442667 4.778666 6.485333-4.778666z m322.602667 76.970666c-84.629333-85.589333-219.157333-88.64-307.328-6.954666l-21.76 20.138666-21.717334-20.138666c-88.192-81.685333-222.72-78.634667-307.306666 6.933333-41.92 42.496-65.557333 100.608-65.557334 161.28 0 60.693333 23.637333 118.805333 65.6 161.344l295.04 300.416c9.045333 9.450667 21.269333 14.72 33.962667 14.72 12.693333 0 24.917333-5.269333 34.261333-15.04L840.96 549.077333c42.005333-42.496 65.685333-100.650667 65.685333-161.408 0-60.736-23.68-118.912-65.664-161.408z" />
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

// 返回箭头（左上角返回首页）
const IconArrowLeft: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path d="M9.5 3.5L5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.2 8H13" strokeLinecap="round" />
  </svg>
);

// 顶部更多菜单图标（三个水平圆点）
const IconMore: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <circle cx="3.5" cy="8" r="0.9" />
    <circle cx="8" cy="8" r="0.9" />
    <circle cx="12.5" cy="8" r="0.9" />
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

// 词汇清单图标：小书本 + 书签
const IconVocab: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    {...props}
  >
    <rect x="3" y="2.5" width="8.5" height="11" rx="1.2" />
    <path d="M5.2 4.3h4.1" strokeLinecap="round" />
    <path d="M5.2 6.1h4.1" strokeLinecap="round" />
    <path d="M5.2 7.9h2.6" strokeLinecap="round" />
    <path d="M11.5 3.2 13 2.5v7.3" />
  </svg>
);

// 底部悬浮岛专用图标：完全按 HTML demo 的 SVG 结构实现
const IslandLoopIcon: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const IslandMicIcon: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const IslandNotebookIcon: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IslandPlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IslandPauseIcon: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
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
  const [maskChinese] = useState(false);
  const [likedSubtitles, setLikedSubtitles] = useState<Set<number>>(
    () => new Set()
  );
  // 右侧面板 / 底部内容区模式：字幕流 or 生词流
  const [panelMode, setPanelMode] = useState<'transcript' | 'vocab'>(
    'transcript'
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
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [isLoopMenuOpen, setIsLoopMenuOpen] = useState(false);

  // 断点续播提示（本地缓存的上次观看时间）
  const [resumeSeconds, setResumeSeconds] = useState<number | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);

  // 词汇状态：按词汇 key 聚合全局「认识 / 不认识 / 未标记」状态
  const [vocabKindFilter, setVocabKindFilter] = useState<
    'all' | 'word' | 'phrase' | 'expression'
  >('all');
  const [vocabStatusMap, setVocabStatusMap] = useState<
    Record<string, VocabStatus>
  >({});

  // 影子跟读（Shadowing）相关状态
  // mode:
  // - idle：当前无跟读任务
  // - recording：正在录音
  // - reviewing：录音完成，可回放
  const [shadowMode, setShadowMode] = useState<
    'idle' | 'recording' | 'reviewing'
  >('idle');
  const [shadowSubtitleIndex, setShadowSubtitleIndex] = useState<number | null>(
    null
  );
  const [shadowAudioUrl, setShadowAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // 初始化登录状态（Phase 1 先不做强门禁，只同步一下本地登录信息）
  useEffect(() => {
    initialize();
  }, [initialize]);

  // 开始影子跟读录音
  const startShadowRecording = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // 基础能力检测：需要支持 getUserMedia + MediaRecorder
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      console.warn('当前浏览器不支持麦克风录音');
      setShadowMode('idle');
      return;
    }

    try {
      // 每次开始录音前清理旧的本地音频 URL，避免内存泄漏
      if (shadowAudioUrl) {
        URL.revokeObjectURL(shadowAudioUrl);
        setShadowAudioUrl(null);
      }

      // 主动暂停视频，避免录音时播放原声
      if (streamRef.current) {
        streamRef.current.pause();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      recordedChunksRef.current = [];

      mr.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mr.onstop = () => {
        try {
          const blob = new Blob(recordedChunksRef.current, {
            type: 'audio/webm'
          });
          const url = URL.createObjectURL(blob);
          setShadowAudioUrl(url);
          setShadowMode('reviewing');
        } catch (err) {
          console.error('生成本地录音失败:', err);
          setShadowMode('idle');
        }
      };

      mr.start();
      setShadowMode('recording');
    } catch (err) {
      console.error('获取麦克风权限失败:', err);
      setShadowMode('idle');
    }
  }, [shadowAudioUrl]);

  // 停止影子跟读录音
  const stopShadowRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    try {
      mr.stop();
      mr.stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('停止录音失败:', err);
    } finally {
      mediaRecorderRef.current = null;
    }
  }, []);

  // 组件卸载时清理录音资源
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream
            .getTracks()
            .forEach(track => track.stop());
        } catch {
          // ignore
        }
      }
      if (shadowAudioUrl) {
        URL.revokeObjectURL(shadowAudioUrl);
      }
    };
  }, [shadowAudioUrl]);

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

  // 计算当前视频真正用到的知识卡片 key（基于字幕高亮结果）
  const usedVocabKeys = useMemo(() => {
    if (!videoData?.subtitles || !videoData.cards) {
      return new Set<string>();
    }

    const used = new Set<string>();

    for (const subtitle of videoData.subtitles) {
      const segments = buildHighlightSegments(
        subtitle.text_en,
        videoData.cards
      );
      for (const seg of segments) {
        if (!seg.card) continue;
        const hw =
          seg.card.data.headword?.trim() ||
          seg.card.trigger_word?.trim() ||
          '';
        if (!hw) continue;
        used.add(hw.toLowerCase());
      }
    }

    return used;
  }, [videoData?.subtitles, videoData?.cards]);

  // 批量获取当前视频所有高亮词汇的全局状态：
  // - 已登录：从后端 user_vocab_status 表拉取
  // - 未登录：从 localStorage 中恢复（按「视频」维度隔离）
  useEffect(() => {
    const fetchVocabStatus = async () => {
      const words = Array.from(usedVocabKeys);
      if (words.length === 0) return;

      // 已登录用户：调用后端接口
      if (user?.email) {
        try {
          const res = await fetch('/api/vocab/status/check', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ words })
          });

          if (!res.ok) {
            // 静默失败，不阻塞 UI
            return;
          }

          const data = (await res.json()) as Record<
            string,
            'known' | 'unknown'
          >;

          setVocabStatusMap(prev => {
            const next = { ...prev };
            for (const w of words) {
            const status = data[w];
            if (status === 'known' || status === 'unknown') {
              next[w] = status;
            }
            }
            return next;
          });
        } catch (err) {
          console.error('获取词汇状态失败:', err);
        }
        return;
      }

      // 未登录用户：从本地存储恢复
      if (!videoData || typeof window === 'undefined') return;
      try {
        const storageKey = `immersive:vocab-status:${videoData.id}`;
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Record<string, 'known' | 'unknown'>;
        if (!parsed || typeof parsed !== 'object') return;

        setVocabStatusMap(prev => {
          const next = { ...prev };
          for (const w of words) {
            const key = w.toLowerCase();
            const status = parsed[key];
            if (status === 'known' || status === 'unknown') {
              next[key] = status;
            }
          }
          return next;
        });
      } catch (err) {
        console.error('读取本地生词状态失败:', err);
      }
    };

    if (!videoData?.cards || usedVocabKeys.size === 0) return;
    void fetchVocabStatus();
  }, [usedVocabKeys, videoData?.cards, videoData?.id, videoData, user?.email]);

  // 根据当前视频的 knowledge_cards 构建词汇项列表，并与全局状态合并
  const vocabItems: VocabItem[] = useMemo(() => {
    if (!videoData?.cards || videoData.cards.length === 0) return [];

    const items: VocabItem[] = [];
    const seen = new Set<string>();

    for (const card of videoData.cards) {
      const normalized = normalizeKnowledgeForDisplay(
        card,
        videoData.subtitles
      );

      const kind: VocabItem['kind'] = normalized.kind;
      const headword = normalized.headword;
      if (!headword) continue;

      const key = headword.toLowerCase();
      // 只保留本视频字幕中真正高亮过的词汇
      if (!usedVocabKeys.has(key)) continue;
      // 同一个 key 只保留一条，避免重复和 React key 冲突
      if (seen.has(key)) continue;
      seen.add(key);

      // 默认视为「认识」，只有明确点了“不认识”的词才进入生词本
      const status = vocabStatusMap[key] || 'known';
      // 只展示「不认识」的生词
      if (status !== 'unknown') {
        continue;
      }

      const source =
        normalized.sourceSentenceEn || normalized.sourceSentenceCn
          ? {
              sentence_en: normalized.sourceSentenceEn,
              sentence_cn: normalized.sourceSentenceCn,
              timestamp_start: normalized.timestampStart,
              timestamp_end: normalized.timestampEnd
            }
          : undefined;

      const item: VocabItem = {
        key,
        kind,
        headword,
        ipa: normalized.ipa,
        pos: normalized.pos,
        definition: normalized.def,
        collocations: normalized.collocations,
        synonyms: normalized.synonyms,
        structure: normalized.structure,
        register: normalized.register,
        paraphrase: normalized.paraphrase,
        scenario: normalized.scenario,
        functionLabel: normalized.functionLabel,
        source,
        status
      };

      items.push(item);
    }

    return items;
  }, [videoData?.cards, usedVocabKeys, vocabStatusMap]);

  // 未登录用户：在前端本地持久化当前视频的生词状态，便于刷新后恢复
  useEffect(() => {
    if (!videoData || user?.email || typeof window === 'undefined') {
      return;
    }

    try {
      const storageKey = `immersive:vocab-status:${videoData.id}`;
      const payload: Record<string, 'known' | 'unknown'> = {};
      for (const [key, status] of Object.entries(vocabStatusMap)) {
        if (status === 'known' || status === 'unknown') {
          payload[key] = status;
        }
      }
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.error('写入本地生词状态失败:', err);
    }
  }, [vocabStatusMap, videoData, user?.email]);

  // 工具函数：把当前本地时间格式化为 YYYY-MM-DD，避免使用 UTC 导致日期偏移
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 本地进度存储 key，按「用户 + 视频」区分
  const getProgressStorageKey = (videoIdValue: string, email?: string | null) =>
    `immersive:video-progress:${email || 'guest'}:${videoIdValue}`;

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

  // 断点续播：组件挂载时读取本地缓存的观看进度
  useEffect(() => {
    if (!videoData || typeof window === 'undefined') return;
    const storageKey = getProgressStorageKey(videoData.id, user?.email ?? null);

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { position?: number };
      const pos = typeof parsed.position === 'number' ? parsed.position : NaN;

      if (!Number.isFinite(pos)) return;

      // 过短的进度或接近结尾的进度都不提示
      const duration = videoData.duration ?? 0;
      if (pos <= 3 || (duration > 0 && pos >= duration - 3)) {
        return;
      }

      setResumeSeconds(pos);
      setShowResumeToast(true);
    } catch (err) {
      console.error('读取本地进度失败:', err);
    }
  }, [videoData, user?.email]);

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
    loopMode,
    loopCount,
    setCurrentTime,
    jumpToSubtitle,
    showCard,
    hideCard,
    setCurrentSubtitle,
    setPlaybackRate,
    toggleSentenceLoop,
    setLoopMode,
    setLoopCount
  } = usePlayerStore();

  // 本地记忆循环配置（模式 + 次数）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('ie-loop-config');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        mode?: 'infinite' | 'count';
        count?: number;
      };
      if (parsed.mode === 'infinite' || parsed.mode === 'count') {
        setLoopMode(parsed.mode);
      }
      if (
        typeof parsed.count === 'number' &&
        Number.isFinite(parsed.count) &&
        parsed.count > 0
      ) {
        setLoopCount(parsed.count);
      }
    } catch {
      // ignore
    }
  }, [setLoopMode, setLoopCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({
        mode: loopMode,
        count: loopCount
      });
      window.localStorage.setItem('ie-loop-config', payload);
    } catch {
      // ignore
    }
  }, [loopMode, loopCount]);

  // 每秒将当前播放进度写入 localStorage（L1 缓存）
  useEffect(() => {
    if (!videoData || typeof window === 'undefined') return;
    const storageKey = getProgressStorageKey(videoData.id, user?.email ?? null);

    const seconds = Math.floor(currentTime);
    if (!Number.isFinite(seconds) || seconds < 0) return;

    try {
      const payload = {
        position: seconds,
        updated_at: Date.now()
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.error('写入本地进度失败:', err);
    }
  }, [currentTime, videoData, user?.email]);

  // 当前句循环播放计数：使用 ref 避免频繁 setState 造成卡顿
  const currentRepeatCountRef = useRef(0);

  // 当前正在做「次数循环」的那一句索引，用于确保计数严格绑定到具体句子
  const loopSentenceIndexRef = useRef<number | null>(null);

  // 片段播放结束时间（用于生词本/知识卡片「回看原句」时的短片段播放）
  const snippetEndRef = useRef<number | null>(null);

  // 视频时间更新回调：同步到全局播放器状态，并根据时间计算当前字幕行
  const handleTimeUpdate = () => {
    if (!streamRef.current || !videoData?.subtitles) return;

    const subtitles = videoData.subtitles;
    let time = streamRef.current.currentTime;

    // 当前循环配置（不再依赖全局 currentSubtitleIndex，避免索引与时间错位）
    const {
      sentenceLoop: loopOn,
      loopMode: currentLoopMode,
      loopCount: targetLoopCount
    } = usePlayerStore.getState();

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

    // 若当前处于「片段播放」模式（点击生词本/知识卡回看原句），优先按照片段结束时间控制暂停，
    // 并跳过单句循环等额外逻辑，避免互相抢夺控制权导致卡顿。
    const snippetEnd = snippetEndRef.current;
    if (snippetEnd !== null) {
      if (time >= snippetEnd) {
        streamRef.current.pause();
        snippetEndRef.current = null;
      }
      setCurrentTime(time);
      setCurrentSubtitle(subtitles, time);
      return;
    }

    // 基于当前时间计算字幕索引，作为循环逻辑的唯一依据
    const idx = findSubtitleIndex(subtitles, time);
    if (loopOn) {
      // 循环调试日志：方便排查“跳到下一句又被重置回当前行”的问题
      console.log('[LOOP_DEBUG] base', {
        time,
        idx,
        mode: currentLoopMode,
        loopOn,
        loopSentenceIndex: loopSentenceIndexRef.current,
        repeatCount: currentRepeatCountRef.current,
        targetLoopCount
      });
    }

    if (loopOn && currentLoopMode === 'infinite') {
      const current = subtitles[idx];
      if (current) {
        const nearEnd = time >= current.end - 0.15;
        if (nearEnd) {
          // 影子跟读激活时，避免在录音 / 回放过程中强行跳句
          if (shadowMode !== 'idle') {
            setCurrentTime(time);
            setCurrentSubtitle(subtitles, time);
            return;
          }

          streamRef.current.currentTime = current.start;
          time = current.start;
        }
      }
    } else if (loopOn && currentLoopMode === 'count') {
      // 若尚未绑定循环句索引，则以当前时间对应的句子为起点；
      // 一旦绑定，在完成指定次数之前都不再随时间自动切换句子，避免“刚到下一句又被拉回”的抖动。
      let loopIdx = loopSentenceIndexRef.current;
      if (loopIdx === null) {
        loopIdx = idx;
        loopSentenceIndexRef.current = loopIdx;
        currentRepeatCountRef.current = 0;
        console.log('[LOOP_DEBUG] bind-loop-sentence', {
          time,
          idx,
          loopIdx,
          repeatCount: currentRepeatCountRef.current
        });
      }

      const current = subtitles[loopIdx];
      if (current) {
        const nearEnd = time >= current.end - 0.15;
        if (nearEnd) {
          console.log('[LOOP_DEBUG] near-end', {
            time,
            loopIdx,
            start: current.start,
            end: current.end,
            repeatCount: currentRepeatCountRef.current,
            targetLoopCount
          });

          // 影子跟读激活时，避免在录音 / 回放过程中强行跳句
          if (shadowMode !== 'idle') {
            setCurrentTime(time);
            setCurrentSubtitle(subtitles, time);
            return;
          }

          // 次数循环：记录当前句播放次数，达到目标后自动跳下一句
          const nextCount = currentRepeatCountRef.current + 1;
          const target = Math.max(1, targetLoopCount);

          if (nextCount < target) {
            // 还没到目标次数：回到句首继续循环
            currentRepeatCountRef.current = nextCount;
            streamRef.current.currentTime = current.start;
            time = current.start;
            console.log('[LOOP_DEBUG] repeat-current', {
              time,
              loopIdx,
              repeatCount: currentRepeatCountRef.current,
              targetLoopCount
            });
          } else {
            // 达到目标次数：重置计数并自动进入下一句
            currentRepeatCountRef.current = 0;
            const nextIndex = Math.min(
              loopIdx + 1,
              subtitles.length - 1
            );

            // 已是最后一句：保持停在句尾，并关闭循环
            if (nextIndex === loopIdx) {
              toggleSentenceLoop();
              loopSentenceIndexRef.current = null;
              console.log('[LOOP_DEBUG] reach-last-sentence-close-loop', {
                time,
                loopIdx
              });
              setCurrentTime(time);
              setCurrentSubtitle(subtitles, time);
              return;
            }

            const nextSubtitle = subtitles[nextIndex];
            streamRef.current.currentTime = nextSubtitle.start;
            time = nextSubtitle.start;
            loopSentenceIndexRef.current = nextIndex;
            jumpToSubtitle(nextIndex);
            console.log('[LOOP_DEBUG] move-to-next-sentence', {
              time,
              nextIndex,
              nextStart: nextSubtitle.start,
              targetLoopCount
            });
          }
        }
      }
    } else {
      // 未开启单句循环时，重置次数与绑定索引
      loopSentenceIndexRef.current = null;
      currentRepeatCountRef.current = 0;
    }

    setCurrentTime(time);

    // 高亮当前字幕：
    // - 非次数循环：仍然根据时间自动推断当前句；
    // - 次数循环：高亮永远锁定在 loopSentenceIndexRef 指向的那一句，
    //   避免在到达句尾瞬间高亮跳到下一句再被拉回，造成视觉抖动。
    if (loopOn && currentLoopMode === 'count') {
      const idxForHighlight =
        loopSentenceIndexRef.current !== null
          ? loopSentenceIndexRef.current
          : findSubtitleIndex(subtitles, time);
      jumpToSubtitle(idxForHighlight);
    } else {
      setCurrentSubtitle(subtitles, time);
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

    // 试看已结束：不允许继续播放
    if (isTrial && trialEnded) return;
    if (isPlaying) {
      streamRef.current.pause();
    } else {
      // play() 返回 Promise，忽略可能的自动播放策略报错
      void streamRef.current.play();
    }
  };

  // 可选倍速列表
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

  // 下拉框切换播放速度
  const handleSpeedSelect: React.ChangeEventHandler<HTMLSelectElement> = e => {
    const value = parseFloat(e.target.value);
    if (!Number.isFinite(value)) return;
    setPlaybackRate(value);
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

    // 手动切换句子时，重置影子跟读状态和循环计数
    setShadowMode('idle');
    setShadowSubtitleIndex(null);
    currentRepeatCountRef.current = 0;

    // 若当前处于「次数循环」模式下，手动点击某一句时，应把循环焦点切换到这一句，
    // 避免 handleTimeUpdate 再次把高亮和循环拉回到旧的句子。
    const {
      sentenceLoop: loopOn,
      loopMode: currentLoopMode
    } = usePlayerStore.getState();
    if (loopOn && currentLoopMode === 'count') {
      loopSentenceIndexRef.current = index;
    }

    // 跳转到当前句子的开始时间
    streamRef.current.currentTime = subtitle.start;
    jumpToSubtitle(index);
  };

  // 高亮单词点击事件（桌面端：气泡；移动端：Bottom Sheet）
  const handleWordClick = (word: string, target?: HTMLElement | null) => {
    if (!videoData?.cards) return;

    // 点击生词时先暂停视频，给用户留出标记和查看释义的时间
    if (streamRef.current) {
      streamRef.current.pause();
      setIsPlaying(false);
    }

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

  // 尝试使用视频原声播放知识卡对应的片段（作为 TTS 的兜底方案，尤其适配 App 内嵌浏览器）
  const playCardSnippet = (card: KnowledgeCard): boolean => {
    if (!streamRef.current || !videoData || !videoData.subtitles) {
      return false;
    }

    let start =
      card.data.source?.timestamp_start !== undefined
        ? card.data.source.timestamp_start
        : undefined;
    let end =
      card.data.source?.timestamp_end !== undefined
        ? card.data.source.timestamp_end
        : undefined;

    // 如果卡片数据里没有时间戳，则在字幕里尝试找到第一次出现该单词/短语的句子
    if (
      (typeof start !== 'number' ||
        !Number.isFinite(start) ||
        typeof end !== 'number' ||
        !Number.isFinite(end) ||
        end <= start) &&
      videoData.subtitles.length > 0
    ) {
      const keyword =
        card.data.headword?.trim().toLowerCase() ||
        card.trigger_word.trim().toLowerCase();

      if (keyword) {
        const hit = videoData.subtitles.find(sub =>
          sub.text_en.toLowerCase().includes(keyword)
        );
        if (hit) {
          start = hit.start;
          end = hit.end;
        }
      }
    }

    if (
      typeof start !== 'number' ||
      !Number.isFinite(start) ||
      typeof end !== 'number' ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      return false;
    }

    // 播放片段前，关闭单句循环、清空循环计数和影子跟读状态，避免互相抢控制权
    currentRepeatCountRef.current = 0;
    loopSentenceIndexRef.current = null;
    setShadowMode('idle');
    setShadowSubtitleIndex(null);
    const { sentenceLoop: loopOn } = usePlayerStore.getState();
    if (loopOn) {
      toggleSentenceLoop();
    }

    // 记录本次片段的结束时间，由 handleTimeUpdate 统一负责在到达时暂停
    snippetEndRef.current = end;

    const player = streamRef.current;
    player.currentTime = start;
    void player.play();
    return true;
  };

  // 播放知识卡片的单词 / 触发词
  // 优先使用浏览器自带 TTS；在不支持或失败时回退到视频原声片段，保证 App 内嵌浏览器也能发声
  const playCardAudio = (card: KnowledgeCard): boolean => {
    if (typeof window === 'undefined') {
      return playCardSnippet(card);
    }

    const hasSpeech =
      typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';

    const text = card.trigger_word || card.data.sentence || '';
    if (!hasSpeech || !text) {
      return playCardSnippet(card);
    }

    try {
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
      return true;
    } catch (err) {
      console.warn('调用浏览器 TTS 失败，回退到视频原声片段:', err);
      return playCardSnippet(card);
    }
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

  // 从 Toast 中恢复到上次观看进度（不自动播放，只跳转进度和高亮句子）
  const handleResumeFromToast = () => {
    if (resumeSeconds === null) return;

    const position = resumeSeconds;

    if (streamRef.current) {
      streamRef.current.currentTime = position;
    }

    if (videoData?.subtitles) {
      setCurrentTime(position);
      setCurrentSubtitle(videoData.subtitles, position);
    }

    setShowResumeToast(false);
  };

  // 词汇卡播放：优先回放原视频片段，缺失时间戳时退回到 TTS/原声兜底
  const handlePlayVocabClip = (item: VocabItem) => {
    // 先在当前知识卡集合中找到对应词条
    const card = videoData?.cards.find(c => {
      const headword =
        c.data.headword?.trim() || c.trigger_word?.trim() || '';
      return headword.toLowerCase() === item.key;
    });

    if (!card) return;

    const played = playCardSnippet(card);
    if (!played) {
      playCardAudio(card);
    }
  };

  // 单词本：更新某个词条的状态（认识 / 不认识）
  const handleUpdateVocabStatus = useCallback(
    (key: string, status: Exclude<VocabStatus, 'unmarked'>) => {
      setVocabStatusMap(prev => ({
        ...prev,
        [key]: status
      }));

      // 未登录用户只做本地更新（已由 useEffect 同步到 localStorage）
      if (!user?.email) {
        return;
      }

      // 已登录：携带上下文快照同步到后端
      const item = vocabItems.find(i => i.key === key);
      const context =
        item && videoData
          ? {
              video_id: videoData.id,
              sentence_en: item.source?.sentence_en,
              sentence_cn: item.source?.sentence_cn,
              timestamp_start: item.source?.timestamp_start,
              timestamp_end: item.source?.timestamp_end
            }
          : videoData
          ? { video_id: videoData.id }
          : undefined;

      void fetch('/api/vocab/status/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: key,
          status,
          context
        })
      }).catch(err => {
        console.error('更新词汇状态失败:', err);
      });
    },
    [user?.email, vocabItems, videoData]
  );

  // 单词本：一键将当前类型下所有「未标记」词标记为认识
  const handleMarkRestKnown = useCallback(() => {
    const unmarkedKeys = vocabItems
      .filter(item => item.status === 'unknown')
      .map(item => item.key);

    if (unmarkedKeys.length === 0) return;

    setVocabStatusMap(prev => {
      const next = { ...prev };
      for (const key of unmarkedKeys) {
        next[key] = 'known';
      }
      return next;
    });

    if (!user?.email || !videoData) {
      return;
    }

    const context = {
      video_id: videoData.id
    };

    void fetch('/api/vocab/status/batch-known', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: unmarkedKeys, context })
    }).catch(err => {
      console.error('批量标记词汇状态失败:', err);
    });
  }, [vocabItems, user?.email, videoData]);

  // 行内工具栏：重听当前句（播放原声）
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

    const {
      sentenceLoop: loopOn,
      currentSubtitleIndex: currentIndex
    } = usePlayerStore.getState();

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
      // 开启单句循环时，默认使用当前配置（无限 / 次数），并重置计数
      currentRepeatCountRef.current = 0;
      toggleSentenceLoop();
    }
  };

  // 行内工具栏：跟读（影子跟读入口）
  // 交互：
  // 1. 第一次点击麦克风：跳到该句开头并暂停，同时开始录音（按钮高亮，表示正在录制）
  // 2. 第二次点击同一句的麦克风：停止录音，按钮图标切换为“播放”形态
  // 3. 第三次点击同一句（此时为播放图标）：播放刚才录制的声音；播放结束后恢复为普通麦克风
  // 4. 点击其它句子、或通过上一句/下一句切换句子时，自动恢复为普通麦克风状态
  const handleRowMic = (index: number) => {
    if (!videoData?.subtitles || !streamRef.current) return;

    const subtitle = videoData.subtitles[index];

    // 试看结束后不再允许操作
    if (isTrial && trialEnded) return;

    // 试看模式：不允许跳转到试看范围之外
    if (isTrial && subtitle.start >= TRIAL_LIMIT_SECONDS) {
      return;
    }

    // 若当前就在同一句，并且正在录音：本次点击视为“结束录音”
    if (shadowSubtitleIndex === index && shadowMode === 'recording') {
      stopShadowRecording();
      return;
    }

    // 若当前就在同一句，并且已有录音（reviewing）：本次点击视为“播放录音”
    if (shadowSubtitleIndex === index && shadowMode === 'reviewing') {
      if (!shadowAudioUrl) return;
      const audio = new Audio(shadowAudioUrl);
      audio.onended = () => {
        // 播放结束后恢复为普通麦克风状态
        setShadowMode('idle');
        setShadowSubtitleIndex(null);
      };
      void audio.play();
      return;
    }

    // 其它情况：开始对当前句子进行新的录音
    // 精准跳回该句开头，并更新全局当前句 / 时间，再暂停，作为跟读起点
    streamRef.current.currentTime = subtitle.start;
    jumpToSubtitle(index);
    setCurrentTime(subtitle.start);
    streamRef.current.pause();

    setShadowSubtitleIndex(index);
    void startShadowRecording();
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
        <button id="print-btn" type="button">打印</button>
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
  // - 移动端：维持原来的 scrollIntoView 逻辑，体验已经比较自然
  // - 桌面端：改用手动计算 scrollTop 的方式，避免某些嵌套滚动容器里 scrollIntoView 失效
  // - 若当前句本来就接近中心，则不滚动，减少不必要的 DOM 操作和浏览器扩展的副作用
  useEffect(() => {
    // 仅在字幕视图下才执行自动滚动，避免生词视图下无意义的 DOM 操作
    if (panelMode !== 'transcript') return;

    const container = subtitlesContainerRef.current;
    const activeEl = subtitleItemRefs.current[currentSubtitleIndex];
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    const elCenter = elRect.top + elRect.height / 2;
    const containerCenter = containerRect.top + containerRect.height / 2;
    const delta = Math.abs(elCenter - containerCenter);

    // 若已经基本在可视区域中间（误差在 16px 内），就不再滚动，避免频繁跳动
    if (delta <= 16) {
      return;
    }

    const isDesktopView =
      typeof window !== 'undefined' && window.innerWidth >= 1024;

    if (isDesktopView) {
      // 桌面端：手动计算目标 scrollTop，兼容更多浏览器 / WebView 的滚动行为
      try {
        const offset = elRect.top - containerRect.top;
        const target =
          container.scrollTop +
          offset -
          containerRect.height / 2 +
          elRect.height / 2;

        container.scrollTo({
          top: target,
          behavior: 'auto'
        });
      } catch {
        // 兜底到 scrollIntoView，避免极端环境下完全不滚动
        try {
          activeEl.scrollIntoView({
            block: 'center',
            behavior: 'auto'
          });
        } catch {
          // 忽略最终兜底中的错误
        }
      }
    } else {
      // 移动端：保留原本的 scrollIntoView 方案
      try {
        activeEl.scrollIntoView({
          block: 'center',
          behavior: 'auto'
        });
      } catch {
        // 若 scrollIntoView 抛错，再退回到手动滚动方案
        try {
          const offset = elRect.top - containerRect.top;
          const target =
            container.scrollTop +
            offset -
            containerRect.height / 2 +
            elRect.height / 2;

          container.scrollTo({
            top: target,
            behavior: 'auto'
          });
        } catch {
          // 忽略兜底过程中的错误，避免影响主流程
        }
      }
    }
  }, [currentSubtitleIndex, panelMode]);

  // 断点续播提示：自动在 5 秒后淡出
  useEffect(() => {
    if (!showResumeToast) return;
    if (typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      setShowResumeToast(false);
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showResumeToast]);

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

  // 根据当前语言模式控制“当前句放大面板”中英展示
  const showActiveEn = scriptMode === 'both' || scriptMode === 'en';
  const showActiveCn = scriptMode === 'both' || scriptMode === 'cn';

  const currentTimeLabel = formatDuration(currentTime);
  const totalTimeLabel = formatDuration(videoData.duration ?? 0);
  const deckProgressPercent =
    videoData.duration && videoData.duration > 0
      ? Math.min(
          100,
          Math.max(0, (currentTime / videoData.duration) * 100)
        )
      : 0;
  const resumeLabel =
    resumeSeconds !== null ? formatDuration(resumeSeconds) : '';
  const vocabUnknownCount = vocabItems.filter(
    item => item.status === 'unknown'
  ).length;

  return (
    <div className="relative flex h-screen min-h-screen flex-col overflow-hidden bg-[var(--bg-shell)] text-gray-900 lg:h-screen lg:overflow-hidden lg:bg-[var(--bg-body)]">
      {/* 桌面端顶部导航栏：移动端在视频上方单独实现 */}
      <header className="hidden h-11 items-center justify-between bg-white/95 px-6 text-xs text-gray-700 shadow-sm shadow-black/5 lg:fixed lg:inset-x-0 lg:top-0 lg:z-30 lg:flex">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          onClick={() => router.push('/')}
          aria-label="返回上一页"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="mx-2 flex-1 truncate text-center text-[13px] font-semibold text-gray-900">
          {videoData.title}
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
          aria-label="更多操作"
          // 预留：后续可接入打印脚本 / 查看完整简介 / 举报等功能
          onClick={() => {
            // 当前版本暂不弹出菜单，保持界面简洁
          }}
        >
          <IconMore className="h-3.5 w-3.5" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[414px] flex-1 flex-col px-0 pt-0 lg:max-w-[1600px] lg:px-4 lg:pb-10 lg:pt-20">
        <div className="flex flex-1 flex-col lg:gap-6 lg:flex-row lg:items-start">
          {/* 左侧：全能学习台 THE STATION */}
          <section className="flex w-full flex-col lg:w-[70%] lg:max-w-[960px]">
            <div
              ref={videoRef}
              // 注意：这里不要再加 overflow-hidden，否则会导致内部使用 position: sticky 的视频区域在移动端失效
              className="flex h-full flex-col rounded-2xl bg-[var(--bg-shell)] shadow-sm"
            >
              {/* Layer 1: Header（桌面端显示） */}
              {/*<div className="hidden h-14 items-center justify-between border-b border-gray-100 px-6 sm:flex">*/}
              {/*  <div className="flex flex-col overflow-hidden">*/}
              {/*    <div className="truncate text-sm font-semibold text-gray-900">*/}
              {/*      {videoData.title}*/}
              {/*    </div>*/}
              {/*    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">*/}
              {/*      {videoData.tags &&*/}
              {/*        videoData.tags.slice(0, 3).map(tag => (*/}
              {/*          <span*/}
              {/*            key={tag}*/}
              {/*            className="rounded-full bg-gray-100 px-2 py-0.5"*/}
              {/*          >*/}
              {/*            #{tag}*/}
              {/*          </span>*/}
              {/*        ))}*/}
              {/*      {videoData.difficulty && (*/}
              {/*        <span className="rounded-full bg-[#FFF0F2] px-2 py-0.5 text-[#FF2442]">*/}
              {/*          Level {videoData.difficulty}*/}
              {/*        </span>*/}
              {/*      )}*/}
              {/*    </div>*/}
              {/*  </div>*/}
              {/*  <div className="hidden text-[11px] text-gray-400 md:flex md:flex-col md:items-end">*/}
              {/*    <span>时长 {formatDuration(videoData.duration)}</span>*/}
              {/*    <span className="mt-0.5">*/}
              {/*      已学习 {videoData.view_count ?? 0} 次*/}
              {/*    </span>*/}
              {/*  </div>*/}
              {/*</div>*/}

              {/* Layer 2: 视频区域 */}
              {/* 移动端：视频固定在视口顶部并覆盖导航；桌面端：保持卡片内部吸顶体验 */}
              <div className="relative w-full">
                {/* 占位：在移动端预留 16:9 高度，避免下面内容被固定视频遮挡 */}
                <div className="aspect-video w-full lg:hidden" />

                {/* 真正的视频容器：小屏 fixed 顶部并占满宽度，大屏正常随内容滚动 */}
                <div className="fixed inset-x-0 top-0 z-20 lg:static lg:inset-auto lg:top-auto lg:z-auto">
                  <div className="mx-auto w-full max-w-[414px] px-0 lg:max-w-[1600px] lg:px-0">
                    <div className="relative aspect-video w-full overflow-hidden bg-black lg:rounded-2xl lg:shadow-lg lg:shadow-black/25">
                      {/* 移动端顶部导航：覆盖在视频之上，避免占用额外垂直空间 */}
                      <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-4 text-xs text-white lg:hidden">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/40"
                          onClick={() => router.push('/')}
                          aria-label="回到首页"
                        >
                          <IconArrowLeft className="h-3.5 w-3.5" />
                        </button>
                        <div className="mx-2 flex-1 truncate text-center text-[13px] font-semibold">
                          {videoData.title}
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/40"
                          aria-label="更多操作"
                          onClick={() => {
                            // 预留：后续接入打印脚本 / 查看完整简介 / 举报等
                          }}
                        >
                          <IconMore className="h-3.5 w-3.5" />
                        </button>
                      </div>

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
                </div>
              </div>

              {/* Layer 3：播放控制 & 工具面板（桌面端） */}
              <div className="hidden w-full pt-1.5 lg:block">
                <div className="bg-white rounded-3xl border border-stone-100 shadow-[0_6px_24px_rgba(0,0,0,0.04)] px-3.5 py-3 flex items-center justify-between">
                  {/* 左侧播放控制积木 */}
                  <div className="flex items-center gap-2">
                    {/* 播放键 */}
                    <button
                      type="button"
                      className="h-11 w-14 bg-stone-900 text-white rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shadow-stone-200"
                      onClick={handleTogglePlay}
                      disabled={isTrial && trialEnded}
                      aria-label={isPlaying ? '暂停' : '播放'}
                    >
                      {isPlaying ? (
                        <IconPause className="h-[22px] w-[22px]" />
                      ) : (
                        <IconPlay className="h-[22px] w-[22px] ml-0.5" />
                      )}
                    </button>

                    {/* 重听按钮 */}
                    <button
                      type="button"
                      className="h-11 px-5 bg-rose-50 text-rose-600 rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-rose-100 transition-colors border border-rose-100/50"
                      onClick={() => handleRowReplay(currentSubtitleIndex)}
                      disabled={isTrial && trialEnded}
                    >
                      <IconReplay className="h-[18px] w-[18px]" />
                    </button>

                    {/* 单句循环：支持次数 / 无限模式（PC 浮层按钮组） */}
                    <div className="relative">
                      <button
                        type="button"
                        className={`h-11 w-11 flex items-center justify-center rounded-2xl transition-all font-bold ${
                          sentenceLoop
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-200'
                            : 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                        }`}
                        title="单句循环"
                        onClick={() => {
                          // PC 端点击仅负责展开配置浮层，循环开关在浮层中设置
                          setIsLoopMenuOpen(v => !v);
                        }}
                        disabled={isTrial && trialEnded}
                      >
                        <span className="text-lg leading-none">
                          {sentenceLoop && loopMode === 'count'
                            ? Math.max(1, loopCount)
                            : '∞'}
                        </span>
                      </button>
                      {isLoopMenuOpen && !isTrial && !trialEnded && (
                        <div className="absolute left-0 top-[120%] z-20 rounded-2xl border border-stone-100 bg-white/98 px-2 py-1.5 text-[11px] shadow-lg shadow-black/5">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 5, 10].map(count => (
                              <button
                                key={count}
                                type="button"
                                className={`h-7 w-7 rounded-full text-[11px] font-medium ${
                                  sentenceLoop &&
                                  loopMode === 'count' &&
                                  loopCount === count
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                                }`}
                                onClick={() => {
                                  // 选择次数：1 次 = 关闭循环，其它次数 = 按次数循环
                                  const { sentenceLoop: loopOn, currentSubtitleIndex: idx } =
                                    usePlayerStore.getState();
                                  if (count === 1) {
                                    // 1 次：等价于关闭单句循环
                                    if (loopOn) {
                                      toggleSentenceLoop();
                                    }
                                    currentRepeatCountRef.current = 0;
                                    setIsLoopMenuOpen(false);
                                    return;
                                  }

                                  if (!loopOn) {
                                    toggleSentenceLoop();
                                  }
                                  setLoopMode('count');
                                  setLoopCount(count);
                                  currentRepeatCountRef.current = 0;

                                  // 跳回当前句开头，确保从头开始循环
                                  if (videoData?.subtitles && streamRef.current) {
                                    const current = videoData.subtitles[idx];
                                    if (current) {
                                      if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                        setIsLoopMenuOpen(false);
                                        return;
                                      }
                                      streamRef.current.currentTime = current.start;
                                      jumpToSubtitle(idx);
                                    }
                                  }
                                  setIsLoopMenuOpen(false);
                                }}
                              >
                                {count}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={`h-7 w-7 rounded-full text-[11px] font-medium ${
                                sentenceLoop && loopMode === 'infinite'
                                  ? 'bg-rose-500 text-white shadow-sm'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                              onClick={() => {
                                const { sentenceLoop: loopOn, currentSubtitleIndex: idx } =
                                  usePlayerStore.getState();
                                if (!loopOn) {
                                  toggleSentenceLoop();
                                }
                                setLoopMode('infinite');
                                currentRepeatCountRef.current = 0;

                                if (videoData?.subtitles && streamRef.current) {
                                  const current = videoData.subtitles[idx];
                                  if (current) {
                                    if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                      setIsLoopMenuOpen(false);
                                      return;
                                    }
                                    streamRef.current.currentTime = current.start;
                                    jumpToSubtitle(idx);
                                  }
                                }
                                setIsLoopMenuOpen(false);
                              }}
                            >
                              ♾️
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 右侧学习工具积木 */}
                  <div className="flex items-center gap-2">
                    {/* 倍速 */}
                    <div className="h-11 flex items-center rounded-2xl bg-stone-50 text-stone-600 text-xs font-bold px-3 hover:bg-stone-100 transition-colors">
                      <select
                        className="bg-transparent outline-none cursor-pointer"
                        value={String(playbackRate)}
                        onChange={handleSpeedSelect}
                        disabled={isTrial && trialEnded}
                      >
                        {speedOptions.map(speed => (
                          <option key={speed} value={speed.toString()}>
                            {speed.toString().replace(/\.0$/, '')}x
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 语言模式 */}
                    <button
                      type="button"
                      className="h-11 px-4 bg-stone-50 text-stone-600 rounded-2xl text-xs font-bold hover:bg-stone-100 transition-colors flex items-center gap-2"
                      onClick={() =>
                        setScriptMode(prev =>
                          prev === 'both'
                            ? 'en'
                            : prev === 'en'
                            ? 'cn'
                            : 'both'
                        )
                      }
                    >
                      <span className="text-[13px]">文</span>
                      <span>
                        {scriptMode === 'both'
                          ? '双语'
                          : scriptMode === 'cn'
                          ? '中文'
                          : '英文'}
                      </span>
                    </button>

                    {/* 跟读：对齐移动端交互，支持录音 / 回放状态视觉反馈 */}
                    <button
                      type="button"
                      className={`group h-11 px-4 rounded-2xl text-xs font-bold flex items-center gap-2 border-2 transition-all ${
                        shadowSubtitleIndex === currentSubtitleIndex &&
                        shadowMode === 'recording'
                          ? 'bg-rose-50 border-rose-400 text-rose-600'
                          : shadowSubtitleIndex === currentSubtitleIndex &&
                            shadowMode === 'reviewing'
                          ? 'bg-blue-50 border-blue-400 text-blue-600'
                          : 'bg-white border-stone-100 text-stone-500 hover:border-rose-400 hover:text-rose-500'
                      }`}
                      onClick={() => handleRowMic(currentSubtitleIndex)}
                      disabled={isTrial && trialEnded}
                    >
                      {shadowSubtitleIndex === currentSubtitleIndex &&
                      shadowMode === 'reviewing' ? (
                        <IconReplay className="h-[16px] w-[16px]" />
                      ) : (
                        <IconMic
                          className={`h-[16px] w-[16px] ${
                            shadowSubtitleIndex === currentSubtitleIndex &&
                            shadowMode === 'recording'
                              ? 'animate-pulse'
                              : ''
                          }`}
                        />
                      )}
                      <span>跟读</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Layer 4: 当前句放大面板（桌面端） */}
              {/* 使用较紧凑的最小高度，减少整体占用，让整块内容尽量压缩在视口内 */}
              <div className="hidden min-h-[6rem] flex-col justify-center gap-2 border-t border-gray-100 bg-gray-50/80 px-8 py-3 lg:flex">
                {activeSubtitle ? (
                  <>
                    {showActiveEn && (
                      <div className="text-[17px] font-semibold text-gray-900">
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
                          const vocabKey = getHeadwordKey(segment.card);
                          const status = vocabStatusMap[vocabKey];
                          const highlightClass = getHighlightClassNames(type);
                          const extraClass =
                            status === 'unknown' ? 'hl-unknown' : '';

                          return (
                            <span
                              key={segIndex}
                              className={`${highlightClass} ${extraClass}`}
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
                    {showActiveCn && (
                      <div
                        className={`text-sm ${
                          maskChinese
                            ? 'text-transparent bg-gray-200/90 rounded-[4px] px-2 py-0.5'
                            : 'text-gray-600'
                        }`}
                      >
                        {activeSubtitle.text_cn}
                      </div>
                    )}
                    {/*<div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-600">*/}
                    {/*  <button*/}
                    {/*    type="button"*/}
                    {/*    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm hover:bg-gray-50"*/}
                    {/*    onClick={() => handleRowReplay(currentSubtitleIndex)}*/}
                    {/*    disabled={isTrial && trialEnded}*/}
                    {/*  >*/}
                    {/*    <IconReplay className="h-4 w-4" />*/}
                    {/*    <span>重听</span>*/}
                    {/*  </button>*/}
                    {/*  <button*/}
                    {/*    type="button"*/}
                    {/*    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 shadow-sm ${*/}
                    {/*      shadowSubtitleIndex === currentSubtitleIndex &&*/}
                    {/*      shadowMode === 'recording'*/}
                    {/*        ? 'bg-[#FF2442]/10 text-[#FF2442]'*/}
                    {/*        : 'bg-white text-gray-700 hover:bg-gray-50'*/}
                    {/*    }`}*/}
                    {/*    onClick={() => handleRowMic(currentSubtitleIndex)}*/}
                    {/*    disabled={isTrial && trialEnded}*/}
                    {/*  >*/}
                    {/*    {shadowSubtitleIndex === currentSubtitleIndex &&*/}
                    {/*    shadowMode === 'reviewing' ? (*/}
                    {/*      <IconReplay className="h-4 w-4" />*/}
                    {/*    ) : (*/}
                    {/*      <IconMic className="h-4 w-4" />*/}
                    {/*    )}*/}
                    {/*    <span>跟读</span>*/}
                    {/*  </button>*/}
                    {/*  <button*/}
                    {/*    type="button"*/}
                    {/*    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 shadow-sm ${*/}
                    {/*      sentenceLoop*/}
                    {/*        ? 'bg-[#FF2442]/10 text-[#FF2442]'*/}
                    {/*        : 'bg-white text-gray-700 hover:bg-gray-50'*/}
                    {/*    }`}*/}
                    {/*    onClick={() => handleRowLoop(currentSubtitleIndex)}*/}
                    {/*    disabled={isTrial && trialEnded}*/}
                    {/*  >*/}
                    {/*    <IconLoop className="h-4 w-4" />*/}
                    {/*    <span>循环</span>*/}
                    {/*  </button>*/}
                    {/*  <button*/}
                    {/*    type="button"*/}
                    {/*    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 shadow-sm ${*/}
                    {/*      likedSubtitles.has(currentSubtitleIndex)*/}
                    {/*        ? 'bg-[#FF2442]/10 text-[#FF2442]'*/}
                    {/*        : 'bg-white text-gray-700 hover:bg-gray-50'*/}
                    {/*    }`}*/}
                    {/*    onClick={() => handleToggleLike(currentSubtitleIndex)}*/}
                    {/*  >*/}
                    {/*    <IconLike className="h-4 w-4" />*/}
                    {/*    <span>收藏</span>*/}
                    {/*  </button>*/}
                    {/*</div>*/}
                  </>
                ) : (
                  <div className="text-sm text-gray-400">
                    开始播放后，这里会放大显示当前句子。
                  </div>
                )}
              </div>
            </div>

          {/* 移动端：视频下方的基础信息（V1.2 收紧首屏信息量，暂时隐藏） */}
            <div className="hidden">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center rounded-full bg-white px-2 py-1">
                  时长 {formatDuration(videoData.duration)}
                </span>
                <span className="inline-flex items-center rounded-full bg-white px-2 py-1">
                  学习 {videoData.view_count ?? 0} 次
                </span>
              </div>
              {videoData.description && (
                <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
                  {videoData.description}
                </p>
              )}
            </div>
          </section>

          {/* 右侧：交互式课本 THE LIST
              移动端：占用视频下方剩余高度，内部字幕区域滚动
              桌面端：固定宽度的侧边栏 */}
          <aside className="h-full flex w-full flex-1 flex-col lg:mt-0 lg:w-[30%] lg:flex-none">
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-shell)] lg:max-h-[calc(100vh-180px)] lg:rounded-2xl lg:border lg:border-gray-100 lg:bg-[var(--bg-shell)] lg:shadow-sm">
              {/* 顶部工具栏（Sticky，移动端隐藏以释放字幕空间） */}
              <div className="sticky top-0 z-10 hidden items-center justify-between border-b border-stone-100 bg-white/95 px-4 py-2 text-[11px] text-stone-500 backdrop-blur-xl lg:flex">
                <div className="flex items-center">
                  {/* Tab：字幕 / 生词（线型图标胶囊） */}
                  <div className="inline-flex items-center rounded-full bg-stone-50 p-1">
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${
                        panelMode === 'transcript'
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                      onClick={() => setPanelMode('transcript')}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        className="h-3.5 w-3.5"
                      >
                        <rect
                          x="2.5"
                          y="3"
                          width="11"
                          height="10"
                          rx="1.5"
                        />
                        <path d="M4.2 5.2h7" strokeLinecap="round" />
                        <path d="M4.2 7.6h5.2" strokeLinecap="round" />
                        <path d="M4.2 10h3.6" strokeLinecap="round" />
                      </svg>
                      <span>字幕</span>
                    </button>
                    <button
                      type="button"
                      className={`ml-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${
                        panelMode === 'vocab'
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                      onClick={() => setPanelMode('vocab')}
                      disabled={!user || vocabItems.length === 0}
                    >
                      <IconVocab className="h-3.5 w-3.5" />
                      <span>生词</span>
                      {user && vocabUnknownCount > 0 && (
                        <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#FF2442] px-1 text-[10px] font-semibold text-white">
                          {vocabUnknownCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-3">
                  {/* 视图模式：中 / 双语 / 英 —— 仅在字幕模式下展示 */}
                  {panelMode === 'transcript' ? (
                    <>
                      <div className="flex items-center rounded-xl border border-stone-100 bg-stone-50 p-1">
                        {(
                          [
                            { value: 'cn', label: '中' },
                            { value: 'both', label: '双语' },
                            { value: 'en', label: '英' }
                          ] as { value: 'cn' | 'both' | 'en'; label: string }[]
                        ).map(mode => {
                          const active = scriptMode === mode.value;
                          return (
                            <button
                              key={mode.value}
                              type="button"
                              className={`flex items-center justify-center rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                                active
                                  ? 'bg-white text-rose-600 shadow-sm shadow-rose-100 border border-rose-300'
                                  : 'bg-transparent text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                              }`}
                              onClick={() => setScriptMode(mode.value)}
                            >
                              {mode.label}
                            </button>
                          );
                        })}
                      </div>
                      {/* 打印按钮：线型图标，配合极简描边 */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-transparent text-stone-400 hover:bg-stone-100 hover:text-rose-500"
                          onClick={handleExportTranscript}
                          aria-label="打印字幕"
                        >
                          <IconPrint className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    /* 生词模式：顶部右侧放“全部标记为认识” */
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-medium ${
                          vocabItems.length > 0
                            ? 'bg-rose-500 text-white shadow-sm shadow-rose-200 hover:bg-rose-600'
                            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                        }`}
                        disabled={vocabItems.length === 0}
                        onClick={handleMarkRestKnown}
                      >
                        ✨ 全部标记为认识
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧内容区：根据 panelMode 在「字幕流」和「生词流」之间切换 */}
              <div className="relative flex-1 overflow-hidden">
                {/* 字幕列表：独立滚动区域（移动端样式对齐 HTML demo 的 feed-list + card） */}
                <div
                  ref={subtitlesContainerRef}
                  className={`absolute inset-0 overflow-y-auto overflow-x-hidden pb-[100px] lg:static lg:h-full lg:pb-0 scroll-smooth lg:scroll-auto no-scrollbar ${
                    panelMode === 'vocab' ? 'hidden' : ''
                  }`}
                >
                  {videoData.subtitles.map((subtitle, index) => {
                    const isActive = currentSubtitleIndex === index;

                    const toolbarDesktopClasses =
                      'mt-2 hidden flex-nowrap items-center gap-2 text-[11px] text-gray-500 lg:flex';
                    const toolbarMobileClasses = 'hidden lg:hidden';

                    const showEn = scriptMode === 'both' || scriptMode === 'en';
                    const showCn = scriptMode === 'both' || scriptMode === 'cn';

                    const rowHoverClass = isActive
                      ? ''
                      : 'lg:hover:bg-stone-50';

                    return (
                      <div
                        key={index}
                        ref={el => {
                          subtitleItemRefs.current[index] = el;
                        }}
                        className={`card subtitle-card group relative cursor-pointer ${
                          isActive ? 'active' : ''
                        } ${rowHoverClass}`}
                        onClick={() => handleSubtitleClick(index)}
                      >
                        {/* 时间 + 收藏：桌面端辅助信息，移动端隐藏以还原 demo 的纯字幕卡片 */}
                        <div className="hidden items-center justify-between text-[11px] text-gray-400 lg:flex">
                          <span>{formatDuration(subtitle.start)}</span>
                          <button
                            type="button"
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                              likedSubtitles.has(index)
                                ? 'text-[#FF2442]'
                                : 'text-gray-300 hover:text-[#FF2442]'
                            }`}
                            onClick={e => {
                              e.stopPropagation();
                              handleToggleLike(index);
                            }}
                            aria-label="收藏该句子"
                          >
                            <IconLike className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* 英文行：根据 scriptMode 控制显示 */}
                        {showEn && (
                          <div className="en text-[16px] lg:text-[10px]">
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
                              const vocabKey = getHeadwordKey(segment.card);
                              const status = vocabStatusMap[vocabKey];
                              const highlightClass =
                                getHighlightClassNames(type);
                              const extraClass =
                                status === 'unknown' ? 'hl-unknown' : '';

                              return (
                                <span
                                  key={segIndex}
                                  className={`${highlightClass} ${extraClass}`}
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
                        {showCn && (
                          <div className="cn">
                            {subtitle.text_cn}
                          </div>
                        )}

                        {/* 工具栏：桌面端仅激活 / Hover 时显示，高度固定，避免行高跳动 */}
                        <div
                          className={`${toolbarDesktopClasses} transition-opacity ${
                            isActive
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
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
                            className={`inline-flex h-5 w-5 items-center justify-center text-[13px] ${
                              shadowSubtitleIndex === index &&
                              shadowMode === 'recording'
                                ? 'text-[#FF2442]'
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title="跟读"
                            onClick={e => {
                              e.stopPropagation();
                              handleRowMic(index);
                            }}
                            disabled={isTrial && trialEnded}
                          >
                            {shadowSubtitleIndex === index &&
                            shadowMode === 'reviewing' ? (
                              <IconReplay className="h-4 w-4" />
                            ) : (
                              <IconMic className="h-4 w-4" />
                            )}
                          </button>
                          {/*<button*/}
                          {/*  type="button"*/}
                          {/*  className={`inline-flex h-5 w-5 items-center justify-center text-[13px] ${*/}
                          {/*    likedSubtitles.has(index)*/}
                          {/*      ? 'text-[#E88D93]'*/}
                          {/*      : 'text-gray-400 hover:text-gray-600'*/}
                          {/*  }`}*/}
                          {/*  title="收藏"*/}
                          {/*  onClick={e => {*/}
                          {/*    e.stopPropagation();*/}
                          {/*    handleToggleLike(index);*/}
                          {/*  }}*/}
                          {/*>*/}
                          {/*  <IconLike className="h-4 w-4" />*/}
                          {/*</button>*/}
                        </div>

                        {/* 工具栏：移动端仅当前行展开（仅图标） */}
                        <div className={toolbarMobileClasses}>
                          {/* 预留：如需要在移动端每行展开操作，可以在这里补充 */}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 生词流：PC 端右侧面板复习视图 */}
                <div
                  className={`absolute inset-0 flex flex-col overflow-y-auto px-4 pb-4 pt-3 lg:static lg:h-full ${
                    panelMode === 'vocab' ? 'block' : 'hidden'
                  }`}
                >
                  {vocabItems.length === 0 && (
                    <div className="mt-10 rounded-2xl bg-stone-50 px-4 py-6 text-center text-[11px] text-stone-500">
                      本视频暂时还没有可复习的生词。先在字幕中点击单词，标记为“不认识”再来这里看看。
                    </div>
                  )}

                  {vocabItems.length > 0 && (
                    <>
                      {/* 类型分类：单词 / 短语 / 表达 */}
                      <div className="mb-2 flex items-center gap-2 text-[11px]">
                        {[
                          { label: '全部', value: 'all' as const },
                          { label: '单词', value: 'word' as const },
                          { label: '短语', value: 'phrase' as const },
                          { label: '表达', value: 'expression' as const }
                        ].map(tab => {
                          const active = vocabKindFilter === tab.value;
                          return (
                            <button
                              key={tab.value}
                              type="button"
                              className={`rounded-full px-3 py-1 ${
                                active
                                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                                  : 'bg-stone-50 text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                              }`}
                              onClick={() => setVocabKindFilter(tab.value)}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* 生词卡片列表（仅展示「不认识」的生词） */}
                      <div className="space-y-2">
                        {vocabItems
                          .filter(item => {
                            const matchKind =
                              vocabKindFilter === 'all' ||
                              item.kind === vocabKindFilter;
                            if (!matchKind) return false;
                            return true;
                          })
                          .map(item => {
                            const base =
                              'relative rounded-2xl border px-3 py-2.5 text-[11px] transition-all cursor-pointer';
                            const stateClass =
                              'border-gray-100 bg-white shadow-sm hover:border-gray-200 hover:bg-gray-50';

                            return (
                              <div
                                key={item.key}
                                className={`${base} ${stateClass}`}
                                onClick={() => handlePlayVocabClip(item)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <div className="flex flex-wrap items-baseline gap-1">
                                        <span className="text-[15px] font-semibold text-gray-900">
                                          {item.headword}
                                        </span>
                                        {item.ipa && (
                                          <span className="font-serif text-[11px] text-gray-500">
                                            {item.ipa}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-1 text-[11px]">
                                      {item.pos && (
                                        <span className="mr-1 font-medium text-gray-700">
                                          {item.pos}
                                        </span>
                                      )}
                                      <span className="text-rose-700">
                                        {item.definition || item.paraphrase}
                                      </span>
                                    </div>

                                    {(item.source?.sentence_en ||
                                      item.source?.sentence_cn) && (
                                      <div className="mt-1 border-l border-gray-200 pl-2 text-[10px] text-gray-600">
                                        {item.source?.sentence_en && (
                                          <div className="italic">
                                            {item.source.sentence_en}
                                          </div>
                                        )}
                                        {item.source?.sentence_cn && (
                                          <div className="mt-0.5">
                                            {item.source.sentence_cn}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="ml-1 flex flex-col items-end gap-1">
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-[#FF2442]"
                                      onClick={e => {
                                        e.stopPropagation();
                                        handlePlayVocabClip(item);
                                      }}
                                      title="播放例句片段"
                                    >
                                      <IconSound className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    className="flex-1 rounded-full border px-2 py-1 text-[11px] font-medium border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-500"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleUpdateVocabStatus(
                                        item.key,
                                        'known'
                                      );
                                    }}
                                  >
                                    ✓ 认识
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* 底部已无额外操作，所有“全部标记为认识”操作移动到顶部工具栏 */}
                    </>
                  )}
                </div>
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
            {(() => {
              const normalized = normalizeKnowledgeForDisplay(
                cardPopover.card,
                videoData?.subtitles
              );
              const typeLabel = getCardTypeLabel(
                cardPopover.card.data.type
              );

              const isWord = normalized.kind === 'word';
              const isPhrase = normalized.kind === 'phrase';
              const isExpression = normalized.kind === 'expression';

              return (
                <>
                  {/* 头部：单词 + IPA + 类型标签 */}
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900">
                          {normalized.headword ||
                            cardPopover.card.trigger_word}
                        </span>
                        {normalized.ipa && (
                          <span className="font-serif text-[11px] text-gray-500">
                            {normalized.ipa}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-800">
                        {normalized.pos && (
                          <span className="mr-1 font-medium text-gray-700">
                            {normalized.pos}
                          </span>
                        )}
                        <span className="text-rose-700">
                          {normalized.def}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {typeLabel && (
                        <span className="rounded-full bg-stone-100 px-2 py-[2px] text-[10px] text-stone-600">
                          {typeLabel}
                        </span>
                      )}
                      {normalized.ipa && (
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
                      )}
                    </div>
                  </div>

                  {/* 类型相关的补充信息 */}
                  {isWord && normalized.collocations && (
                    <div className="mt-1 text-[10px] text-gray-600">
                      <span className="mr-1 text-gray-500">
                        常见搭配：
                      </span>
                      <span>
                        {normalized.collocations.join(' · ')}
                      </span>
                    </div>
                  )}
                  {isWord && normalized.synonyms && (
                    <div className="mt-1 text-[10px] text-gray-600">
                      <span className="mr-1 text-gray-500">
                        近义：
                      </span>
                      <span>
                        {normalized.synonyms.join(' · ')}
                      </span>
                    </div>
                  )}

                  {isPhrase && normalized.structure && (
                    <div className="mt-1 font-mono text-[10px] text-indigo-600">
                      结构：{normalized.structure}
                    </div>
                  )}

                  {isExpression && (
                    <div className="mt-1 space-y-0.5 text-[10px] text-gray-600">
                      {normalized.functionLabel && (
                        <div>
                          <span className="mr-1 text-gray-500">
                            功能：
                          </span>
                          <span>{normalized.functionLabel}</span>
                        </div>
                      )}
                      {(normalized.register || normalized.scenario) && (
                        <div className="flex flex-wrap items-center gap-1">
                          {normalized.register && (
                            <span className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-stone-600">
                              {normalized.register}
                            </span>
                          )}
                          {normalized.scenario && (
                            <span>{normalized.scenario}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(normalized.sourceSentenceEn ||
                    normalized.sourceSentenceCn) && (
                    <div className="mt-2 border-l border-gray-200 pl-2 text-[10px] text-gray-700">
                      {normalized.sourceSentenceEn && (
                        <div className="italic">
                          {normalized.sourceSentenceEn}
                        </div>
                      )}
                      {normalized.sourceSentenceCn && (
                        <div className="mt-0.5 text-stone-500">
                          {normalized.sourceSentenceCn}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
            {(() => {
              const vocabKey = getHeadwordKey(cardPopover.card);
              const status = vocabStatusMap[vocabKey];
              const isUnknown = status === 'unknown';

              // PC 知识卡 Popover：只提供“加入生词本（不认识）”，不再在这里标记“认识”
              return (
                <div className="mt-3 flex">
                  <button
                    type="button"
                    className={`flex-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                      isUnknown
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                    }`}
                    onClick={e => {
                      e.stopPropagation();
                      handleUpdateVocabStatus(vocabKey, 'unknown');
                    }}
                  >
                    不认识
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 移动端：知识卡片 Bottom Sheet */}
      {activeCard && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={hideCard}
        >
          {/* 底部弹层本体：阻止事件冒泡，避免点击内容区域时关闭 */}
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-gray-200 bg-white px-4 pb-6 pt-4 shadow-[0_-18px_40px_rgba(0,0,0,0.18)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto max-w-2xl">
              {(() => {
                const normalized = normalizeKnowledgeForDisplay(
                  activeCard,
                  videoData?.subtitles
                );
                const typeLabel = getCardTypeLabel(
                  activeCard.data.type
                );

                const isWord = normalized.kind === 'word';
                const isPhrase = normalized.kind === 'phrase';
                const isExpression = normalized.kind === 'expression';

                return (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900">
                            {normalized.headword ||
                              activeCard.trigger_word}
                          </div>
                          {typeLabel && (
                            <span className="rounded-full bg-stone-100 px-2 py-[2px] text-[10px] text-stone-600">
                              {typeLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-800">
                          {normalized.pos && (
                            <span className="mr-1 font-medium text-gray-700">
                              {normalized.pos}
                            </span>
                          )}
                          <span className="text-rose-700">
                            {normalized.def}
                          </span>
                        </div>
                      </div>
                      <button
                        className="text-xs text-gray-400 hover:text-gray-700"
                        onClick={hideCard}
                      >
                        收起
                      </button>
                    </div>

                    {normalized.ipa && (
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                        <span>{normalized.ipa}</span>
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

                    {isWord && normalized.collocations && (
                      <div className="mt-1 text-[11px] text-gray-600">
                        <span className="mr-1 text-gray-500">
                          常见搭配：
                        </span>
                        <span>
                          {normalized.collocations.join(' · ')}
                        </span>
                      </div>
                    )}

                    {isPhrase && normalized.structure && (
                      <div className="mt-1 font-mono text-[11px] text-indigo-600">
                        结构：{normalized.structure}
                      </div>
                    )}

                    {isExpression && (
                      <div className="mt-1 space-y-0.5 text-[11px] text-gray-600">
                        {normalized.functionLabel && (
                          <div>
                            <span className="mr-1 text-gray-500">
                              功能：
                            </span>
                            <span>{normalized.functionLabel}</span>
                          </div>
                        )}
                        {(normalized.register ||
                          normalized.scenario) && (
                          <div className="flex flex-wrap items-center gap-1">
                            {normalized.register && (
                              <span className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-stone-600">
                                {normalized.register}
                              </span>
                            )}
                            {normalized.scenario && (
                              <span>{normalized.scenario}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {(normalized.sourceSentenceEn ||
                      normalized.sourceSentenceCn) && (
                      <div className="mt-2 border-l border-gray-200 pl-2 text-xs text-gray-700">
                        {normalized.sourceSentenceEn && (
                          <div className="italic">
                            {normalized.sourceSentenceEn}
                          </div>
                        )}
                        {normalized.sourceSentenceCn && (
                          <div className="mt-0.5 text-[11px] text-stone-500">
                            {normalized.sourceSentenceCn}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
              {(() => {
                const vocabKey = getHeadwordKey(activeCard);
                const status = vocabStatusMap[vocabKey];
                const isUnknown = status === 'unknown';

                return (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 rounded-full border px-3 py-2 text-[12px] font-medium ${
                        isUnknown
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                      }`}
                      onClick={() => {
                        handleUpdateVocabStatus(vocabKey, 'unknown');
                        hideCard();
                        // 默认在移动端自动恢复播放，保持学习流畅
                        if (
                          streamRef.current &&
                          !(isTrial && trialEnded)
                        ) {
                          void streamRef.current.play();
                          setIsPlaying(true);
                        }
                      }}
                    >
                      不认识
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 移动端：底部“奶油风”悬浮岛控制台（5 点对称布局） */}
      {videoData.subtitles.length > 0 && (
          // 1. 外层定位容器：完全保持原样，确保位置不动
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[env(safe-area-inset-bottom,16px)] lg:hidden">
            <div className="relative w-full max-w-[414px] px-5 pb-4">

              {/* 倍速 / 字幕设置 Popover */}
              {isSpeedMenuOpen && !isTrial && !trialEnded && (
                  <div className="pointer-events-auto absolute bottom-[88px] left-1/2 w-[280px] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200">
                    <div className="flex flex-col gap-4 rounded-[24px] border border-white/60 bg-white/90 p-5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] backdrop-blur-xl">
                      {/* ... Popover 内容保持逻辑不变，仅优化样式 ... */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-medium text-gray-500">
                          <span>倍速</span>
                          <span className="font-bold text-gray-900">{playbackRate}x</span>
                        </div>
                        <div className="flex justify-between gap-1">
                          {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                              <button
                                  key={speed}
                                  onClick={() => setPlaybackRate(speed)}
                                  className={`h-8 w-8 rounded-full text-[11px] font-medium transition-all ${
                                      playbackRate === speed
                                          ? 'bg-[#1a1a1a] text-white scale-110 shadow-md'
                                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  }`}
                              >
                                {speed}
                              </button>
                          ))}
                        </div>
                      </div>
                      <div className="h-px w-full bg-gray-100/80" />
                      <div className="flex rounded-full bg-gray-100 p-1">
                        {(['cn', 'both', 'en'] as ('cn' | 'both' | 'en')[]).map(
                          mode => (
                            <button
                              key={mode}
                              onClick={() => setScriptMode(mode)}
                              className={`flex-1 rounded-full py-1.5 text-[11px] font-medium transition-all ${
                                scriptMode === mode
                                  ? 'bg-white text-black shadow-sm'
                                  : 'text-gray-400'
                              }`}
                            >
                              {mode === 'cn'
                                ? '中'
                                : mode === 'en'
                                ? '英'
                                : '双语'}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
              )}

              {/* 移动端：单句循环次数 Popover */}
              {isLoopMenuOpen && !isTrial && !trialEnded && (
                  <div className="pointer-events-auto absolute bottom-[88px] left-1/2 w-[220px] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200">
                    <div className="flex flex-col gap-2 rounded-[20px] border border-white/60 bg-white/95 p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] backdrop-blur-xl">
                      <div className="text-[11px] font-medium text-gray-500">
                        单句循环次数
                      </div>
                      <div className="flex justify-between gap-1">
                        {[1, 2, 3, 5, 10].map(count => (
                            <button
                                key={count}
                                type="button"
                                onClick={() => {
                                  const { sentenceLoop: loopOn, currentSubtitleIndex: idx } =
                                      usePlayerStore.getState();
                                  if (count === 1) {
                                    // 1 次：等价于关闭单句循环
                                    if (loopOn) {
                                      toggleSentenceLoop();
                                    }
                                    currentRepeatCountRef.current = 0;
                                    setIsLoopMenuOpen(false);
                                    return;
                                  }

                                  if (!loopOn) {
                                    toggleSentenceLoop();
                                  }
                                  setLoopMode('count');
                                  setLoopCount(count);
                                  currentRepeatCountRef.current = 0;

                                  if (videoData?.subtitles && streamRef.current) {
                                    const current = videoData.subtitles[idx];
                                    if (current) {
                                      if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                        setIsLoopMenuOpen(false);
                                        return;
                                      }
                                      streamRef.current.currentTime = current.start;
                                      jumpToSubtitle(idx);
                                    }
                                  }
                                  setIsLoopMenuOpen(false);
                                }}
                                className={`h-8 flex-1 rounded-full text-[11px] font-medium ${
                                    sentenceLoop &&
                                    loopMode === 'count' &&
                                    loopCount === count
                                        ? 'bg-[#1a1a1a] text-white shadow-md'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                              {count}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                              const { sentenceLoop: loopOn, currentSubtitleIndex: idx } =
                                  usePlayerStore.getState();
                              if (!loopOn) {
                                toggleSentenceLoop();
                              }
                              setLoopMode('infinite');
                              currentRepeatCountRef.current = 0;

                              if (videoData?.subtitles && streamRef.current) {
                                const current = videoData.subtitles[idx];
                                if (current) {
                                  if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                    setIsLoopMenuOpen(false);
                                    return;
                                  }
                                  streamRef.current.currentTime = current.start;
                                  jumpToSubtitle(idx);
                                }
                              }
                              setIsLoopMenuOpen(false);
                            }}
                            className={`h-8 w-10 rounded-full text-[11px] font-medium ${
                                sentenceLoop && loopMode === 'infinite'
                                    ? 'bg-[#1a1a1a] text-white shadow-md'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                        >
                          ♾️
                        </button>
                      </div>
                    </div>
                  </div>
              )}

              {/* 2. 悬浮玻璃岛本体：
               - 替换了原有的 island-container/island-body class
               - 使用 Flex 布局实现 5 点对称
               - 增加 height 到 68px，圆角 full，磨砂背景
            */}
              <div className="pointer-events-auto flex h-[68px] w-full items-center justify-between rounded-full border border-white/60 bg-white/85 px-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all">

                {/* Button 1: 左侧 - 倍速 */}
                <button
                    type="button"
                    className="group flex flex-1 flex-col items-center justify-center active:scale-95 transition-transform"
                    onClick={() => {
                      if (isTrial && trialEnded) return;
                      setIsSpeedMenuOpen(v => !v);
                    }}
                    aria-label="播放设置"
                >
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-gray-600 group-active:bg-black/5">
                  {playbackRate.toString().replace(/\.0$/, '')}x
                </span>
                </button>

                {/* Button 2: 左中 - 单句循环（点击弹出循环次数浮层） */}
                <button
                    type="button"
                    className="group flex flex-1 items-center justify-center active:scale-95 transition-transform"
                    onClick={() => {
                      if (isTrial && trialEnded) return;
                      setIsLoopMenuOpen(v => !v);
                    }}
                    disabled={isTrial && trialEnded}
                    aria-label="单句循环"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      sentenceLoop
                          ? 'bg-black/5 text-gray-900'
                          : 'text-gray-400 group-active:bg-black/5'
                  }`}>
                    {!sentenceLoop ? (
                      // 未开启循环：显示默认的循环图标
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[20px] w-[20px]"
                      >
                        <path d="M17 2l4 4-4 4" />
                        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                        <path d="M7 22l-4-4 4-4" />
                        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                      </svg>
                    ) : (
                      // 已开启循环：次数模式显示数字，∞ 模式显示符号
                      <span className="text-[13px] font-semibold">
                        {loopMode === 'count'
                          ? Math.max(1, loopCount)
                          : '♾️'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Button 3: 中间 - 播放主键 (视觉重心) */}
                {/* 这里的容器 flex-1 确保它占据中间位置，但按钮本身有固定大尺寸 */}
                <div className="flex flex-1 items-center justify-center">
                  <button
                      type="button"
                      className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition-transform active:scale-90 active:shadow-none"
                      onClick={handleTogglePlay}
                      disabled={isTrial && trialEnded}
                      aria-label={isPlaying ? '暂停' : '播放'}
                  >
                    {isPlaying ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                          <rect x="6" y="5" width="4" height="14" rx="1"/>
                          <rect x="14" y="5" width="4" height="14" rx="1"/>
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-7 w-7">
                          <path d="M5.5 3.5v17l15-8.5-15-8.5z"/>
                        </svg>
                    )}
                  </button>
                </div>

                {/* Button 4: 右中 - 跟读 */}
                <button
                    type="button"
                    className="group flex flex-1 items-center justify-center active:scale-95 transition-transform"
                    onClick={() => handleRowMic(currentSubtitleIndex)}
                    disabled={isTrial && trialEnded}
                    aria-label="影子跟读"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      shadowSubtitleIndex === currentSubtitleIndex && shadowMode === 'recording'
                          ? 'text-[#FF2442] bg-[#FF2442]/5'
                          : 'text-gray-400 group-active:bg-black/5'
                  }`}>
                    {shadowSubtitleIndex === currentSubtitleIndex &&
                    shadowMode === 'reviewing' ? (
                        <IconReplay className="h-[22px] w-[22px] text-blue-500" />
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                             className={`h-[22px] w-[22px] ${
                                 shadowSubtitleIndex === currentSubtitleIndex && shadowMode === 'recording' ? 'animate-pulse' : ''
                             }`}
                        >
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="22"/>
                        </svg>
                    )}
                  </div>
                </button>

                {/* Button 5: 右侧 - 字幕 / 生词流切换 */}
                <button
                  type="button"
                  className="group relative flex flex-1 items-center justify-center active:scale-95 transition-transform"
                  onClick={() => {
                    // 没有登录或没有生词时，不允许进入生词模式
                    if (panelMode === 'transcript') {
                      if (!user || vocabItems.length === 0) return;
                      setPanelMode('vocab');
                    } else {
                      setPanelMode('transcript');
                    }
                  }}
                  aria-label={
                    panelMode === 'transcript' ? '打开生词本' : '返回字幕模式'
                  }
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      panelMode === 'vocab'
                        ? 'text-gray-900 bg-black/5'
                        : 'text-gray-400 group-active:bg-black/5'
                    }`}
                  >
                    {panelMode === 'vocab' ? (
                      // 生词模式下：显示「字幕」图标，提示可以切回字幕
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[22px] w-[22px]"
                      >
                        <path d="M4 5h16" />
                        <path d="M4 9h10" />
                        <path d="M4 13h16" />
                        <path d="M4 17h8" />
                      </svg>
                    ) : (
                      // 字幕模式下：显示「生词本」图标
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[22px] w-[22px]"
                      >
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    )}
                  </div>
                  {/* 只有在字幕模式且存在生词时显示红点数量 */}
                  {panelMode === 'transcript' &&
                    user &&
                    vocabUnknownCount > 0 && (
                      <span className="absolute right-3 top-1.5 min-w-[16px] rounded-full bg-[#FF2442] px-1 text-[10px] font-semibold leading-none text-white">
                        {vocabUnknownCount}
                      </span>
                    )}
                </button>

              </div>
            </div>
          </div>
      )}

      {/* 断点续播 Toast：上次看到 xx:xx [恢复] [x] */}
      {showResumeToast && resumeSeconds !== null && (
        <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 lg:bottom-6">
          <div className="flex max-w-sm flex-1 items-center justify-between rounded-full bg-black/85 px-3 py-2 text-xs text-white shadow-lg shadow-black/40">
            <span className="mr-2 truncate">
              上次看到 {resumeLabel}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium hover:bg-white/20"
                onClick={handleResumeFromToast}
              >
                恢复
              </button>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/0 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setShowResumeToast(false)}
                aria-label="关闭提示"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

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
