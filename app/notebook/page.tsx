"use client";

import Header from '@/components/layout/Header';

export default function NotebookPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-900">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-24">
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">
            My · Notebook
          </p>
          <h1 className="font-serif text-2xl font-semibold leading-tight text-neutral-900 md:text-3xl">
            生词本 / 灵感本
          </h1>
          <p className="max-w-xl text-sm text-neutral-600">
            这里将汇总你在精读页高亮收藏的单词、短语和金句。当前版本暂未开放管理功能，后续会支持分组、打标签和导出。
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-dashed border-neutral-200 bg-white/80 p-6 text-sm text-neutral-500 shadow-sm">
          <p>生词本功能开发中，先去精读页多多高亮和收藏，等你回来这里整理成一本属于自己的英语手账。</p>
        </section>
      </main>
    </div>
  );
}

