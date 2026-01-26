
import { create } from 'zustand';

export type SentenceLoopMode = 'infinite' | 'count';

// 全局循环配置结构：用于与数据库 player_settings 字段同步
export interface LoopConfig {
  // 单句循环是否开启
  sentenceLoop: boolean;
  // 单句循环模式：infinite = 无限循环当前句；count = 每句播放指定次数后自动跳到下一句
  sentenceLoopMode: SentenceLoopMode;
  // 当 sentenceLoopMode = 'count' 时，每句目标播放次数
  sentenceLoopCount: number;
  // 视频级循环模式：
  // - off     : 播完当前视频后停止
  // - single  : 单视频循环，播完回到开头
  // - sequence: 顺序播放，播完自动跳到下一条视频
  videoLoopMode: 'off' | 'single' | 'sequence';
}

interface PlayerStore {
  // 播放器状态
  currentTime: number;
  currentSubtitleIndex: number;
  activeCard: any | null;
  playbackRate: number;

  // 循环相关的全局配置
  loopConfig: LoopConfig;

  // 播放器操作
  setCurrentTime: (time: number) => void;
  jumpToSubtitle: (index: number) => void;
  showCard: (card: any) => void;
  hideCard: () => void;
  setPlaybackRate: (rate: number) => void;

  // 句子循环配置操作
  toggleSentenceLoop: () => void;
  setSentenceLoopMode: (mode: SentenceLoopMode) => void;
  setSentenceLoopCount: (count: number) => void;

  // 视频循环配置操作
  setVideoLoopMode: (mode: 'off' | 'single' | 'sequence') => void;

  // 一次性写入完整循环配置（用于从数据库加载）
  setLoopConfig: (config: Partial<LoopConfig>) => void;

  // 辅助函数
  setCurrentSubtitle: (subtitles: any[], time: number) => void;
}

// 默认循环配置（未登录 / 本地初始值）
export const defaultLoopConfig: LoopConfig = {
  sentenceLoop: false,
  sentenceLoopMode: 'infinite',
  sentenceLoopCount: 3,
  videoLoopMode: 'off'
};

// 创建播放器状态管理
export const usePlayerStore = create<PlayerStore>(set => ({
  currentTime: 0,
  currentSubtitleIndex: 0,
  activeCard: null,
  playbackRate: 1,

  loopConfig: defaultLoopConfig,

  setCurrentTime: time => set(() => ({ currentTime: time })),

  jumpToSubtitle: index => set(() => ({ currentSubtitleIndex: index })),

  showCard: card => set(() => ({ activeCard: card })),

  hideCard: () => set(() => ({ activeCard: null })),

  setPlaybackRate: rate => set(() => ({ playbackRate: rate })),

  toggleSentenceLoop: () =>
    set(state => ({
      loopConfig: {
        ...state.loopConfig,
        sentenceLoop: !state.loopConfig.sentenceLoop
      }
    })),

  setSentenceLoopMode: mode =>
    set(state => ({
      loopConfig: {
        ...state.loopConfig,
        sentenceLoopMode: mode
      }
    })),

  setSentenceLoopCount: count =>
    set(state => ({
      loopConfig: {
        ...state.loopConfig,
        sentenceLoopCount: count
      }
    })),

  setVideoLoopMode: mode =>
    set(state => ({
      loopConfig: {
        ...state.loopConfig,
        videoLoopMode: mode
      }
    })),

  setLoopConfig: config =>
    set(state => ({
      loopConfig: {
        ...state.loopConfig,
        ...config
      }
    })),

  // 根据当前时间查找并设置字幕
  setCurrentSubtitle: (subtitles, time) => {
    if (!subtitles || subtitles.length === 0) {
      return;
    }

    // 二分查找当前时间对应的字幕
    let left = 0;
    let right = subtitles.length - 1;
    let currentIndex = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      if (time >= subtitles[mid].start && time < subtitles[mid].end) {
        currentIndex = mid;
        break;
      } else if (time < subtitles[mid].start) {
        right = mid - 1;
      } else {
        left = mid + 1;
        currentIndex = mid;
      }
    }

    set(() => ({ currentSubtitleIndex: currentIndex }));
  }
}));
