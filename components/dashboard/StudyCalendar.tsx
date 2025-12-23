'use client';

import React from 'react';

interface StudyCalendarProps {
  year: number;
  month: number; // 1-12
  studyDates: string[]; // 'YYYY-MM-DD'
}

export default function StudyCalendar({
  year,
  month,
  studyDates
}: StudyCalendarProps) {
  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = firstDay.getDay() || 7; // treat Sunday as 7
  const daysInMonth = new Date(year, month, 0).getDate();

  const studySet = new Set(studyDates);

  const cells: { day: number | null; dateKey?: string }[] = [];

  // leading empty cells
  for (let i = 1; i < firstWeekday; i++) {
    cells.push({ day: null });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const key = `${year}-${mm}-${dd}`;
    cells.push({ day: d, dateKey: key });
  }

  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const monthLabel = `${year} 年 ${month} 月`;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-sm shadow-black/40 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400">
            Study calendar
          </div>
          <h3 className="mt-1 text-sm font-semibold text-zinc-50">
            本月学习日历
          </h3>
        </div>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-200">
          {monthLabel}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-medium text-zinc-500">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {weeks.map((week, wi) =>
          week.map((cell, i) => {
            if (!cell.day) {
              return <div key={`${wi}-${i}`} className="h-7" />;
            }

            const studied = cell.dateKey ? studySet.has(cell.dateKey) : false;

            const baseCls =
              'flex h-7 items-center justify-center rounded-full border text-[11px]';

            const cls = studied
              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
              : 'border-transparent text-zinc-500 hover:border-zinc-700 hover:bg-zinc-900/80';

            return (
              <div key={cell.dateKey} className={baseCls + ' ' + cls}>
                {cell.day}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
