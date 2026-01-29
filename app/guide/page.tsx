'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/layout/Header';

function SectionTitle({
  eyebrow,
  title,
  desc,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-4">
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          {eyebrow}
        </div>
      )}
      <h2 className="mt-1 text-lg font-semibold text-neutral-900">{title}</h2>
      {desc && <p className="mt-1 text-sm text-neutral-600">{desc}</p>}
    </div>
  );
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good';
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-rose-100 bg-[var(--accent-soft)] text-[var(--accent)]'
      : tone === 'good'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border-neutral-200 bg-white text-neutral-600';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

function NumberBadge({ n }: { n: number }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-900 text-sm font-semibold text-white shadow-sm shadow-black/15">
      {n}
    </div>
  );
}

function MockBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold text-neutral-500">{title}</div>
        <div className="h-2 w-10 rounded-full bg-neutral-200" />
      </div>
      {children}
    </div>
  );
}

function MiniTranscript() {
  return (
    <MockBlock title="字幕流（点击跳转）">
      <div className="space-y-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-2">
          <div className="text-[12px] font-semibold text-neutral-900">
            I was <span className="rounded-md bg-[var(--hl-purple-bg)] px-1.5 py-0.5 text-[var(--hl-purple-text)]">so</span>{' '}
            nervous today.
          </div>
          <div className="mt-1 text-[11px] text-neutral-500">
            我今天真的很紧张。
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-2 opacity-70">
          <div className="text-[12px] font-semibold text-neutral-900">
            But it turned out <span className="rounded-md bg-[var(--hl-pink-bg)] px-1.5 py-0.5 text-[var(--hl-pink-text)]">fine</span>.
          </div>
          <div className="mt-1 text-[11px] text-neutral-500">
            但结果还不错。
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        点击整句 = 跳到这句开始；点击高亮词 = 弹出知识卡片（桌面浮层 / 手机底部弹窗）。
      </p>
    </MockBlock>
  );
}

function MiniCard() {
  return (
    <MockBlock title="知识卡片（点高亮词弹出）">
      <div className="rounded-2xl border border-neutral-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-neutral-900">
              nervous
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500">
              /ˈnɜːrvəs/ · adj.
            </div>
          </div>
          <Chip tone="accent">重点</Chip>
        </div>
        <div className="mt-2 text-[12px] text-neutral-700">
          紧张的；焦虑的
        </div>
        <div className="mt-2 rounded-xl bg-neutral-50 p-2 text-[11px] text-neutral-600">
          I was nervous before the interview.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white"
          >
            不认识
          </button>
          <button
            type="button"
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-700"
          >
            收起
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        先把不认识的词点「不认识」收进生词流；熟了再点「认识」清掉。
      </p>
    </MockBlock>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[var(--bg-body)]">
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-16">
        {/* Hero */}
        <div className="mt-6 rounded-3xl border border-white/70 bg-[var(--bg-shell)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                New User Guide
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
                Immersive English 使用指南
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
                这不是“上课”，而是一个把油管视频拆成可练习的小句子的精读工作台。按下面的步骤走一遍，你就能掌握字幕跳转、单句循环、跟读、生词流和知识卡片。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone="accent">3 分钟上手</Chip>
                <Chip tone="good">跟读 1 分钟学会</Chip>
                <Chip>随时在「通知 → 使用指南」打开</Chip>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-medium text-white shadow-sm shadow-black/20 hover:bg-neutral-800"
                >
                  返回首页
                </Link>
                <a
                  href="#shadowing"
                  className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  直接看「跟读怎么用」
                </a>
              </div>
            </div>
            <div className="w-full md:w-[280px]">
              <div className="rounded-3xl border border-neutral-100 bg-neutral-50/80 p-4">
                <div className="text-[11px] font-semibold text-neutral-500">
                  快速定位
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  {[
                    ['#quickstart', '三步精读'],
                    ['#home', '首页怎么用'],
                    ['#watch', '精读页怎么用'],
                    ['#shadowing', '跟读怎么用'],
                    ['#faq', '常见问题'],
                    ['#feedback', '反馈通道'],
                  ].map(([href, label]) => (
                    <a
                      key={href}
                      href={href}
                      className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-neutral-700 hover:border-neutral-300"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick start */}
        <section id="quickstart" className="mt-10">
          <SectionTitle
            eyebrow="Quick Start"
            title="三步完成一次精读（照做就行）"
            desc="你不需要一次把所有功能都学会：先把“练一句”的闭环跑通。"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <NumberBadge n={1} />
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    选一条视频
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                    在首页用搜索 / 标签 / 难度筛选，点卡片进入精读页。
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <MockBlock title="首页筛选（示意）">
                  <div className="flex flex-wrap gap-2">
                    <Chip>Vlog</Chip>
                    <Chip>入门</Chip>
                    <Chip tone="accent">只看未学</Chip>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-2">
                      <div className="h-12 rounded-xl bg-neutral-100" />
                      <div className="mt-2 h-2 w-3/4 rounded bg-neutral-200" />
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-2 opacity-60">
                      <div className="h-12 rounded-xl bg-neutral-100" />
                      <div className="mt-2 h-2 w-2/3 rounded bg-neutral-200" />
                    </div>
                  </div>
                </MockBlock>
              </div>
            </div>

            <div className="rounded-3xl border border-rose-100 bg-[var(--accent-soft)]/80 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <NumberBadge n={2} />
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    跟着字幕练一句
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-700">
                    点字幕跳转到原句；点高亮词看知识卡；必要时开「单句循环」反复听。
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <MiniTranscript />
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <NumberBadge n={3} />
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    标记生词 + 回放
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                    不认识的词点「不认识」收进生词流；回放原句，再跟读 2～3 遍。
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <MiniCard />
              </div>
            </div>
          </div>
        </section>

        {/* Home */}
        <section id="home" className="mt-12">
          <SectionTitle
            eyebrow="Home"
            title="首页怎么用（快速找到合适素材）"
            desc="首页的目标只有一个：让你 10 秒内选到“今天想练的那条”。"
          />

          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: '搜索：直接搜标题 / 作者 / 标签',
                desc: '想练某个主题（比如 Daily / Vlog / Chat），直接输入关键词。',
                chip: <Chip tone="accent">最省时间</Chip>,
              },
              {
                title: '筛选：标签 + 难度 + 学习状态',
                desc: '“只看未学”会把已完成的视频隐藏，特别适合高频练习。',
                chip: <Chip>只看未学</Chip>,
              },
              {
                title: '继续精读：从上次停的位置接着练',
                desc: '如果你中途退出，系统会在本机保存进度，下次打开有断点续播提示。',
                chip: <Chip tone="good">断点续播</Chip>,
              },
              {
                title: '学习进度：已学完标记 + 本月打卡',
                desc: '每次进入精读页会自动记录学习：视频标记为已学完，本月日历点亮。',
                chip: <Chip tone="accent">打卡反馈</Chip>,
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {item.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                      {item.desc}
                    </p>
                  </div>
                  <div className="flex-shrink-0">{item.chip}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Watch */}
        <section id="watch" className="mt-12">
          <SectionTitle
            eyebrow="Watch Page"
            title="精读页怎么用（把一句练到“能说出来”）"
            desc="核心路径：听一句 → 看字幕 → 点词卡 → 单句循环 → 跟读 → 收进生词流。"
          />

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    字幕流：你的“可点击课本”
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                    句子会自动跟随当前播放高亮；你也可以主动点击任意一句跳转练习。
                  </p>
                </div>
                <Chip tone="accent">建议：先从短句练</Chip>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <MiniTranscript />
                <MiniCard />
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-neutral-900">
                练习工具（你会频繁用）
              </div>
              <div className="mt-3 space-y-2 text-[12px] text-neutral-700">
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">单句循环</div>
                    <Chip>无限 / 次数</Chip>
                  </div>
                  <p className="mt-1 text-neutral-600">
                    适合把一个句子听“听顺”，再进入跟读。
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">倍速</div>
                    <Chip tone="good">0.75x 起</Chip>
                  </div>
                  <p className="mt-1 text-neutral-600">
                    先慢后快：能跟读 0.75x，再回到 1.0x 会很明显更轻松。
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">字幕模式</div>
                    <Chip>中 / 双语 / 英</Chip>
                  </div>
                  <p className="mt-1 text-neutral-600">
                    想练口语就切英/双语；想理解就先中文或双语。
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-rose-100 bg-[var(--accent-soft)]/80 p-3 text-[12px] text-neutral-700">
                <div className="text-[11px] font-semibold text-[var(--accent)]">
                  小建议
                </div>
                <p className="mt-1 leading-relaxed">
                  别追求一次看完一集。每天只练 3～5 句“能说出来”的句子，更容易坚持。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Shadowing */}
        <section id="shadowing" className="mt-12">
          <SectionTitle
            eyebrow="Most Important"
            title="跟读（影子跟读）怎么用：照这 4 步就能学会"
            desc="很多人卡在这里：你只需要记住“点麦克风 = 录音；再点一次 = 停止；出现回放 = 听自己”。"
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="accent">桌面端</Chip>
                <Chip>字幕行右侧麦克风</Chip>
                <Chip tone="good">更适合精听精练</Chip>
              </div>
              <ol className="mt-4 space-y-3 text-[13px] text-neutral-700">
                <li className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="font-semibold text-neutral-900">
                    1) 选一句 → 点这句旁边的「麦克风」
                  </div>
                  <p className="mt-1 text-[12px] text-neutral-600">
                    最推荐先开「单句循环」，让耳朵先熟悉语音语调。
                  </p>
                </li>
                <li className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="font-semibold text-neutral-900">
                    2) 允许麦克风权限 → 开始录音
                  </div>
                  <p className="mt-1 text-[12px] text-neutral-600">
                    录音时图标会变成高亮（并有轻微呼吸效果）。
                  </p>
                </li>
                <li className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="font-semibold text-neutral-900">
                    3) 读完再点一次 → 停止录音
                  </div>
                  <p className="mt-1 text-[12px] text-neutral-600">
                    停止后会出现「回放」入口：你可以听到自己的声音。
                  </p>
                </li>
                <li className="rounded-2xl border border-rose-100 bg-[var(--accent-soft)]/80 p-3">
                  <div className="font-semibold text-neutral-900">
                    4) 点回放 → 对比原声 → 再来一遍
                  </div>
                  <p className="mt-1 text-[12px] text-neutral-700">
                    目标不是“全对”，而是把节奏、连读、重音更贴近原声。
                  </p>
                </li>
              </ol>
              <div className="mt-4 rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3 text-[12px] text-neutral-600">
                <div className="text-[11px] font-semibold text-neutral-500">
                  隐私说明
                </div>
                <p className="mt-1 leading-relaxed">
                  跟读录音只保存在你的浏览器里用于回放，不会上传到服务器；刷新页面会消失。
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="accent">手机端</Chip>
                <Chip>底部悬浮岛「麦克风」</Chip>
                <Chip tone="good">更适合碎片时间</Chip>
              </div>

              <div className="mt-4 rounded-3xl border border-neutral-100 bg-neutral-50/80 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Mock UI
                </div>
                <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-semibold text-neutral-900">
                      底部悬浮岛（示意）
                    </div>
                    <Chip>5 个按钮</Chip>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {[
                      ['倍速', 'bg-neutral-100'],
                      ['循环', 'bg-neutral-100'],
                      ['播放', 'bg-neutral-900 text-white'],
                      ['跟读', 'bg-emerald-50 text-emerald-700'],
                      ['字幕', 'bg-neutral-100'],
                    ].map(([label, cls]) => (
                      <div
                        key={label}
                        className={`flex h-10 items-center justify-center rounded-2xl text-[11px] font-semibold ${cls}`}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    点「跟读」开始/停止录音；结束后再点可进入回放状态听自己。
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    新手最稳的练法
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                    先 0.75x 跟读 2 遍 → 再 1.0x 跟读 2 遍 → 最后关字幕复述一遍。
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    常见小坑
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                    如果没弹出权限请求，请检查浏览器地址栏的麦克风权限是否被禁用。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Differences */}
        <section className="mt-12">
          <SectionTitle
            eyebrow="Device"
            title="电脑端 vs 手机端：你该怎么选？"
            desc="两端能力一致，交互形式不同。"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-900">电脑端</div>
                <Chip tone="good">沉浸练习</Chip>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-neutral-600">
                三栏布局更适合：一边看视频，一边盯字幕流，右侧随时看卡片/生词。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip>字幕点击跳转</Chip>
                <Chip>知识卡浮层</Chip>
                <Chip>更方便反复跟读</Chip>
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-900">手机端</div>
                <Chip tone="accent">碎片时间</Chip>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-neutral-600">
                视频固定在顶部，下方是字幕/生词流；底部悬浮岛把核心操作集中成 5 个按钮。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip>底部悬浮岛</Chip>
                <Chip>卡片 Bottom Sheet</Chip>
                <Chip>通勤练 3 句</Chip>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mt-12">
          <SectionTitle
            eyebrow="FAQ"
            title="常见问题（少走弯路）"
          />
          <div className="space-y-3">
            {[
              {
                q: '我应该先听完一整集，还是一句一句练？',
                a: '建议先一句一句练。把 3～5 句练到“能说出来”，比刷完一整集更容易形成正反馈。',
              },
              {
                q: '点了高亮词没有弹出卡片？',
                a: '可能是你点到了非高亮区域。请点英文行里带荧光底色的词/短语；桌面端会浮层弹出，手机端会从底部滑出。',
              },
              {
                q: '跟读没声音 / 没弹权限？',
                a: '检查浏览器地址栏的麦克风权限；建议戴耳机并关闭其他占用麦克风的应用（如会议软件）。',
              },
              {
                q: '生词太多怎么办？',
                a: '只标记你“真正想掌握”的词。熟了就点「认识」清掉；生词模式只看“不认识”的词，压力会小很多。',
              },
            ].map((item) => (
              <div
                key={item.q}
                className="rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm"
              >
                <div className="text-sm font-semibold text-neutral-900">
                  {item.q}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Feedback */}
        <section id="feedback" className="mt-12">
          <SectionTitle
            eyebrow="Feedback"
            title="反馈通道（我们会持续优化）"
            desc="遇到卡顿、体验不顺、想要新功能，直接来这里。"
          />
          <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  WeChat
                </div>
                <div className="mt-1 text-base font-semibold text-neutral-900">
                  WeiWeiLad
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
                  扫右侧二维码添加，备注「网站反馈」或「精读反馈」。你的一句话，可能就是下一次更新的方向。
                </p>
                <div className="mt-3">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-800 hover:bg-neutral-50"
                  >
                    回到首页继续精读
                  </Link>
                </div>
              </div>
              <div className="flex justify-start md:justify-end">
                <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white p-1">
                  <Image
                    src="/images/hero-placeholder-960x540.png"
                    alt="微信反馈二维码"
                    width={160}
                    height={220}
                    className="h-44 w-32 rounded-2xl object-contain bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
