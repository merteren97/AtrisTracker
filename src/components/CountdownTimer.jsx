import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const EMPTY_TIME = { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };

export default function CountdownTimer({
  resetTimeISO,
  title = '5 Saatlik Limit Sıfırlanması',
  windowSeconds = 5 * 60 * 60,
  status = 'active',
}) {
  const [timeLeft, setTimeLeft] = useState(EMPTY_TIME);
  const targetMs = resetTimeISO ? new Date(resetTimeISO).getTime() : NaN;
  const isReset = status === 'reset';
  const hasReset = !isReset && Number.isFinite(targetMs);

  useEffect(() => {
    if (!hasReset) {
      setTimeLeft(EMPTY_TIME);
      return undefined;
    }

    const updateTimer = () => {
      const diff = Math.max(0, targetMs - Date.now());
      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        totalSeconds: Math.floor(diff / 1000),
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [hasReset, targetMs]);

  const elapsedPercent = isReset
    ? 100
    : hasReset
    ? Math.min(100, Math.max(0, ((windowSeconds - timeLeft.totalSeconds) / windowSeconds) * 100))
    : 0;

  const formatTwoDigits = (num) => String(num).padStart(2, '0');

  return (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-medium">
          <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse-slow" />
          <span>{title}</span>
        </div>
        <span className="text-[10px] text-cyan-400/80 font-mono font-medium">
          {isReset ? 'Resetlendi' : hasReset ? `%${Math.round(elapsedPercent)} Tamamlandı` : 'Reset bilgisi yok'}
        </span>
      </div>

      <div className="flex items-center justify-center space-x-2 py-1.5 bg-slate-950/70 rounded-lg border border-white/5 font-mono">
        {isReset ? (
          <span className="text-sm font-semibold text-emerald-400 py-1">Kota sıfırlandı</span>
        ) : hasReset ? (
          <>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-white leading-none">{formatTwoDigits(timeLeft.hours)}</span>
              <span className="text-[8px] text-slate-400 uppercase mt-0.5">Saat</span>
            </div>
            <span className="text-slate-500 font-bold text-lg">:</span>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-white leading-none">{formatTwoDigits(timeLeft.minutes)}</span>
              <span className="text-[8px] text-slate-400 uppercase mt-0.5">Dak</span>
            </div>
            <span className="text-slate-500 font-bold text-lg">:</span>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-cyan-400 leading-none">{formatTwoDigits(timeLeft.seconds)}</span>
              <span className="text-[8px] text-slate-400 uppercase mt-0.5">San</span>
            </div>
          </>
        ) : (
          <span className="text-sm font-semibold text-slate-400 py-1">— : — : —</span>
        )}
      </div>

      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-white/5">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${elapsedPercent}%` }}
        />
      </div>

      {(hasReset || isReset) && (
        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
          <span>Sıfırlanma tarihi</span>
          <span className="text-slate-300 font-semibold">
            {new Date(targetMs).toLocaleString('tr-TR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}
    </div>
  );
}
