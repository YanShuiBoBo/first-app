'use client';

import React from 'react';

interface StatsCardProps {
  totalVideos: number;
  learnedVideos: number;
  notLearnedVideos: number;
}

export default function StatsCard({
  totalVideos,
  learnedVideos,
  notLearnedVideos
}: StatsCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-sm shadow-black/40 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-sky-500/20 to-transparent" />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400">
          Study snapshot
        </div>
        <h3 className="mt-2 text-sm font-semibold text-zinc-50">
          学习统计
        </h3>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 text-zinc-400">
              <span>素材总数</span>
              <span className="text-[11px]">当前可学习的视频数量</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-zinc-50">
                {totalVideos}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 text-zinc-400">
              <span>已学习</span>
              <span className="text-[11px]">至少打开过精读页的视频数</span>
            </div>
            <div className="text-right text-lg font-bold text-emerald-400">
              {learnedVideos}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 text-zinc-400">
              <span>未学习</span>
              <span className="text-[11px]">还没开始的素材</span>
            </div>
            <div className="text-right text-lg font-bold text-zinc-50">
              {notLearnedVideos}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
