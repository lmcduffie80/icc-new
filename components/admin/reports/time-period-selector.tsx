'use client';

import { TimePeriod } from '@/types/reports';

interface TimePeriodSelectorProps {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
}

const periods: { value: TimePeriod; label: string }[] = [
  { value: 'all_time', label: 'All Time' },
  { value: '30_days', label: 'Last 30 Days' },
  { value: '90_days', label: 'Last 90 Days' },
  { value: '180_days', label: 'Last 180 Days' },
  { value: 'year', label: 'Last Year' },
];

export function TimePeriodSelector({ value, onChange }: TimePeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="time-period" className="text-sm font-medium text-slate-700">
        Time Period:
      </label>
      <select
        id="time-period"
        value={value}
        onChange={(e) => onChange(e.target.value as TimePeriod)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      >
        {periods.map((period) => (
          <option key={period.value} value={period.value}>
            {period.label}
          </option>
        ))}
      </select>
    </div>
  );
}
