
import { create } from 'zustand';

interface PlayerStore {
  // 播放器状态
  currentTime: number;
  currentSubtitleIndex: number;
  activeCard: any | null;
  playbackRate: number;
  // 单句循环配置：
  // - sentenceLoop: 是否开启单句循环（总开关）
  // - loopMode: infinite = 无限循环当前句；count = 每句播放指定次数后自动跳到下一句
  // - loopCount: 当 loopMode = 'count' 时，每句目标播放次数
  sentenceLoop: boolean;
  loopMode: 'infinite' | 'count';
  loopCount: number;

  // 播放器操作
  setCurrentTime: (time: number) => void;
  jumpToSubtitle: (index: number) => void;
  showCard: (card: any) => void;
  hideCard: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleSentenceLoop: () => void;
  setLoopMode: (mode: 'infinite' | 'count') => void;
  setLoopCount: (count: number) => void;

  // 辅助函数
  setCurrentSubtitle: (subtitles: any[], time: number) => void;
}

// 创建播放器状态管理
export const usePlayerStore = create<PlayerStore>((set) => ({
  currentTime: 0,
  currentSubtitleIndex: 0,
  activeCard: null,
  playbackRate: 1,
  loopMode: 'infinite',
  loopCount: 3,
  sentenceLoop: false,

  setCurrentTime: (time) => set(() => ({ currentTime: time })),

  jumpToSubtitle: (index) => set(() => ({ currentSubtitleIndex: index })),

  showCard: (card) => set(() => ({ activeCard: card })),

  hideCard: () => set(() => ({ activeCard: null })),

  setPlaybackRate: (rate) => set(() => ({ playbackRate: rate })),

  toggleSentenceLoop: () =>
    set((state) => ({ sentenceLoop: !state.sentenceLoop })),

  setLoopMode: (mode) =>
    set(() => ({
      loopMode: mode
    })),

  setLoopCount: (count) =>
    set(() => ({
      loopCount: count
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
