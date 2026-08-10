import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function HistoryChart({ historyData = [] }) {
  if (!historyData || historyData.length === 0) {
    return (
      <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 text-center text-xs text-slate-400">
        Geçmiş kullanım verisi henüz yok.
      </div>
    );
  }

  // Format chart items
  const formattedData = historyData.map((item) => {
    const date = new Date(item.timestamp);
    return {
      time: date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      usage: Math.round(item.rolling_5h_percent || item.usage_percent || 0),
    };
  });

  return (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
          <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
          <span>5 Saatlik Kullanım Trendi (%)</span>
        </div>
        <span className="text-[9px] text-slate-400 font-mono">SQLite Snapshot</span>
      </div>

      <div className="w-full h-24 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
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
              formatter={(value) => [`%${value}`, 'Kullanım']}
            />
            <Area
              type="monotone"
              dataKey="usage"
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#usageGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
