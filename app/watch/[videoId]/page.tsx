'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stream, type StreamPlayerApi } from '@cloudflare/stream-react';
import {
  usePlayerStore,
  type LoopConfig
} from '@/lib/store/player-store';
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
  created_at?: string;
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
    antonyms?: string[];
    difficulty_level?: string;
    structure?: string;
    register?: string;
    paraphrase?: string;
    function_label?: string;
    scenario?: string;
    note?: string;
    derived_form?: string;
    response_guide?: string;
    example?: {
      en?: string;
      cn?: string;
    };
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

// 精读页收藏图标：使用提供的标准收藏图标（书签 + 星星），未收藏时描边线型，已收藏时实心
function IconFavorite({
  filled = false,
  className
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className ?? 'h-4 w-4'}
      // 为保证在移动端小尺寸下也清晰可见，这里始终使用实心填充，
      // 选中 / 未选中只通过父元素的 text 颜色区分。
      fill="currentColor"
      stroke="none"
    >
      {/* 外层书签框 */}
      <path d="M818.7 64.2H205.3c-41.8 0-75.9 34-75.9 75.9v744.2c0 26.2 13.3 50.3 35.5 64.2 12.4 7.8 26.3 11.7 40.4 11.7 11.2 0 22.4-2.5 32.9-7.5L512 821.3l273.8 131.4c23.6 11.3 51 9.8 73.3-4.2 22.2-14 35.5-38 35.5-64.2V140.1c0-41.8-34.1-75.9-75.9-75.9z m0 820.1L544.9 752.8c-20.9-10-44.8-10-65.7 0L205.3 884.3V140.1h613.4l0.1 744.2h-0.1z" />
      {/* 内部星星 */}
      <path d="M691.5 373.6l-91.8-13.3-41-83.1c-8.8-17.9-26.7-29-46.7-29s-37.8 11.1-46.7 29l-41 83.1-91.7 13.3c-19.8 2.9-35.9 16.4-42.1 35.4-6.2 19-1.1 39.5 13.2 53.4l66.4 64.7-15.7 91.4c-3.4 19.7 4.5 39.2 20.7 50.9 16.1 11.7 37.2 13.2 54.9 4l82-43.1 82 43.1c7.7 4 16 6 24.3 6 10.7 0 21.4-3.4 30.6-10 16.2-11.7 24.1-31.3 20.7-50.9l-15.7-91.4 66.4-64.7c14.3-13.9 19.3-34.4 13.2-53.4-6.2-19-22.3-32.6-42-35.4zM592 481.4c-12.3 11.9-17.9 29.2-15 46.1l9.6 56.2-50.4-26.5c-15.2-8-33.3-8-48.5 0l-50.4 26.5 9.6-56.1c2.9-16.9-2.7-34.2-15-46.2l-40.8-39.8 56.3-8.2c17-2.5 31.6-13.1 39.2-28.5l25.2-51.1 25.2 51.1c7.6 15.4 22.2 26 39.2 28.5l56.4 8.2-40.6 39.8z" />
    </svg>
  );
}

// 不同类型卡片在气泡中展示的中文标签（仅保留三大类：单词 / 短语 / 表达）
const getCardTypeLabel = (
  type: KnowledgeCard['data']['type'] | undefined
): string | null => {
  switch (type) {
    case 'word':
    case 'proper_noun':
      return '单词';
    case 'phrase':
    case 'phrasal_verb':
      return '短语';
    case 'expression':
    case 'spoken_pattern':
    case 'idiom':
    case 'slang':
      return '表达';
    default:
      return null;
  }
};

// 更细粒度的原始类型标签（专有名词 / 习语 / 俚语等），放在知识卡片正文下方的“类别”行里展示
const getRawTypeLabel = (
  type: KnowledgeCard['data']['type'] | undefined
): string | null => {
  switch (type) {
    case 'word':
      return '普通词汇';
    case 'proper_noun':
      return '专有名词';
    case 'phrase':
      return '固定短语';
    case 'phrasal_verb':
      return '短语动词';
    case 'expression':
      return '惯用表达';
    case 'spoken_pattern':
      return '口语句式';
    case 'idiom':
    case 'slang':
      return '习语 / 俚语';
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
      // 惯用表达/口语句式/习语：第三种暖杏色荧光
      return 'hl hl-e';
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
   difficultyLevel?: string;
  collocations?: string[];
  synonyms?: string[];
  antonyms?: string[];
  derivedForm?: string;
  structure?: string;
  register?: string;
  paraphrase?: string;
  functionLabel?: string;
  scenario?: string;
  note?: string;
  exampleEn?: string;
  exampleCn?: string;
  responseGuide?: string;
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
  const difficultyLevel =
    card.data.difficulty_level?.trim() || undefined;

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
  const antonyms = normalizeStringArray(
    card.data.antonyms,
    3
  );

  const structure = card.data.structure?.trim() || undefined;
  const register = card.data.register?.trim() || undefined;
  const paraphrase = card.data.paraphrase?.trim() || undefined;
  const functionLabel =
    card.data.function_label?.trim() || undefined;
  const scenario = card.data.scenario?.trim() || undefined;
  const note = card.data.note?.trim() || undefined;

  // 额外例句（非原句）
  const exampleEn =
    card.data.example?.en?.trim() || undefined;
  const exampleCn =
    card.data.example?.cn?.trim() || undefined;

  const derivedForm =
    card.data.derived_form?.trim() || undefined;

  const responseGuide =
    card.data.response_guide?.trim() || undefined;

  return {
    kind,
    headword,
    ipa,
    pos,
    def,
    difficultyLevel,
    collocations,
    synonyms,
    antonyms,
    derivedForm,
    structure,
    register,
    paraphrase,
    functionLabel,
    scenario,
    note,
    exampleEn,
    exampleCn,
    responseGuide,
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
  // 是否收藏当前视频（基于 user_video_favorites 表）
  const [isFavorite, setIsFavorite] = useState(false);
  // 不存在 / 已下线视频标记（用于区分「视频不存在」和其它错误）
  const [notFound, setNotFound] = useState(false);
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
  const shouldAutoplay = searchParams?.get('autoplay') === '1';
  const TRIAL_LIMIT_SECONDS = 6 * 60;
  const ttsVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // 记录已经在哪条视频上消费过一次 autoplay，避免同一条视频在状态变更后被反复“强制播放”
  const autoplayHandledRef = useRef<string | null>(null);
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
          const chunks = recordedChunksRef.current.slice();
          if (!chunks.length) {
            console.warn('未采集到有效的录音数据');
            setShadowMode('idle');
            return;
          }

          // 优先使用浏览器实际提供的音频类型，避免在部分移动端浏览器上因类型不匹配导致无法播放
          let mimeType = 'audio/webm';
          const firstChunk = chunks[0] as Blob;
          if (firstChunk && typeof firstChunk.type === 'string' && firstChunk.type) {
            mimeType = firstChunk.type;
          }

          const blob = new Blob(chunks, { type: mimeType });
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
            created_at?: string;
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
          created_at: video.created_at,
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
        const message =
          err instanceof Error ? err.message : '获取视频数据失败';

        // 明确是“视频不存在 / 数据为空”这类情况时，打上 notFound 标记
        if (
          message.includes('未找到') ||
          message.includes('不存在') ||
          message.includes('视频数据为空')
        ) {
          setNotFound(true);
        }

        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoData();
  }, [videoId, supabase]);

  // 非试看链接且视频不存在时，自动跳转回首页，避免停留在错误页
  useEffect(() => {
    if (!isTrial && notFound) {
      router.replace('/');
    }
  }, [isTrial, notFound, router]);

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

  // 预计算每一句字幕对应的高亮分段，避免在每次渲染时重复执行匹配逻辑
  const subtitlesForHighlight = videoData?.subtitles;
  const cardsForHighlight = videoData?.cards;

  const subtitleHighlightSegments: HighlightSegment[][] = useMemo(() => {
    if (!subtitlesForHighlight || !cardsForHighlight) {
      return [];
    }

    return subtitlesForHighlight.map(sub =>
      buildHighlightSegments(sub.text_en, cardsForHighlight)
    );
  }, [subtitlesForHighlight, cardsForHighlight]);

  // 根据当前视频的 knowledge_cards 构建词汇项列表，并与全局状态合并
  // 语义约定：
  // - vocabStatusMap[key] === 'unknown'   => 用户明确标记为「不认识」，保留在单词本中；
  // - vocabStatusMap[key] === 'known'     => 用户明确标记为「认识」，从单词本中移除；
  // - vocabStatusMap[key] === undefined   => 默认视为「在单词本中，状态为未确认」，用于初次预览。
  //
  // 因此 vocabItems 默认展示所有高亮词汇（status !== 'known'），
  // 单词卡中的「认识」操作会写入 'known' 并使该词从列表中消失。
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

      const rawStatus = vocabStatusMap[key]; // 'known' | 'unknown' | undefined
      // 明确标记为 known 的词：认为已经从单词本中移除，不再出现在列表中
      if (rawStatus === 'known') {
        continue;
      }

      // 列表中展示的词要么是用户标记为 unknown，要么尚未确认（默认按 unknown 处理）
      const status: VocabStatus = rawStatus ?? 'unknown';

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
        antonyms: normalized.antonyms,
        structure: normalized.structure,
        register: normalized.register,
        paraphrase: normalized.paraphrase,
        scenario: normalized.scenario,
        functionLabel: normalized.functionLabel,
        difficultyLevel: normalized.difficultyLevel,
        note: normalized.note,
        derivedForm: normalized.derivedForm,
        exampleEn: normalized.exampleEn,
        exampleCn: normalized.exampleCn,
        responseGuide: normalized.responseGuide,
        source,
        status
      };

      items.push(item);
    }

	    return items;
	  }, [videoData?.cards, videoData?.subtitles, usedVocabKeys, vocabStatusMap]);

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

  // 自动播放：当 URL 带有 ?autoplay=1 且不是试看模式时，在当前视频加载后尝试自动开始播放
  useEffect(() => {
    if (!shouldAutoplay || isTrial) return;
    if (!videoData || !isPlayerReady || !streamRef.current) return;

    const currentKey = videoData.cf_video_id || videoData.id;
    if (!currentKey) return;

    // 同一条视频仅尝试自动播放一次，避免在用户手动暂停后被再次强制播放
    if (autoplayHandledRef.current === currentKey) return;
    autoplayHandledRef.current = currentKey;

    // play() 返回 Promise，如果被浏览器的自动播放策略拦截，会进入 catch 分支
    void streamRef.current.play().catch(err => {
      console.warn('自动播放失败，可能被浏览器策略拦截:', err);
    });
  }, [shouldAutoplay, isTrial, videoData, isPlayerReady]);

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
    loopConfig,
    setCurrentTime,
    jumpToSubtitle,
    showCard,
    hideCard,
    setCurrentSubtitle,
    setPlaybackRate,
    toggleSentenceLoop,
    setSentenceLoopMode,
    setSentenceLoopCount,
    setVideoLoopMode,
    setLoopConfig
  } = usePlayerStore();

  const {
    sentenceLoop,
    sentenceLoopMode,
    sentenceLoopCount,
    videoLoopMode
  } = loopConfig;

  const loopMode = sentenceLoopMode;
  const loopCount = sentenceLoopCount;

  // 循环设置草稿：在浮层 / 抽屉中修改时先写入本地草稿，点击「完成」后再一次性应用到全局配置
  const [loopDraft, setLoopDraft] = useState<LoopConfig | null>(null);

  // 已登录用户：从数据库加载全局播放器循环配置
  useEffect(() => {
    if (!supabase || !user?.email) return;

    const client = supabase;
    const email = user.email;
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const { data, error } = await client
          .from('app_users')
          .select('player_settings')
          .eq('email', email)
          .maybeSingle();

        if (error) {
          console.error('加载播放器设置失败:', error);
          return;
        }

        if (!data || !data.player_settings) return;

        const raw = data.player_settings as Partial<LoopConfig> &
          Record<string, unknown>;
        const next: Partial<LoopConfig> = {};

        if (typeof raw.sentenceLoop === 'boolean') {
          next.sentenceLoop = raw.sentenceLoop;
        }
        if (
          raw.sentenceLoopMode === 'infinite' ||
          raw.sentenceLoopMode === 'count'
        ) {
          next.sentenceLoopMode = raw.sentenceLoopMode;
        }
        if (
          typeof raw.sentenceLoopCount === 'number' &&
          Number.isFinite(raw.sentenceLoopCount) &&
          raw.sentenceLoopCount > 0
        ) {
          next.sentenceLoopCount = Math.floor(raw.sentenceLoopCount);
        }
        if (
          raw.videoLoopMode === 'off' ||
          raw.videoLoopMode === 'single' ||
          raw.videoLoopMode === 'sequence'
        ) {
          next.videoLoopMode = raw.videoLoopMode;
        }

        if (!cancelled && Object.keys(next).length > 0) {
          setLoopConfig(next);
        }
      } catch (err) {
        console.error('读取播放器设置异常:', err);
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [supabase, user?.email, setLoopConfig]);

  // 未登录用户：从本地 localStorage 恢复循环配置（仅本设备有效）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (user?.email) return;

    try {
      const raw = window.localStorage.getItem('ie-loop-config');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<LoopConfig> & {
        mode?: 'infinite' | 'count';
        count?: number;
      };

      const next: Partial<LoopConfig> = {};

      // 兼容旧结构：mode + count
      const sentenceMode =
        parsed.sentenceLoopMode ??
        (parsed.mode === 'infinite' || parsed.mode === 'count'
          ? parsed.mode
          : undefined);
      const sentenceCount =
        typeof parsed.sentenceLoopCount === 'number'
          ? parsed.sentenceLoopCount
          : parsed.count;

      if (typeof parsed.sentenceLoop === 'boolean') {
        next.sentenceLoop = parsed.sentenceLoop;
      }
      if (sentenceMode === 'infinite' || sentenceMode === 'count') {
        next.sentenceLoopMode = sentenceMode;
      }
      if (
        typeof sentenceCount === 'number' &&
        Number.isFinite(sentenceCount) &&
        sentenceCount > 0
      ) {
        next.sentenceLoopCount = Math.floor(sentenceCount);
      }
      if (
        parsed.videoLoopMode === 'off' ||
        parsed.videoLoopMode === 'single' ||
        parsed.videoLoopMode === 'sequence'
      ) {
        next.videoLoopMode = parsed.videoLoopMode;
      }

      if (Object.keys(next).length > 0) {
        setLoopConfig(next);
      }
    } catch (err) {
      console.error('读取本地循环配置失败:', err);
    }
  }, [user?.email, setLoopConfig]);

  // 循环配置持久化：登录用户写入数据库，同时本地也缓存一份；未登录仅写本地
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('ie-loop-config', JSON.stringify(loopConfig));
      } catch (err) {
        console.error('写入本地循环配置失败:', err);
      }
    }

    if (!supabase || !user?.email) {
      return;
    }

    const client = supabase;
    const email = user.email;

    const save = async () => {
      try {
        const payload: LoopConfig = {
          sentenceLoop: loopConfig.sentenceLoop,
          sentenceLoopMode: loopConfig.sentenceLoopMode,
          sentenceLoopCount: loopConfig.sentenceLoopCount,
          videoLoopMode: loopConfig.videoLoopMode
        };

        const { error } = await client
          .from('app_users')
          .update({
            player_settings: payload
          })
          .eq('email', email);

        if (error) {
          console.error('更新播放器设置失败:', error);
        }
      } catch (err) {
        console.error('保存播放器设置异常:', err);
      }
    };

    void save();
  }, [loopConfig, supabase, user?.email]);

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
    const { loopConfig: loopCfg } = usePlayerStore.getState();
    const loopOn = loopCfg.sentenceLoop;
    const currentLoopMode = loopCfg.sentenceLoopMode;
    const targetLoopCount = loopCfg.sentenceLoopCount;

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

  // 视频播放结束后的行为：根据全局视频循环模式决定下一步动作
  const handleEnded = () => {
    const player = streamRef.current;
    if (!player || !videoData) {
      setIsPlaying(false);
      return;
    }

    // 试看模式：播完即停，不做自动循环 / 顺播
    if (isTrial) {
      setIsPlaying(false);
      return;
    }

    const { loopConfig: cfg } = usePlayerStore.getState();
    const mode = cfg.videoLoopMode;

    // 单视频循环：回到开头重新播放
    if (mode === 'single') {
      player.currentTime = 0;
      setCurrentTime(0);
      if (videoData.subtitles && videoData.subtitles.length > 0) {
        setCurrentSubtitle(videoData.subtitles, 0);
      }
      setIsPlaying(true);
      void player.play();
      return;
    }

    // 顺序播放：按 created_at 查找下一条已发布视频并跳转
    if (mode === 'sequence') {
      if (!supabase || !videoData.created_at) {
        setIsPlaying(false);
        return;
      }

      const client = supabase;
      const createdAt = videoData.created_at;

      void (async () => {
        try {
          const { data, error } = await client
            .from('videos')
            .select('cf_video_id')
            .eq('status', 'published')
            .gt('created_at', createdAt)
            .order('created_at', { ascending: true })
            .limit(1);

          if (error) {
            console.error('获取下一条视频失败:', error);
            setIsPlaying(false);
            return;
          }

          const next = data && data[0];
          if (!next || !next.cf_video_id) {
            // 已是最后一条：停在当前视频末尾
            setIsPlaying(false);
            return;
          }

          // 跳转到下一条视频，并携带 autoplay=1，提示新页面自动开始播放
          router.push(`/watch/${next.cf_video_id}?autoplay=1`);
        } catch (err) {
          console.error('顺序播放跳转失败:', err);
          setIsPlaying(false);
        }
      })();

      return;
    }

    // 其它情况（off）：默认停在当前视频末尾
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
    const { loopConfig: cfgForClick } = usePlayerStore.getState();
    const loopOn = cfgForClick.sentenceLoop;
    const currentLoopMode = cfgForClick.sentenceLoopMode;
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

    const bubbleWidth = 320;
    // 与 Popover 的 max-h 保持一致：按照视口高度的 70% 预估整体高度，保证卡片完整出现在视口内
    const bubbleHeight = viewportHeight * 0.7;
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

    // 纵向也做一次 clamp，尽量保证整个卡片处于视口内
    const maxTop = viewportHeight - bubbleHeight - margin;
    if (top > maxTop) {
      top = maxTop;
    }
    if (top < margin) {
      top = margin;
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
    const { loopConfig: cfgForSnippet } = usePlayerStore.getState();
    if (cfgForSnippet.sentenceLoop) {
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

  // 单词本：一键将当前类别下所有词标记为「认识」，根据当前 vocabKindFilter 做限定
  const handleMarkRestKnown = useCallback(() => {
    // 只操作当前筛选类别下的词：
    // - 全部：all => 所有 vocabItems
    // - 单词：word => 仅 item.kind === 'word'
    // - 短语：phrase => 仅 item.kind === 'phrase'
    // - 表达：expression => 仅 item.kind === 'expression'
    const keysToMark = vocabItems
      .filter(item => {
        if (vocabKindFilter === 'all') return true;
        return item.kind === vocabKindFilter;
      })
      .map(item => item.key);

    if (keysToMark.length === 0) return;

    setVocabStatusMap(prev => {
      const next = { ...prev };
      for (const key of keysToMark) {
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
      body: JSON.stringify({ words: keysToMark, context })
    }).catch(err => {
      console.error('批量标记词汇状态失败:', err);
    });
  }, [vocabItems, vocabKindFilter, user?.email, videoData]);

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
      loopConfig: cfgForRowLoop,
      currentSubtitleIndex: currentIndex
    } = usePlayerStore.getState();
    const loopOn = cfgForRowLoop.sentenceLoop;

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
      void audio.play().catch(err => {
        console.error('播放本地录音失败:', err);
        setShadowMode('idle');
        setShadowSubtitleIndex(null);
      });
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

  // 切换当前视频收藏状态：一次完整链路，等待后端成功后再更新本地状态
  const handleToggleFavoriteVideo = async () => {
    if (!supabase || !videoData || !user?.email) {
      // 未登录或客户端未就绪时仅提示，不做操作，避免产生匿名脏数据
      console.warn('收藏功能需要登录后使用');
      return;
    }

    const next = !isFavorite;

    try {
      if (next) {
        // 标记为收藏：插入记录（若已存在则忽略）
        const { error } = await supabase
          .from('user_video_favorites')
          .upsert(
            {
              user_email: user.email as string,
              video_id: videoData.id
            },
            {
              onConflict: 'user_email,video_id'
            }
          );
        if (error) {
          console.error('收藏视频失败:', error);
          return;
        }
      } else {
        // 取消收藏：删除对应记录
        const { error } = await supabase
          .from('user_video_favorites')
          .delete()
          .eq('user_email', user.email as string)
          .eq('video_id', videoData.id);
        if (error) {
          console.error('取消收藏视频失败:', error);
          return;
        }
      }

      // 后端更新成功后，再同步本地 UI 状态
      setIsFavorite(next);
    } catch (err) {
      console.error('更新收藏状态异常:', err);
    }
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

  // 初始化当前视频是否已被收藏（必须在任何 return 之前调用 Hook）
  useEffect(() => {
    const loadFavoriteStatus = async () => {
      if (!supabase || !videoData?.id || !user?.email) {
        setIsFavorite(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_video_favorites')
          .select('id')
          .eq('user_email', user.email as string)
          .eq('video_id', videoData.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          // PGRST116: no rows found
          console.error('查询收藏状态失败:', error);
          return;
        }

        setIsFavorite(!!data);
      } catch (err) {
        console.error('加载收藏状态异常:', err);
      }
    };

    void loadFavoriteStatus();
  }, [supabase, videoData?.id, user?.email]);

  // 页面渲染
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-shell)] text-gray-700">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#E88D93]/30 border-t-[#E88D93]" />
          <p className="text-sm text-gray-500">正在加载精读内容...</p>
        </div>
      </div>
    );
  }

  // 非试看链接 + 视频不存在：等待 useEffect 完成重定向时不再渲染错误提示
  if (!isTrial && notFound) {
    return null;
  }

  if (error || !videoData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-shell)] text-gray-900">
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

  // 精读页返回按钮：统一返回首页，避免从不同入口进入时产生跳转混乱
  const handleBackToHome = () => {
    router.push('/');
  };

  return (
    <div className="relative flex h-screen min-h-screen flex-col bg-[var(--bg-body)] text-gray-900 overflow-y-auto lg:h-screen lg:overflow-hidden">
      {/* 桌面端顶部导航栏：移动端在视频上方单独实现 */}
      <header className="hidden h-11 items-center justify-between bg-white/95 px-6 text-xs text-gray-700 shadow-sm shadow-black/5 lg:fixed lg:inset-x-0 lg:top-0 lg:z-30 lg:flex">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          onClick={handleBackToHome}
          aria-label="返回上一页"
        >
          <IconArrowLeft className="h-4 w-4" />
        </button>
        <div className="mx-2 flex-1 truncate text-center text-[13px] font-semibold text-gray-900">
          {videoData.title}
        </div>
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] shadow-sm ${
            isFavorite
              ? 'text-amber-400'
              : 'text-gray-500 hover:border-gray-300 hover:bg-gray-50'
          }`}
          aria-label={isFavorite ? '取消收藏本集' : '收藏本集'}
          onClick={handleToggleFavoriteVideo}
        >
          <IconFavorite filled={isFavorite} className="h-3.5 w-3.5" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[414px] flex-1 flex-col px-0 pt-0 lg:max-w-[1600px] lg:px-4 lg:pb-10 lg:pt-20">
        <div className="flex flex-1 flex-col lg:gap-6 lg:flex-row lg:items-start">
          {/* 左侧：全能学习台 THE STATION */}
          <section className="flex w-full flex-col lg:w-[70%] lg:max-w-[960px]">
            <div
              ref={videoRef}
              // 注意：这里不要再加 overflow-hidden，否则会导致内部使用 position: sticky 的视频区域在移动端失效
              className={
                panelMode === 'vocab'
                  ? 'flex h-full flex-col rounded-2xl bg-transparent shadow-none lg:bg-white lg:shadow-sm'
                  : 'flex h-full flex-col rounded-2xl bg-white shadow-sm'
              }
            >
              {/* 移动端顶部返回栏：与视频区域分离，固定在顶部，避免滚动时产生割裂感 */}
              <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between px-4 text-xs text-gray-700 bg-[var(--bg-body)]/95 backdrop-blur lg:hidden">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm shadow-black/5"
                  onClick={handleBackToHome}
                  aria-label="回到首页"
                >
                  <IconArrowLeft className="h-4 w-4" />
                </button>
                <div className="mx-2 flex-1 truncate text-center text-[14px] font-semibold text-gray-900">
                  {videoData.title}
                </div>
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-xs shadow-sm shadow-black/5 ${
                    isFavorite
                      ? 'text-amber-400'
                      : 'text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  aria-label={isFavorite ? '取消收藏本集' : '收藏本集'}
                  onClick={handleToggleFavoriteVideo}
                >
                  <IconFavorite filled={isFavorite} className="h-4 w-4" />
                </button>
              </div>
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
                {/* 占位：在移动端预留 16:9 高度 + 单词卡 Tabs 高度，避免下面内容被固定区域遮挡 */}
                <div className="aspect-video w-full lg:hidden" />
                {panelMode === 'vocab' && vocabItems.length > 0 && (
                  // 预留高度略大于 Tabs 实际高度，避免首个单词卡被遮挡一部分
                  <div className="h-20 w-full lg:hidden" />
                )}

                {/* 真正的视频容器：小屏 fixed 顶部（在移动端头部下方），大屏正常随内容滚动 */}
                <div className="fixed inset-x-0 top-12 z-20 lg:static lg:inset-auto lg:top-auto lg:z-auto">
                  <div className="mx-auto w-full max-w-[414px] px-0 lg:max-w-[1600px] lg:px-0">
                    <div className="relative mx-1 aspect-video w-auto overflow-hidden rounded-2xl bg-black shadow-lg shadow-black/25 lg:mx-0 lg:w-full lg:rounded-3xl">
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
                        autoplay={shouldAutoplay && !isTrial}
                        streamRef={streamRef}
                        onTimeUpdate={handleTimeUpdate}
                        poster={videoData.poster}
                        preload="auto"
                        onLoadedData={handlePlayerLoaded}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onEnded={handleEnded}
                      />
                      {/* 视频右下角品牌角标：每天跟着油管无痛学英语（无底色，白字 + 强文字阴影） */}
                      <div className="pointer-events-none absolute bottom-3 right-4 z-10 lg:bottom-4 lg:right-6">
                        <div className="video-watermark">每天跟着油管无痛学英语</div>
                      </div>
                    </div>

                    {/* 移动端：生词模式下，单词类型 Tabs 组件与视频一起吸顶，视觉上独立成一个白色功能块 */}
                    {panelMode === 'vocab' && vocabItems.length > 0 && (
                      <div className="mt-2 px-2 pb-2 text-[12px] lg:hidden">
                        <div className="flex items-center gap-2 rounded-2xl border border-stone-100 bg-white/95 px-3 py-2 shadow-sm shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                          <div className="flex flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
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
                                  className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                                    active
                                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.04)] border border-white/80'
                                      : 'bg-white/80 text-stone-500 border border-stone-200 hover:bg-white hover:text-stone-900 hover:border-stone-300'
                                  }`}
                                  onClick={() => setVocabKindFilter(tab.value)}
                                >
                                  {tab.label}
                                </button>
                              );
                            })}
                          </div>
                          {/* 当前类别一键标记为认识（移动端） */}
                          <div className="flex items-center">
                            {(() => {
                              const hasAnyInFilter = vocabItems.some(item => {
                                if (vocabKindFilter === 'all') return true;
                                return item.kind === vocabKindFilter;
                              });

                              return (
                                <button
                                  type="button"
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] ${
                                    hasAnyInFilter
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm shadow-[rgba(16,185,129,0.25)] hover:bg-emerald-100'
                                      : 'border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed'
                                  }`}
                                  disabled={!hasAnyInFilter}
                                  onClick={handleMarkRestKnown}
                                  aria-label="将当前类别全部标记为认识"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                  >
                                    <path
                                      d="M5 13l4 4L19 7"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
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
                      className="h-11 px-5 rounded-2xl border border-[var(--accent-soft)] bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)] flex items-center gap-2 hover:bg-[var(--accent-soft)]/90 transition-colors"
                      onClick={() => handleRowReplay(currentSubtitleIndex)}
                      disabled={isTrial && trialEnded}
                    >
                      <IconReplay className="h-[18px] w-[18px]" />
                    </button>

                    {/* 单句循环：支持次数 / 无限模式（PC 浮层按钮组） */}
                    <div className="relative">
                      <button
                        type="button"
                        className={`h-11 w-11 flex items-center justify-center rounded-2xl border transition-all font-bold ${
                          sentenceLoop
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.06)]'
                            : 'border-transparent bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                        }`}
                        title="单句循环"
                        onClick={() => {
                          // PC 端点击仅负责展开 / 关闭配置浮层，循环开关在浮层中设置
                          setIsLoopMenuOpen(prev => {
                            const next = !prev;
                            if (next) {
                              const { loopConfig: cfg } = usePlayerStore.getState();
                              setLoopDraft(cfg);
                            } else {
                              setLoopDraft(null);
                            }
                            return next;
                          });
                        }}
                        disabled={isTrial && trialEnded}
                      >
                        <span className="text-lg leading-none">
                          {loopMode === 'count'
                            ? Math.max(1, loopCount)
                            : '∞'}
                        </span>
                      </button>
                      {isLoopMenuOpen && !trialEnded && (
                        <div className="absolute left-0 top-[120%] z-20 rounded-2xl border border-stone-100 bg-white/98 px-3 py-2 text-[11px] shadow-lg shadow-black/5">
                          {/* 句子循环配置 */}
                          <div className="mb-1 text-[10px] text-stone-400">
                            句子循环
                          </div>
                          <div className="flex items-center gap-1">
                            {/* 关闭句子循环 */}
                            <button
                              type="button"
                              className={`h-7 px-2 rounded-full text-[11px] font-medium ${
                                !sentenceLoop
                                  ? 'bg-[var(--accent)] text-white shadow-sm shadow-[rgba(0,0,0,0.05)]'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                              onClick={() => {
                                const { loopConfig: cfg } = usePlayerStore.getState();
                                if (cfg.sentenceLoop) {
                                  toggleSentenceLoop();
                                  currentRepeatCountRef.current = 0;
                                }
                              }}
                            >
                              关
                            </button>
                            {/* 次数循环：2 / 3 / 5 / 10 次 */}
                            {[2, 3, 5, 10].map(count => (
                              <button
                                key={count}
                                type="button"
                                className={`h-7 w-7 rounded-full text-[11px] font-medium ${
                                  sentenceLoop &&
                                  loopMode === 'count' &&
                                  loopCount === count
                                    ? 'bg-[var(--accent)] text-white shadow-sm shadow-[rgba(0,0,0,0.05)]'
                                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                                }`}
                                onClick={() => {
                                  const { loopConfig: cfg, currentSubtitleIndex: idx } =
                                    usePlayerStore.getState();
                                  const loopOnNow = cfg.sentenceLoop;

                                  if (!loopOnNow) {
                                    toggleSentenceLoop();
                                  }
                                  setSentenceLoopMode('count');
                                  setSentenceLoopCount(count);
                                  currentRepeatCountRef.current = 0;

                                  // 跳回当前句开头，确保从头开始循环
                                  if (videoData?.subtitles && streamRef.current) {
                                    const current = videoData.subtitles[idx];
                                    if (current) {
                                      if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                        return;
                                      }
                                      streamRef.current.currentTime = current.start;
                                      jumpToSubtitle(idx);
                                    }
                                  }
                                }}
                              >
                                {count}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={`h-7 w-7 rounded-full text-[11px] font-medium ${
                                sentenceLoop && loopMode === 'infinite'
                                  ? 'bg-[var(--accent)] text-white shadow-sm shadow-[rgba(0,0,0,0.05)]'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                              onClick={() => {
                                const { loopConfig: cfg, currentSubtitleIndex: idx } =
                                  usePlayerStore.getState();
                                const loopOnNow = cfg.sentenceLoop;

                                if (!loopOnNow) {
                                  toggleSentenceLoop();
                                }
                                setSentenceLoopMode('infinite');
                                currentRepeatCountRef.current = 0;

                                if (videoData?.subtitles && streamRef.current) {
                                  const current = videoData.subtitles[idx];
                                  if (current) {
                                    if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                      return;
                                    }
                                    streamRef.current.currentTime = current.start;
                                    jumpToSubtitle(idx);
                                  }
                                }
                              }}
                            >
                              ♾️
                            </button>
                          </div>

                          {/* 视频循环配置 */}
                          <div className="mt-2 h-px w-full bg-stone-100" />
                          <div className="mt-2 text-[10px] text-stone-400">
                            视频循环
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              className={`h-7 px-2 rounded-full text-[11px] font-medium ${
                                videoLoopMode === 'off'
                                  ? 'bg-stone-900 text-white shadow-sm shadow-black/10'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                              onClick={() => {
                                setVideoLoopMode('off');
                              }}
                            >
                              关
                            </button>
                            <button
                              type="button"
                              className={`h-7 px-2 rounded-full text-[11px] font-medium ${
                                videoLoopMode === 'single'
                                  ? 'bg-stone-900 text-white shadow-sm shadow-black/10'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                              onClick={() => {
                                setVideoLoopMode('single');
                              }}
                            >
                              单视频
                            </button>
                            <button
                              type="button"
                              className={`h-7 px-2 rounded-full text-[11px] font-medium ${
                                videoLoopMode === 'sequence'
                                  ? 'bg-stone-900 text-white shadow-sm shadow-black/10'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                              onClick={() => {
                                setVideoLoopMode('sequence');
                              }}
                            >
                              顺播
                            </button>
                          </div>
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              className="rounded-full px-3 py-1 text-[11px] font-medium text-stone-500 hover:bg-stone-100"
                              onClick={() => setIsLoopMenuOpen(false)}
                            >
                              完成
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
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                          : shadowSubtitleIndex === currentSubtitleIndex &&
                            shadowMode === 'reviewing'
                          ? 'bg-blue-50 border-blue-400 text-blue-600'
                          : 'bg-white border-stone-100 text-stone-500 hover:border-[var(--accent)] hover:text-[var(--accent)]'
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
                        {(subtitleHighlightSegments[currentSubtitleIndex] ??
                          [{ text: activeSubtitle.text_en }]
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
          {/* 移动端：整体向下偏移一段距离，避免第一句字幕被悬浮视频遮挡 */}
          <aside className="mt-4 h-full flex w-full flex-1 flex-col lg:mt-0 lg:w-[30%] lg:flex-none">
            {/* 移动端：背景沿用整页的浅灰色，只让具体卡片是白色；PC 端保留原有白色卡片容器 */}
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent lg:max-h-[calc(100vh-180px)] lg:rounded-2xl lg:border lg:border-gray-100 lg:bg-white lg:shadow-sm">
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
                    >
                      <span className="relative inline-flex">
                        <IconVocab className="h-3.5 w-3.5" />
                        {user && vocabUnknownCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent)] shadow-sm shadow-[rgba(232,141,147,0.5)]" />
                        )}
                      </span>
                      <span>生词</span>
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
                                  ? 'bg-white text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.03)] border border-[var(--accent-soft)]'
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
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-transparent text-stone-400 hover:bg-stone-100 hover:text-[var(--accent)]"
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
                            ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-[rgba(16,185,129,0.25)] hover:bg-emerald-100'
                            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                        }`}
                        disabled={vocabItems.length === 0}
                        onClick={handleMarkRestKnown}
                      >
                        全部标记为认识
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
                  className={`feed-list absolute inset-0 overflow-y-auto overflow-x-hidden pb-[100px] lg:static lg:h-full lg:pb-0 scroll-smooth lg:scroll-auto no-scrollbar ${
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
                      : 'lg:hover:border-slate-300 lg:hover:shadow-sm';

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
                        {/* 时间 + 收藏：统一做成小胶囊，增强“时间轴”工具感 */}
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[2px] font-medium ${
                              isActive
                                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-400/60'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                            <span>{formatDuration(subtitle.start)}</span>
                          </span>
                          <button
                            type="button"
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                              likedSubtitles.has(index)
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-400/50'
                                : 'border-transparent text-gray-300 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600'
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
                            {(subtitleHighlightSegments[index] ??
                              [{ text: subtitle.text_en }]
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
                                ? 'text-[var(--accent)]'
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

                  {/* 生词流：PC 端右侧面板复习视图；移动端占用视频下方剩余高度，内部列表自己滚动 */}
                  <div
                    className={`flex h-full min-h-0 flex-col pb-4 pt-3 lg:absolute lg:inset-0 lg:h-full lg:px-4 lg:overflow-y-auto ${
                      panelMode === 'vocab' ? '' : 'hidden'
                    }`}
                  >
                  {vocabItems.length === 0 && (
                    <div className="mt-10 rounded-2xl bg-stone-50 px-4 py-6 text-center text-[11px] text-stone-500">
                      本视频暂时还没有可复习的生词。先在字幕中点击单词，标记为“不认识”再来这里看看。
                    </div>
                  )}

                    {vocabItems.length > 0 && (
                      <>
                        {/* 生词卡片列表：PC / APP 共用，宽度与视频一致。
                            内层列表作为唯一滚动容器，确保移动端可以滑到所有内容 */}
                        <div className="flex-1 overflow-y-auto pt-1 pb-4">
                          {/* PC 端：在列表顶部保留类型 Tabs（移动端使用上方固定区域） */}
                          <div className="mb-2 mt-0 hidden items-center gap-2 text-[12px] lg:flex">
                            <div className="flex flex-1 items-center gap-2">
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
                                    className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                                      active
                                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm shadow-[rgba(0,0,0,0.04)] border border-white/80'
                                        : 'bg-white text-stone-500 border border-stone-200 hover:bg-stone-50 hover:text-stone-900 hover:border-stone-300'
                                    }`}
                                    onClick={() => setVocabKindFilter(tab.value)}
                                  >
                                    {tab.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {vocabItems
                              .filter(item => {
                                const matchKind =
                                    vocabKindFilter === 'all' ||
                                    item.kind === vocabKindFilter;
                                if (!matchKind) return false;
                                return true;
                              })
                              .map(item => {
                                const isUnknown = vocabStatusMap[item.key] !== 'known';

                                return (
                                    <RefinedVocabCard
                                        key={item.key}
                                        item={item}
                                        isUnknown={isUnknown}
                                        onPlayAudio={() => handlePlayVocabClip(item)}
                                        onUpdateStatus={(status) => handleUpdateVocabStatus(item.key, status)}
                                        onPlaySentence={() => handlePlayVocabClip(item)}
                                    />
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
            className="pointer-events-auto absolute w-[340px] max-h-[70vh] overflow-y-auto rounded-3xl border border-white/60 bg-white/95 px-4 py-3.5 text-[12px] text-gray-900 shadow-[0_18px_45px_rgba(15,23,42,0.22)] backdrop-blur-xl"
            style={{
              top: cardPopover.top,
              left: cardPopover.left
            }}
          >
            {/* 小三角 */}
            <div
              className={`absolute h-2.5 w-2.5 rotate-45 border border-white/60 bg-white/95 shadow-[0_4px_12px_rgba(15,23,42,0.16)] ${
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
              const rawTypeLabel = getRawTypeLabel(
                cardPopover.card.data.type
              );

              const isWord = normalized.kind === 'word';
              const isPhrase = normalized.kind === 'phrase';
              const isExpression = normalized.kind === 'expression';

              // PC 顶部仅展示难度等级，类型信息交给右上角的 type pill 负责，避免冲突
              const metaLabel = normalized.difficultyLevel || null;

              return (
                <>
                  {/* 头部：单词 + IPA + 类型标签 + 简单类别行 */}
                  <div className="mb-2 flex items-start justify-between gap-2 border-b border-stone-100 pb-2">
                    <div className="flex-1">
                      <div className="vocab-word text-[18px] font-semibold text-gray-900">
                        {normalized.headword ||
                          cardPopover.card.trigger_word}
                      </div>
                      {normalized.ipa && (
                        <div className="mt-0.5 text-[12px] text-gray-500">
                          {normalized.ipa}
                        </div>
                      )}
                      <div className="mt-1 text-[12px] font-medium text-gray-900">
                        {normalized.pos && (
                          <span className="mr-1 font-medium text-gray-700">
                            {normalized.pos}
                          </span>
                        )}
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-[1px] font-semibold text-[var(--accent)]">
                          {normalized.def}
                        </span>
                      </div>
                      {metaLabel && (
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {metaLabel}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {typeLabel && (
                        <span className="rounded-full bg-stone-100 px-2.5 py-[3px] text-[11px] text-stone-700">
                          {typeLabel}
                        </span>
                      )}
                      {normalized.ipa && (
                        <button
                          type="button"
                          className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-[var(--accent)] hover:text-[var(--accent)]"
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

	                  {/* 类型相关信息 & 搭配等分区展示，避免信息挤在一起 */}
	                  {(isWord || isPhrase) &&
		                    (normalized.collocations ||
		                      normalized.synonyms ||
		                      normalized.antonyms ||
		                      normalized.derivedForm) && (
		                        <div className="mt-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-900">
		                          <div className="mb-1 flex items-center justify-between">
		                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
		                              要点
		                            </span>
		                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
		                              {isWord ? '单词' : '短语'}
		                            </span>
		                          </div>
		                          <div className="grid grid-cols-2 gap-2">
		                            {normalized.collocations && (
		                              <div className="col-span-2">
		                                <div className="text-[10px] font-semibold text-neutral-500">
		                                  搭配
		                                </div>
		                                <div className="mt-0.5 line-clamp-2 text-neutral-900">
		                                  {normalized.collocations.join(' · ')}
		                                </div>
		                              </div>
		                            )}
		                            {normalized.synonyms && (
		                              <div className="col-span-2">
		                                <div className="text-[10px] font-semibold text-neutral-500">
		                                  近义
		                                </div>
		                                <div className="mt-0.5 line-clamp-2 text-neutral-900">
		                                  {normalized.synonyms.join(' · ')}
		                                </div>
		                              </div>
		                            )}
		                            {normalized.antonyms && (
		                              <div className="col-span-2">
		                                <div className="text-[10px] font-semibold text-neutral-500">
		                                  反义
		                                </div>
		                                <div className="mt-0.5 line-clamp-2 text-neutral-900">
		                                  {normalized.antonyms.join(' · ')}
		                                </div>
		                              </div>
		                            )}
		                            {normalized.derivedForm && (
		                              <div className="col-span-2">
		                                <div className="text-[10px] font-semibold text-neutral-500">
		                                  词形
		                                </div>
		                                <div className="mt-0.5 font-mono text-[11px] text-neutral-900">
		                                  {normalized.derivedForm}
		                                </div>
		                              </div>
		                            )}
		                          </div>
		                        </div>
	                    )}

	                  {isPhrase && normalized.structure && (
	                    <div className="mt-2 rounded-2xl border border-neutral-100 bg-white px-3 py-2 text-[12px] text-neutral-900">
	                      <div className="mb-1 flex items-center justify-between">
	                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
	                          结构
	                        </span>
	                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
	                          短语
	                        </span>
	                      </div>
	                      <div className="rounded-xl bg-neutral-900/[0.03] px-2 py-1 font-mono text-[11px] text-neutral-900">
	                        {normalized.structure}
	                      </div>
	                    </div>
	                  )}

	                    {isExpression && (
	                      <div className="mt-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-900">
	                        <div className="mb-1 flex items-center justify-between">
	                          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
	                            要点
	                          </span>
	                          <span className="rounded-full bg-[#fff4e5] px-2 py-0.5 text-[10px] font-semibold text-[#c56a2d]">
	                            表达
	                          </span>
	                        </div>
	                        <div className="grid grid-cols-2 gap-2">
	                          {normalized.functionLabel && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                功能
	                              </div>
	                              <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                {normalized.functionLabel}
	                              </div>
	                            </div>
	                          )}
	                          {normalized.scenario && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                场景
	                              </div>
	                              <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                {normalized.scenario}
	                              </div>
	                            </div>
	                          )}
	                          {normalized.register && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                语域
	                              </div>
	                              <div className="mt-0.5">
	                                <span className="inline-flex rounded-full border border-[#f2e0c7] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#c56a2d]">
	                                  {normalized.register}
	                                </span>
	                              </div>
	                            </div>
	                          )}
	                          {normalized.responseGuide && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                接话
	                              </div>
	                              <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                {normalized.responseGuide}
	                              </div>
	                            </div>
	                          )}
	                        </div>
	                      </div>
	                  )}

                  {/* 额外例句（区别于原字幕句） */}
                    {(normalized.exampleEn || normalized.exampleCn) && (
                      <div className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-600">
                        额外例句
                      </div>
                      {normalized.exampleEn && (
                        <div className="italic">
                          {normalized.exampleEn}
                        </div>
                      )}
                      {normalized.exampleCn && (
                        <div className="mt-0.5 text-gray-600">
                          {normalized.exampleCn}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 使用提示 */}
                    {normalized.note && (
                      <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                        用法提醒
                      </div>
                      <div>{normalized.note}</div>
                    </div>
                  )}

                  {/* 视频原句 */}
                    {(normalized.sourceSentenceEn ||
                      normalized.sourceSentenceCn) && (
                      <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-900">
                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        视频原句
                      </div>
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

              return (
                <div className="mt-3 flex">
                  <button
                    type="button"
                    className={`flex-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                      isUnknown
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100'
                        : 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm shadow-[rgba(0,0,0,0.12)]'
                    }`}
                    onClick={e => {
                      e.stopPropagation();
                      // 与移动端保持一致：未加入生词本时标记为“不认识”，
                      // 已在生词本时点击视为“认识”（从生词本移除）
                      handleUpdateVocabStatus(
                        vocabKey,
                        isUnknown ? 'known' : 'unknown'
                      );
                    }}
                  >
                    {isUnknown ? '认识' : '不认识'}
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
            className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[28px] border-t border-white/70 bg-white/88 px-4 pb-6 pt-3 text-[13px] text-neutral-900 shadow-[0_-22px_60px_rgba(15,23,42,0.65)] backdrop-blur-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-44 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.18),transparent_62%)]" />
            <div className="mx-auto max-w-2xl">
              {(() => {
                const normalized = normalizeKnowledgeForDisplay(
                  activeCard,
                  videoData?.subtitles
                );
                const typeLabel = getCardTypeLabel(
                  activeCard.data.type
                );
                const rawTypeLabel = getRawTypeLabel(
                  activeCard.data.type
                );

                const isWord = normalized.kind === 'word';
                const isPhrase = normalized.kind === 'phrase';
                const isExpression = normalized.kind === 'expression';

	              return (
	                <>
                    <div className="mb-3">
                      {/* 顶部拖拽条，弱化“弹窗”感，强化 Bottom Sheet 观感 */}
                      <div className="mb-2 flex justify-center">
                        <div className="h-1 w-10 rounded-full bg-neutral-200" />
                      </div>
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                          <div className="vocab-word text-[19px] font-semibold text-neutral-900">
                            {normalized.headword ||
                              activeCard.trigger_word}
                          </div>
                          {normalized.ipa && (
                            <span className="mt-0.5 text-[13px] text-neutral-500">
                              {normalized.ipa}
                            </span>
                          )}
                          <div className="mt-1 text-[13px] font-medium text-neutral-900">
                            {normalized.pos && (
                              <span className="mr-1 font-medium text-neutral-600">
                                {normalized.pos}
                              </span>
                            )}
                            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-[1px] font-semibold text-[var(--accent)]">
                              {normalized.def}
                            </span>
                          </div>
                          {normalized.difficultyLevel && (
                            <div className="mt-0.5 text-[11px] text-neutral-500">
                              {normalized.difficultyLevel}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {typeLabel && (
                            <span className="rounded-full bg-neutral-100 px-2.5 py-[3px] text-[11px] font-semibold text-neutral-600">
                              {typeLabel}
                            </span>
                          )}
                          {normalized.ipa && (
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              onClick={() => playCardAudio(activeCard)}
                              aria-label="播放单词读音"
                            >
                              <IconSound className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

	                    {/* 要点区：用统一的“块 + 小标题”去做层级，避免“满屏都是字” */}
	                    {(isWord || isPhrase) &&
	                      (normalized.collocations ||
	                        normalized.synonyms ||
	                        normalized.antonyms ||
	                        normalized.derivedForm) && (
	                        <div className="mt-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-900">
	                          <div className="mb-1 flex items-center justify-between">
	                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
	                              要点
	                            </span>
	                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
	                              {isWord ? '单词' : '短语'}
	                            </span>
	                          </div>
	                          <div className="grid grid-cols-2 gap-2">
	                            {normalized.collocations && (
	                              <div className="col-span-2">
	                                <div className="text-[10px] font-semibold text-neutral-500">
	                                  搭配
	                                </div>
	                                <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                  {normalized.collocations.join(' · ')}
	                                </div>
	                              </div>
	                            )}
	                            {normalized.synonyms && (
	                              <div className="col-span-2">
	                                <div className="text-[10px] font-semibold text-neutral-500">
	                                  近义
	                                </div>
	                                <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                  {normalized.synonyms.join(' · ')}
	                                </div>
	                              </div>
	                            )}
	                            {normalized.antonyms && (
	                              <div className="col-span-2">
	                                <div className="text-[10px] font-semibold text-neutral-500">
	                                  反义
	                                </div>
	                                <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                  {normalized.antonyms.join(' · ')}
	                                </div>
	                              </div>
	                            )}
	                            {normalized.derivedForm && (
	                              <div className="col-span-2">
	                                <div className="text-[10px] font-semibold text-neutral-500">
	                                  词形
	                                </div>
	                                <div className="mt-0.5 font-mono text-[11px] text-neutral-900">
	                                  {normalized.derivedForm}
	                                </div>
	                              </div>
	                            )}
	                          </div>
	                        </div>
	                      )}

	                    {isPhrase && normalized.structure && (
	                      <div className="mt-2 rounded-2xl border border-neutral-100 bg-white px-3 py-2 text-[12px] text-neutral-900">
	                        <div className="mb-1 flex items-center justify-between">
	                          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
	                            结构
	                          </span>
	                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
	                            短语
	                          </span>
	                        </div>
	                        <div className="rounded-xl bg-neutral-900/[0.03] px-2 py-1 font-mono text-[11px] text-neutral-900">
	                          {normalized.structure}
	                        </div>
	                      </div>
	                    )}

	                    {isExpression && (
	                      <div className="mt-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-900">
	                        <div className="mb-1 flex items-center justify-between">
	                          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
	                            要点
	                          </span>
	                          <span className="rounded-full bg-[#fff4e5] px-2 py-0.5 text-[10px] font-semibold text-[#c56a2d]">
	                            表达
	                          </span>
	                        </div>
	                        <div className="grid grid-cols-2 gap-2">
	                          {normalized.functionLabel && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                功能
	                              </div>
	                              <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                {normalized.functionLabel}
	                              </div>
	                            </div>
	                          )}
	                          {normalized.scenario && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                场景
	                              </div>
	                              <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                {normalized.scenario}
	                              </div>
	                            </div>
	                          )}
	                          {normalized.register && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                语域
	                              </div>
	                              <div className="mt-0.5">
	                                <span className="inline-flex rounded-full border border-[#f2e0c7] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#c56a2d]">
	                                  {normalized.register}
	                                </span>
	                              </div>
	                            </div>
	                          )}
	                          {normalized.responseGuide && (
	                            <div className="col-span-2">
	                              <div className="text-[10px] font-semibold text-neutral-500">
	                                接话
	                              </div>
	                              <div className="mt-0.5 line-clamp-2 text-neutral-900">
	                                {normalized.responseGuide}
	                              </div>
	                            </div>
	                          )}
	                        </div>
	                      </div>
		                    )}

	                    {(normalized.exampleEn || normalized.exampleCn) && (
	                      <div className="mt-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-900">
	                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
	                          额外例句
	                        </div>
	                        {normalized.exampleEn && (
	                          <div className="italic">
	                            {normalized.exampleEn}
	                          </div>
	                        )}
	                        {normalized.exampleCn && (
	                          <div className="mt-0.5 text-neutral-600">
	                            {normalized.exampleCn}
	                          </div>
	                        )}
	                      </div>
	                    )}

	                    {normalized.note && (
	                      <div className="mt-2 rounded-2xl border border-rose-100 bg-[var(--accent-soft)] px-3 py-2 text-[12px] text-neutral-900">
	                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
	                          用法提醒
	                        </div>
	                        <div>{normalized.note}</div>
	                      </div>
	                    )}

                    {(normalized.sourceSentenceEn ||
                      normalized.sourceSentenceCn) && (
                      <div className="mt-2 rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-900">
                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          视频原句
                        </div>
                        {normalized.sourceSentenceEn && (
                          <div className="italic">
                            {normalized.sourceSentenceEn}
                          </div>
                        )}
                        {normalized.sourceSentenceCn && (
                          <div className="mt-0.5 text-[11px] text-neutral-600">
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
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100'
                          : 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm shadow-[rgba(0,0,0,0.12)]'
                      }`}
                      onClick={() => {
                        // 未选中 -> 标记为“不认识”；已在生词本 -> 标记为“认识”（known）
                        handleUpdateVocabStatus(
                          vocabKey,
                          isUnknown ? 'known' : 'unknown'
                        );
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
                      {isUnknown ? '认识' : '不认识'}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-neutral-200 bg-white px-3 py-2 text-[12px] font-medium text-neutral-600 hover:border-neutral-300 hover:text-neutral-900"
                      onClick={hideCard}
                    >
                      收起
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

              {/* 倍速 / 字幕设置 Bottom Sheet（APP 端与循环配置统一为抽屉形式） */}
              {isSpeedMenuOpen && !trialEnded && (
                <div
                  className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/20 lg:hidden"
                  onClick={() => setIsSpeedMenuOpen(false)}
                >
                  <div className="relative w-full max-w-[414px] overflow-hidden rounded-t-[28px] border border-white/70 bg-white/85 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_18px_60px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
                    {/* 顶部柔光：更“精致生活感”，但不抢内容 */}
                    <div className="pointer-events-none absolute -top-24 left-1/2 h-44 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.18),transparent_62%)]" />
                    {/* 顶部拖拽条 */}
                    <div className="relative mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-200" />
                    <button
                      type="button"
                      className="absolute right-4 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
                      aria-label="关闭播放设置"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSpeedMenuOpen(false);
                      }}
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
                    <div className="relative mb-3 text-center text-[12px] font-semibold text-neutral-900">
                      播放设置
                    </div>

                    <div className="relative space-y-4">
                      {/* 倍速设置 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-medium text-neutral-600">
                          <span>倍速</span>
                          <span className="font-bold text-neutral-900">
                            {playbackRate}x
                          </span>
                        </div>
                        <div className="flex justify-between gap-1">
                          {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                            <button
                              key={speed}
                              onClick={() => setPlaybackRate(speed)}
                              className={`h-8 w-8 rounded-full text-[11px] font-medium transition-all ${
                                playbackRate === speed
                                  ? 'bg-neutral-900 text-white scale-110 shadow-md'
                                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                              }`}
                            >
                              {speed}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 字幕显示模式设置 */}
                      <div className="h-px w-full bg-neutral-100/80" />
                      <div>
                        <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-600">
                          <span>字幕显示</span>
                        </div>
                        <div className="flex rounded-full bg-neutral-100 p-1">
                          {(['cn', 'both', 'en'] as ('cn' | 'both' | 'en')[]).map(
                            mode => (
                              <button
                                key={mode}
                                onClick={() => setScriptMode(mode)}
                                className={`flex-1 rounded-full py-1.5 text-[11px] font-medium transition-all ${
                                  scriptMode === mode
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500'
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

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        className="rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_14px_34px_-18px_rgba(15,23,42,0.6)] active:scale-95"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsSpeedMenuOpen(false);
                        }}
                      >
                        完成
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 移动端：循环设置 Bottom Sheet（句子循环 + 视频循环） */}
              {isLoopMenuOpen && !trialEnded ? (
                // 移动端循环配置 Bottom Sheet：从屏幕底部整块滑出，覆盖底部浮岛
                <div
                  className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/20 lg:hidden"
                  onClick={() => {
                    setIsLoopMenuOpen(false);
                    setLoopDraft(null);
                  }}
                >
                  <div className="relative w-full max-w-[414px] overflow-hidden rounded-t-[28px] border border-white/70 bg-white/85 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_18px_60px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
                    <div className="pointer-events-none absolute -top-24 left-1/2 h-44 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(232,141,147,0.18),transparent_62%)]" />
                    {/* 顶部拖拽条 */}
                    <div className="relative mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-200" />
                    <button
                      type="button"
                      className="absolute right-4 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
                      aria-label="关闭循环设置"
                      onClick={() => {
                        setIsLoopMenuOpen(false);
                        setLoopDraft(null);
                      }}
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
                    <div className="relative mb-3 text-center text-[12px] font-semibold text-neutral-900">
                      循环
                    </div>

                    <div className="relative space-y-4">
                      {/* 句子循环设置 */}
                      <div>
                        {(() => {
                          const draft = loopDraft ?? loopConfig;
                          const draftSentenceLoop = draft.sentenceLoop;
                          const draftMode = draft.sentenceLoopMode;
                          const draftCount = draft.sentenceLoopCount;

                          return (
                            <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-600">
                              <span>句子循环</span>
                              <span className="text-neutral-500">
                                {!draftSentenceLoop
                                  ? '已关闭'
                                  : draftMode === 'count'
                                  ? `每句 ${Math.max(2, draftCount)} 次`
                                  : '无限循环'}
                              </span>
                            </div>
                          );
                        })()}
                        <div className="flex justify-between gap-1">
                          {(() => {
                            const draft = loopDraft ?? loopConfig;
                            const draftSentenceLoop = draft.sentenceLoop;
                            const draftMode = draft.sentenceLoopMode;
                            const draftCount = draft.sentenceLoopCount;

                            // 关闭句子循环
                            const handleCloseSentenceLoop = () => {
                              setLoopDraft(prev => {
                                const base = prev ?? loopConfig;
                                return {
                                  ...base,
                                  sentenceLoop: false
                                };
                              });
                              currentRepeatCountRef.current = 0;
                            };

                            const handleCountClick = (count: number) => {
                              setLoopDraft(prev => {
                                const base = prev ?? loopConfig;
                                return {
                                  ...base,
                                  sentenceLoop: true,
                                  sentenceLoopMode: 'count',
                                  sentenceLoopCount: count
                                };
                              });
                              currentRepeatCountRef.current = 0;

                              const { currentSubtitleIndex: idx } =
                                usePlayerStore.getState();
                              if (videoData?.subtitles && streamRef.current) {
                                const current = videoData.subtitles[idx];
                                if (current) {
                                  if (
                                    isTrial &&
                                    current.start >= TRIAL_LIMIT_SECONDS
                                  ) {
                                    return;
                                  }
                                  streamRef.current.currentTime = current.start;
                                  jumpToSubtitle(idx);
                                }
                              }
                            };

                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={handleCloseSentenceLoop}
                                  className={`h-8 flex-1 rounded-full text-[11px] font-medium ${
                                    !draftSentenceLoop
                                      ? 'bg-neutral-900 text-white shadow-md'
                                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                  }`}
                                >
                                  关
                                </button>
                                {[2, 3, 5, 10].map(count => (
                                  <button
                                    key={count}
                                    type="button"
                                    onClick={() => handleCountClick(count)}
                                    className={`h-8 flex-1 rounded-full text-[11px] font-medium ${
                                      draftSentenceLoop &&
                                      draftMode === 'count' &&
                                      draftCount === count
                                        ? 'bg-neutral-900 text-white shadow-md'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                                  >
                                    {count}×
                                  </button>
                                ))}
                              </>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => {
                              const { loopConfig: cfg, currentSubtitleIndex: idx } =
                                usePlayerStore.getState();
                              const loopOnNow = cfg.sentenceLoop;

                              if (!loopOnNow) {
                                toggleSentenceLoop();
                              }
                              setSentenceLoopMode('infinite');
                              currentRepeatCountRef.current = 0;

                              if (videoData?.subtitles && streamRef.current) {
                                const current = videoData.subtitles[idx];
                                if (current) {
                                  if (isTrial && current.start >= TRIAL_LIMIT_SECONDS) {
                                    return;
                                  }
                                  streamRef.current.currentTime = current.start;
                                  jumpToSubtitle(idx);
                                }
                              }
                            }}
                            className={`h-8 w-10 rounded-full text-[11px] font-medium ${
                              sentenceLoop && loopMode === 'infinite'
                                ? 'bg-neutral-900 text-white shadow-md'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                          >
                            ∞
                          </button>
                        </div>
                      </div>

                      <div className="h-px w-full bg-neutral-100" />

                      {/* 视频循环设置 */}
                      <div>
                        <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-600">
                          <span>视频循环</span>
                        </div>
                        <div className="flex justify-between gap-1">
                          {(() => {
                            const draft = loopDraft ?? loopConfig;
                            const draftVideoMode = draft.videoLoopMode;

                            const setDraftVideoMode = (mode: 'off' | 'single' | 'sequence') => {
                              setLoopDraft(prev => {
                                const base = prev ?? loopConfig;
                                return {
                                  ...base,
                                  videoLoopMode: mode
                                };
                              });
                            };

                            return (
                              <>
                                <button
                                  type="button"
                                  className={`flex-1 rounded-full py-1.5 text-[11px] font-medium ${
                                    draftVideoMode === 'off'
                                      ? 'bg-neutral-900 text-white shadow-md'
                                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                  }`}
                                  onClick={() => setDraftVideoMode('off')}
                                >
                                  关
                                </button>
                                <button
                                  type="button"
                                  className={`flex-1 rounded-full py-1.5 text-[11px] font-medium ${
                                    draftVideoMode === 'single'
                                      ? 'bg-neutral-900 text-white shadow-md'
                                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                  }`}
                                  onClick={() => setDraftVideoMode('single')}
                                >
                                  单视频循环
                                </button>
                                <button
                                  type="button"
                                  className={`flex-1 rounded-full py-1.5 text-[11px] font-medium ${
                                    draftVideoMode === 'sequence'
                                      ? 'bg-neutral-900 text-white shadow-md'
                                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                  }`}
                                  onClick={() => setDraftVideoMode('sequence')}
                                >
                                  顺序播放
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            className="rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_14px_34px_-18px_rgba(15,23,42,0.6)] active:scale-95"
                            onClick={() => {
                              if (loopDraft) {
                                setLoopConfig(loopDraft);
                              }
                              setIsLoopMenuOpen(false);
                              setLoopDraft(null);
                            }}
                          >
                            完成
                          </button>
                        </div>
                  </div>
                </div>
              ) : null}

              {/* 2. 悬浮玻璃岛本体：
               - 替换了原有的 island-container/island-body class
               - 使用 Flex 布局实现 5 点对称
               - 增加 height 到 68px，圆角 full，磨砂背景
            */}
              <div className="pointer-events-auto flex h-[68px] w-full items-center justify-between rounded-full border border-white/70 bg-white/90 px-2 shadow-[0_8px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-all">

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
	                <span className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-emerald-700 group-active:bg-emerald-50">
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
	                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
	                      sentenceLoop
	                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
	                        : 'text-gray-400 group-active:bg-black/5'
	                  }`}
                  >
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
	                      className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_26px_rgba(16,185,129,0.65)] transition-transform active:scale-90 active:shadow-none"
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
	                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
	                      shadowSubtitleIndex === currentSubtitleIndex && shadowMode === 'recording'
	                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
	                        : 'text-gray-400 group-active:bg-black/5'
	                    }`}
                  >
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
                    // 无论当前是否已有生词，都可以切换到生词视图；
                    // 若当前暂无生词，右侧面板会给出友好提示。
                    if (panelMode === 'transcript') {
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
                  {/* 只有在字幕模式且存在生词时显示小红点角标（使用品牌玫瑰色，区分“待处理生词”） */}
                  {panelMode === 'transcript' &&
                    user &&
                    vocabUnknownCount > 0 && (
                      <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)] shadow-sm shadow-[rgba(232,141,147,0.5)]" />
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
                className="w-full rounded-full bg-[var(--accent)] px-3 py-2 font-medium text-white shadow-sm shadow-[rgba(232,141,147,0.5)] hover:bg-[#e27980]"
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

// ==========================================================
// 👇👇👇 V8版 (绿色认识按钮)：替换 RefinedVocabCard 组件 👇👇👇
// ==========================================================

const RefinedVocabCard = ({
                            item,
                            isUnknown,
                            onPlayAudio,
                            onUpdateStatus,
                            onPlaySentence
                          }: {
  item: VocabItem;
  isUnknown: boolean;
  onPlayAudio: () => void;
  onUpdateStatus: (status: 'known' | 'unknown') => void;
  onPlaySentence: () => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 配色系统
  const theme = useMemo(() => {
    switch (item.kind) {
      case 'phrase':
        return {
          wrapperBorder: 'border-rose-100/60',
          bgSoft: 'bg-[#FFF0F3]',
          textMain: 'text-[#9F1239]',
          tagBg: 'bg-[#FFF1F2]',
          tagText: 'text-[#BE123C]',
          label: '短语',
          quoteBg: 'bg-[#FFF1F2]/70',
          quoteBorder: 'border-rose-100'
        };
      case 'expression':
        return {
          wrapperBorder: 'border-orange-100/60',
          bgSoft: 'bg-[#FFF7ED]',
          textMain: 'text-[#9A3412]',
          tagBg: 'bg-[#FFEDD5]',
          tagText: 'text-[#C2410C]',
          label: '表达',
          quoteBg: 'bg-[#FFF7ED]/70',
          quoteBorder: 'border-orange-100'
        };
      case 'word':
      default:
        return {
          wrapperBorder: 'border-slate-100',
          bgSoft: 'bg-[#F1F5F9]',
          textMain: 'text-[#334155]',
          tagBg: 'bg-[#F8FAFC]',
          tagText: 'text-[#475569]',
          label: '单词',
          quoteBg: 'bg-[#F8FAFC]/80',
          quoteBorder: 'border-slate-100'
        };
    }
  }, [item.kind]);

  return (
      <div
          // 整体容器：如果已认识(!isUnknown)，稍微变淡一点，表示“已处理”
          className={`group relative mb-4 flex flex-col overflow-hidden rounded-[20px] border ${theme.wrapperBorder} bg-white transition-all duration-300 ${
              isExpanded ? 'shadow-md ring-1 ring-black/5' : 'shadow-sm'
          } ${!isUnknown ? 'opacity-70 grayscale-[0.2]' : ''}`}
      >
        <div className={`absolute top-0 left-0 right-0 h-[3px] ${theme.tagBg}`} />

        {/* --- 卡片头部 --- */}
        <div
            className="relative flex cursor-pointer flex-col px-5 pt-5 pb-4 transition-colors active:bg-gray-50/50"
            onClick={onPlaySentence} // 点击卡片主体播放原声
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <h3 className={`font-serif text-[19px] font-semibold leading-tight tracking-normal break-words ${theme.textMain}`}>
                {item.headword}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-400 font-sans">
                {item.ipa && <span>{item.ipa}</span>}
                {item.pos && <span className="italic opacity-70">{item.pos}</span>}
              </div>
            </div>

            {/* 右侧操作区 */}
            <div className="flex shrink-0 flex-col items-end gap-3 relative z-10">
              {/* 类型标签 */}
              <div className={`rounded-full px-2 py-[3px] text-[10px] tracking-wide font-bold uppercase ${theme.tagBg} ${theme.tagText}`}>
                {theme.label}
              </div>

              {/*
                 ✅ 绿色“认识”按钮
                 isUnknown (真) -> 显示空心绿色按钮 "✓ 认识" -> 等待点击
                 !isUnknown (假) -> 显示实心绿色 "已懂" -> 表示完成
             */}
              <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // 绝对防误触
                    onUpdateStatus(isUnknown ? 'known' : 'unknown');
                  }}
                  className={`
                flex h-7 items-center justify-center gap-1 rounded-full px-3 text-[11px] font-bold transition-all active:scale-95 shadow-sm
                ${isUnknown
                      ? 'bg-white text-emerald-600 border border-emerald-500 hover:bg-emerald-50' // 没点过：绿色描边，邀请点击
                      : 'bg-emerald-500 text-white border border-emerald-500' // 点过了：实心绿，表示完成
                  }
              `}
              >
                {isUnknown ? (
                    <>
                      <span>认识</span>
                    </>
                ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><path d="M20 6L9 17l-5-5"/></svg>
                      <span>已会</span>
                    </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-2">
          <span className={`inline-block rounded-[6px] px-2 py-0.5 text-[13px] font-medium tracking-wide ${theme.bgSoft} ${theme.textMain}`}>
            {item.definition || item.paraphrase}
          </span>
          </div>

          {(item.source?.sentence_en || item.source?.sentence_cn) && (
              <div className={`relative mt-3 rounded-xl border ${theme.quoteBorder} px-4 py-3 ${theme.quoteBg}`}>
                <div className="absolute -left-1 -top-2 font-serif text-4xl leading-none text-black/5 select-none">“</div>
                <div className="relative z-10 flex flex-col gap-1">
                  {item.source?.sentence_en && (
                      <p className="font-serif text-[13px] leading-relaxed text-gray-800/90 italic">
                        {item.source.sentence_en}
                      </p>
                  )}
                  {item.source?.sentence_cn && (
                      <p className="text-[11px] text-gray-500/80">
                        {item.source.sentence_cn}
                      </p>
                  )}
                </div>
                <div className="absolute -right-2 -bottom-2 p-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-gray-400">
                    <IconPlay className="h-2.5 w-2.5 ml-0.5" />
                  </div>
                </div>
              </div>
          )}
        </div>

        {/* --- 折叠详情区 (保持不变) --- */}
        <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
        >
          <div className="overflow-hidden bg-[#FAFAF9]">
            <div className="mx-5 border-t border-dashed border-gray-200" />

            <div className="px-5 pb-5 pt-4 space-y-4 text-[12px]">

              {/* Word 独有 */}
              {item.kind === 'word' && (
                  <>
                    {item.collocations && item.collocations.length > 0 && (
                        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                          <div className="mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Collocations / 搭配</div>
                          <div className="text-gray-600 leading-relaxed">{item.collocations.join(' · ')}</div>
                        </div>
                    )}
                    {(item.synonyms?.length || item.antonyms?.length || item.derivedForm) && (
                        <div className="grid grid-cols-1 gap-2 rounded-lg bg-white border border-gray-100 p-3">
                          {item.derivedForm && (
                              <div className="flex gap-2">
                                <span className="shrink-0 text-gray-400 font-bold w-8">变形</span>
                                <span className="font-mono text-gray-600">{item.derivedForm}</span>
                              </div>
                          )}
                          {item.synonyms && item.synonyms.length > 0 && (
                              <div className="flex gap-2">
                                <span className="shrink-0 text-gray-400 font-bold w-8">近义</span>
                                <span className="text-gray-600">{item.synonyms.join(', ')}</span>
                              </div>
                          )}
                          {item.antonyms && item.antonyms.length > 0 && (
                              <div className="flex gap-2">
                                <span className="shrink-0 text-gray-400 font-bold w-8">反义</span>
                                <span className="text-gray-600">{item.antonyms.join(', ')}</span>
                              </div>
                          )}
                        </div>
                    )}
                  </>
              )}

              {/* Phrase 独有 */}
              {item.kind === 'phrase' && (
                  <>
                    {item.structure && (
                        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                          <div className="mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Structure / 结构</div>
                          <div className="font-mono text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded inline-block">{item.structure}</div>
                        </div>
                    )}
                    {item.synonyms && item.synonyms.length > 0 && (
                        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                          <div className="mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Synonyms / 同义</div>
                          <div className="text-gray-600">{item.synonyms.join(' · ')}</div>
                        </div>
                    )}
                  </>
              )}

              {/* Expression 独有 */}
              {item.kind === 'expression' && (
                  <>
                    {(item.functionLabel || item.scenario) && (
                        <div className="space-y-2 rounded-lg bg-white border border-gray-100 p-3">
                          {item.functionLabel && (
                              <div className="flex gap-2">
                                <span className="shrink-0 text-[10px] font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded h-fit">功能</span>
                                <span className="text-gray-700">{item.functionLabel}</span>
                              </div>
                          )}
                          {item.scenario && (
                              <div className="flex gap-2">
                                <span className="shrink-0 text-[10px] font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded h-fit">场景</span>
                                <span className="text-gray-700">{item.scenario}</span>
                              </div>
                          )}
                        </div>
                    )}
                    {item.register && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Register</span>
                          <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                           {item.register}
                         </span>
                        </div>
                    )}
                    {item.responseGuide && (
                        <div className="rounded-lg bg-[#FFF7ED] p-3 border border-orange-100">
                          <div className="mb-1 text-[10px] font-bold text-[#9A3412] opacity-70 flex items-center gap-1">
                            <span>💬</span> 接话指南
                          </div>
                          <div className="text-[#9A3412] leading-relaxed">{item.responseGuide}</div>
                        </div>
                    )}
                  </>
              )}

              {/* Note */}
              {item.note && (
                  <div className="rounded-lg bg-gray-100/50 p-3 border border-gray-100">
                    <div className="mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Note / 笔记</div>
                    <div className="text-gray-600 leading-relaxed">{item.note}</div>
                  </div>
              )}

              {/* Example */}
              {(item.exampleEn || item.exampleCn) && (
                  <div className="relative rounded-lg bg-white border border-gray-100 p-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Example / 词典例句</span>
                      <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayAudio();
                          }}
                          className="text-gray-400 hover:text-gray-600"
                      >
                        <IconSound className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      {item.exampleEn && (
                          <p className="font-serif text-gray-700 leading-relaxed">{item.exampleEn}</p>
                      )}
                      {item.exampleCn && (
                          <p className="mt-1 text-gray-400 scale-95 origin-left">{item.exampleCn}</p>
                      )}
                    </div>
                  </div>
              )}

            </div>
          </div>
        </div>

        <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex w-full items-center justify-center gap-1 border-t border-gray-50 bg-white py-2 text-[10px] font-medium text-gray-300 hover:text-gray-500 transition-colors"
        >
          <span>{isExpanded ? 'CLOSE' : 'MORE'}</span>
          <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-3 w-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </div>
  );
};
