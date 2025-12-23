'use client';

import React from 'react';

export default function NotificationCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-sm shadow-black/40 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-violet-500/25 to-transparent" />
      <div className="relative">
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
          <span className="text-sm">●</span>
          官方通知
        </h3>


        <div className="space-y-3">
          {[
            {
              id: 1,
              title: '新课程上线',
              date: '2025-12-22',
              content:
                '全新商务英语精读专题已上线，适合晚间 30 分钟沉浸学习。'
            },
            {
              id: 2,
              title: '系统升级',
              date: '2025-12-21',
              content:
                '播放器同步体验升级，字幕跟随更顺滑，卡片触发更及时。'
            },
            {
              id: 3,
              title: '反馈问题',
              date: '2025-12-21',
              content:
                '使用有问题？请加微：WeiWeiLad，进群反馈问题'
            }
          ].map((notice) => (
            <div
              key={notice.id}
              className="rounded-xl border border-white/5 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-violet-400/60"
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="font-medium">{notice.title}</div>
                <div className="text-[10px] text-zinc-500">{notice.date}</div>
              </div>
              <div className="line-clamp-2 text-[11px] text-zinc-400">
                {notice.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
