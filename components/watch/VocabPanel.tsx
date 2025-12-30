'use client';

import React from 'react';

export type VocabStatus = 'known' | 'unknown' | 'unmarked';

export type VocabKind = 'word' | 'phrase' | 'expression';

export interface VocabSource {
  sentence_en?: string;
  sentence_cn?: string;
  timestamp_start?: number;
  timestamp_end?: number;
}

export interface VocabItem {
  key: string;
  kind: VocabKind;
  headword: string;
  ipa?: string;
  pos?: string;
  definition: string;
  collocations?: string[];
  synonyms?: string[];
  structure?: string;
  register?: string;
  paraphrase?: string;
  scenario?: string;
  functionLabel?: string;
  source?: VocabSource;
  status: VocabStatus;
}

export interface VocabPanelProps {
  open: boolean;
  variant: 'sheet' | 'panel';
  activeKind: VocabKind;
  items: VocabItem[];
  onClose: () => void;
  onKindChange: (kind: VocabKind) => void;
  onUpdateStatus: (key: string, status: Exclude<VocabStatus, 'unmarked'>) => void;
  onMarkRestKnown: () => void;
  onPlayClip: (item: VocabItem) => void;
}

const VocabPanel: React.FC<VocabPanelProps> = ({
  open,
  variant,
  activeKind,
  items,
  onClose,
  onKindChange,
  onUpdateStatus,
  onMarkRestKnown,
  onPlayClip
}) => {
  // 状态筛选：全部 / 未标记 / 认识 / 不认识
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | 'unmarked' | 'known' | 'unknown'
  >('all');

  // 先按类型过滤，再根据状态筛选展示列表
  const kindItems = items.filter(item => item.kind === activeKind);

  const filtered = kindItems
    .filter(item =>
      statusFilter === 'all' ? true : item.status === statusFilter
    )
    .slice()
    .sort((a, b) => {
      const score = (it: VocabItem) => {
        if (it.status === 'unknown') return 0;
        if (it.status === 'unmarked') return 1;
        return 2; // known
      };
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa - sb;
      return a.headword.localeCompare(b.headword);
    });

  // 统计始终基于当前类型下的全部词汇，而不是 statusFilter 之后的子集
  const total = kindItems.length;
  const knownCount = kindItems.filter(i => i.status === 'known').length;
  const unknownCount = kindItems.filter(i => i.status === 'unknown').length;
  const unmarkedCount = kindItems.filter(i => i.status === 'unmarked').length;

  const containerCommon =
    'z-40 flex flex-col bg-white text-xs text-gray-800 shadow-xl';

  const panelClasses =
    'fixed inset-y-0 right-0 w-full max-w-sm border-l border-gray-200 lg:rounded-none';

  const sheetClasses =
    'fixed inset-x-0 bottom-0 max-h-[75vh] rounded-t-3xl border-t border-gray-200';

  const wrapperClass =
    variant === 'panel'
      ? panelClasses
      : sheetClasses;

  const kindTabs: { value: VocabKind; label: string }[] = [
    { value: 'word', label: '单词' },
    { value: 'phrase', label: '短语' },
    { value: 'expression', label: '表达' }
  ];

  const hasItems = filtered.length > 0;

  return (
    <>
      {!open ? null : (
    <>
      {/* 背景遮罩，仅在移动端 Bottom Sheet 时使用 */}
      {variant === 'sheet' && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={onClose}
        />
      )}
      <div className={`${containerCommon} ${wrapperClass}`}>
        {/* 顶部拖拽条 / 关闭 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            {variant === 'sheet' && (
              <div className="mr-1 h-1.5 w-12 rounded-full bg-gray-300" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Vocabulary
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[11px] text-gray-500 hover:bg-gray-200"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-4">
          {kindTabs.map(tab => {
            const active = activeKind === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                className={`flex-1 rounded-full px-2.5 py-1 text-[11px] ${
                  active
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                onClick={() => onKindChange(tab.value)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-4 gap-2 px-4 pb-2">
          <StatBlock
            label="全部"
            value={total}
            variant="default"
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          <StatBlock
            label="未标记"
            value={unmarkedCount}
            variant="muted"
            active={statusFilter === 'unmarked'}
            onClick={() => setStatusFilter('unmarked')}
          />
          <StatBlock
            label="认识"
            value={knownCount}
            variant="known"
            active={statusFilter === 'known'}
            onClick={() => setStatusFilter('known')}
          />
          <StatBlock
            label="不认识"
            value={unknownCount}
            variant="unknown"
            active={statusFilter === 'unknown'}
            onClick={() => setStatusFilter('unknown')}
          />
        </div>

        {/* 列表区域 */}
        <div className="mt-1 flex-1 space-y-2 overflow-y-auto px-4 pb-3">
          {!hasItems && (
            <div className="mt-6 rounded-2xl bg-gray-50 px-4 py-6 text-center text-[11px] text-gray-500">
              本视频暂时没有这一类知识点。
            </div>
          )}

          {hasItems &&
            filtered.map(item => (
              <VocabCard
                key={item.key}
                item={item}
                onPlayClip={() => onPlayClip(item)}
                onUpdateStatus={onUpdateStatus}
              />
            ))}
        </div>

        {/* Sticky Footer */}
        <div className="border-t border-gray-100 bg-white px-4 py-2">
          <button
            type="button"
            className={`flex w-full items-center justify-center rounded-full py-2 text-[11px] font-medium ${
              unmarkedCount === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-neutral-900 text-white shadow-lg shadow-black/10 hover:bg-black'
            }`}
            disabled={unmarkedCount === 0}
            onClick={onMarkRestKnown}
          >
            {unmarkedCount === 0
              ? '已全部标记完毕'
              : `标记剩余 ${unmarkedCount} 个为认识`}
          </button>
        </div>
      </div>
    </>
      )}
    </>
  );
};

interface StatBlockProps {
  label: string;
  value: number;
  variant: 'default' | 'muted' | 'known' | 'unknown';
  active: boolean;
  onClick: () => void;
}

const StatBlock: React.FC<StatBlockProps> = ({
  label,
  value,
  variant,
  active,
  onClick
}) => {
  let className =
    'flex cursor-pointer flex-col items-center justify-center rounded-2xl border px-2 py-1.5 transition-colors';

  if (variant === 'muted') {
    className += active
      ? ' border-gray-400 bg-gray-100 text-gray-700'
      : ' border-gray-200 bg-gray-50 text-gray-500';
  } else if (variant === 'known') {
    className += active
      ? ' border-green-500 bg-green-100 text-green-700'
      : ' border-green-200 bg-green-50 text-green-700';
  } else if (variant === 'unknown') {
    className += active
      ? ' border-orange-500 bg-orange-100 text-orange-700'
      : ' border-orange-200 bg-orange-50 text-orange-700';
  } else {
    className += active
      ? ' border-neutral-900 bg-neutral-900 text-white'
      : ' border-gray-200 bg-white text-gray-700';
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      <div className="text-sm font-semibold">{value}</div>
      <div className="mt-0.5 text-[10px]">{label}</div>
    </button>
  );
};

interface VocabCardProps {
  item: VocabItem;
  onPlayClip: () => void;
  onUpdateStatus: (key: string, status: Exclude<VocabStatus, 'unmarked'>) => void;
}

const VocabCard: React.FC<VocabCardProps> = ({
  item,
  onPlayClip,
  onUpdateStatus
}) => {
  const isKnown = item.status === 'known';
  const isUnknown = item.status === 'unknown';

  const base =
    'relative rounded-2xl border px-3 py-2.5 text-[11px] transition-all';

  const stateClass = isUnknown
    ? 'border-orange-300 bg-orange-50'
    : isKnown
    ? 'border-transparent bg-green-50 opacity-60'
    : 'border-gray-100 bg-white shadow-sm hover:border-gray-200 hover:bg-gray-50';

  return (
    <div className={`${base} ${stateClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {/* Row 1: 头部 + 标签 */}
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
            {item.register && (
              <span className="rounded-full bg-purple-100 px-2 py-[2px] text-[10px] text-purple-700">
                {item.register}
              </span>
            )}
          </div>

          {/* Row 2: 词性 + 义项 / 功能 */}
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

          {/* Row 3: Collocations / Structure / Scenario */}
          {item.collocations && item.collocations.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.collocations.map(col => (
                <span
                  key={col}
                  className="rounded-md bg-slate-100 px-2 py-[2px] text-[10px] text-slate-600"
                >
                  {col}
                </span>
              ))}
            </div>
          )}

          {item.structure && (
            <div className="mt-1 font-mono text-[10px] text-indigo-600">
              structure: {item.structure}
            </div>
          )}

          {item.scenario && (
            <div className="mt-1 text-[10px] text-gray-500">
              {item.scenario}
            </div>
          )}

          {/* Row 4: Source sentence */}
          {(item.source?.sentence_en || item.source?.sentence_cn) && (
            <div className="mt-1 border-l border-gray-200 pl-2 text-[10px] text-gray-600">
              {item.source.sentence_en && (
                <div className="italic">{item.source.sentence_en}</div>
              )}
              {item.source.sentence_cn && (
                <div className="mt-0.5">{item.source.sentence_cn}</div>
              )}
            </div>
          )}
        </div>

        {/* 操作区：喇叭 + ✓ / ✗ */}
        <div className="ml-1 flex flex-col items-end gap-1">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-[#FF2442]"
            onClick={onPlayClip}
            title="播放例句片段"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
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
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                isKnown
                  ? 'bg-green-500 text-white'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
              }`}
              onClick={() => onUpdateStatus(item.key, 'known')}
              title="标记为认识"
            >
              ✓
            </button>
            <button
              type="button"
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                isUnknown
                  ? 'bg-orange-500 text-white'
                  : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
              }`}
              onClick={() => onUpdateStatus(item.key, 'unknown')}
              title="标记为不认识"
            >
              ✗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VocabPanel;
