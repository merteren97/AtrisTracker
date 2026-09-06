import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { FIVE_HOUR_KIND, WEEKLY_KIND, getHistoryPercent, getWindowLabel } from '../quotaWindows';

export default function HistoryChart({ historyData = [], windowKind = FIVE_HOUR_KIND, timeFormat = 'time' }) {
  if (!historyData || historyData.length === 0) {
    return (
      <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 text-center text-xs text-slate-400">
        Geçmiş kullanım verisi henüz yok.
      </div>
    );
  }

  const isWeekly = windowKind === WEEKLY_KIND;
  const windowLabel = getWindowLabel(windowKind);
  const strokeColor = isWeekly ? '#a78bfa' : '#06b6d4';
  const gradientId = `usageGradient-${isWeekly ? 'weekly' : 'fivehour'}`;
  const formattedData = historyData
    .map((item) => {
      const date = new Date(item.timestamp);
      const usage = getHistoryPercent(item, windowKind);
      return {
        time:
          timeFormat === 'date'
            ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
            : date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        usage: usage === null ? null : Math.round(usage),
      };
    })
    .filter((item) => item.usage !== null);

  if (formattedData.length === 0) {
    return (
      <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 text-center text-xs text-slate-400">
        {windowLabel} kullanım geçmişi henüz yok.
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
          <TrendingUp className={`w-3.5 h-3.5 ${isWeekly ? 'text-violet-400' : 'text-cyan-400'}`} />
          <span>{windowLabel} Kullanım Trendi (%)</span>
        </div>
        <span className="text-[9px] text-slate-400 font-mono">
          {timeFormat === 'date' ? 'Son 7 gün' : 'SQLite Snapshot'}
        </span>
      </div>

      <div className="w-full h-24 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={isWeekly ? '#8b5cf6' : '#3b82f6'} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={9}
              tickLine={false}
              interval={timeFormat === 'date' ? 0 : Math.max(0, Math.ceil(formattedData.length / 6) - 1)}
            />
            <YAxis stroke="#64748b" fontSize={9} domain={[0, 100]} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#fff',
                fontFamily: 'monospace',
              }}
              formatter={(value) => [`%${value}`, `${windowLabel} Kullanım`]}
            />
            <Area
              type="monotone"
              dataKey="usage"
              stroke={strokeColor}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}