import React from 'react';
import { Calendar } from 'lucide-react';

export default function WeeklyTimeline({ weeklyUsagePercent = null, weeklyResetISO }) {
  const hasUsage = Number.isFinite(Number(weeklyUsagePercent));
  const resetDate = weeklyResetISO ? new Date(weeklyResetISO) : null;
  const hasReset = resetDate && !Number.isNaN(resetDate.getTime());

  let resetText = 'Reset bilgisi yok';
  if (hasReset) {
    const diffMs = Math.max(0, resetDate.getTime() - Date.now());
    const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    resetText = `${daysLeft}g ${hoursLeft}s kaldı`;
  }

  return (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
          <Calendar className="w-3.5 h-3.5 text-violet-400" />
          <span>Haftalık Sıfırlama Takvimi</span>
        </div>
        <span className="text-[10px] text-violet-300 font-mono">{resetText}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 bg-slate-950/80 rounded-lg border border-white/5 flex flex-col">
          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
            Haftalık Kullanım
          </span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <span className="text-base font-bold text-white font-mono">
              {hasUsage ? `%${Math.round(Number(weeklyUsagePercent))}` : '—'}
            </span>
            <span className="text-[10px] text-slate-400">kullanılan</span>
          </div>
        </div>

        <div className="p-2 bg-slate-950/80 rounded-lg border border-white/5 flex flex-col">
          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
            Yenilenme Tarihi
          </span>
          <span className="text-xs font-bold text-violet-400 font-mono mt-0.5">
            {hasReset
              ? resetDate.toLocaleDateString('tr-TR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
