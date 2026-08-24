import React from 'react';

export default function RadialProgress({ percentage = null, label = '5h Rolling Limit', status = 'active' }) {
  const radius = 64;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const hasData =
    percentage !== null &&
    percentage !== undefined &&
    percentage !== '' &&
    Number.isFinite(Number(percentage));
  const clampedPercent = hasData ? Math.min(100, Math.max(0, Number(percentage))) : 0;
  const remainingPercent = Math.max(0, 100 - clampedPercent);
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  let badgeText = hasData ? 'Normal' : 'Veri Bekleniyor';
  let badgeStyle = hasData
    ? 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30'
    : 'text-slate-300 bg-slate-800/60 border-slate-600/30';

  if (status === 'reset') {
    badgeText = 'Resetlendi';
    badgeStyle = 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30';
  } else if (hasData && clampedPercent >= 85) {
    badgeText = 'Kritik Limit';
    badgeStyle = 'text-rose-400 bg-rose-950/50 border-rose-500/30';
  } else if (hasData && clampedPercent >= 60) {
    badgeText = 'Yüksek Kullanım';
    badgeStyle = 'text-amber-400 bg-amber-950/50 border-amber-500/30';
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-900/60 rounded-2xl border border-white/5 backdrop-blur-sm relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-cyan-500/5 pointer-events-none" />

      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r={radius}
            className="text-slate-800"
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            className="transition-all duration-700 ease-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="url(#radialGradient)"
            fill="transparent"
          />
          <defs>
            <linearGradient id="radialGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop
                offset="0%"
                stopColor={
                  !hasData ? '#64748b' : clampedPercent >= 85 ? '#f43f5e' : clampedPercent >= 60 ? '#f59e0b' : '#06b6d4'
                }
              />
              <stop
                offset="100%"
                stopColor={
                  !hasData ? '#475569' : clampedPercent >= 85 ? '#fbbf24' : clampedPercent >= 60 ? '#f97316' : '#3b82f6'
                }
              />
            </linearGradient>
          </defs>
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent font-mono">
            {hasData ? `%${Math.round(clampedPercent)}` : '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
            {hasData ? 'Kullanılan' : 'Canlı Kota Yok'}
          </span>
          <span className="text-[9px] text-cyan-400 font-mono font-semibold mt-0.5">
            {hasData ? `%${Math.round(remainingPercent)} Kalan` : 'Son gerçek veri bekleniyor'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-col items-center space-y-1">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badgeStyle}`}>
          {badgeText}
        </span>
        <div className="text-xs text-slate-300 font-mono flex items-center space-x-1.5 mt-1">
          {hasData ? (
            <>
              <span className="text-emerald-400 font-bold">%{Math.round(remainingPercent)} Kalan Kota</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400 font-medium">%{Math.round(clampedPercent)} Dolu</span>
            </>
          ) : (
            <span className="text-slate-400 font-medium">Tahmini değer gösterilmiyor</span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
    </div>
  );
}
