import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw } from 'lucide-react';

export default function CountdownTimer({ resetTimeISO, title = '5 Saatlik Limit Sıfırlanması' }) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 });

  useEffect(() => {
    if (!resetTimeISO) return;

    const updateTimer = () => {
      const target = new Date(resetTimeISO).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, target - now);

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({
        hours,
        minutes,
        seconds,
        totalSeconds: Math.floor(diff / 1000),
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [resetTimeISO]);

  // Calculate elapsed percentage in 5h (18000 seconds)
  const totalWindowSeconds = 5 * 60 * 60;
  const elapsedPercent = Math.min(
    100,
    Math.max(0, ((totalWindowSeconds - timeLeft.totalSeconds) / totalWindowSeconds) * 100)
  );

  const formatTwoDigits = (num) => String(num).padStart(2, '0');

  return (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-medium">
          <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse-slow" />
          <span>{title}</span>
        </div>
        <span className="text-[10px] text-cyan-400/80 font-mono font-medium">
          %{Math.round(elapsedPercent)} Tamamlandı
        </span>
      </div>

      {/* Countdown Digital Display */}
      <div className="flex items-center justify-center space-x-2 py-1.5 bg-slate-950/70 rounded-lg border border-white/5 font-mono">
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-white leading-none">
            {formatTwoDigits(timeLeft.hours)}
          </span>
          <span className="text-[8px] text-slate-400 uppercase mt-0.5">Saat</span>
        </div>
        <span className="text-slate-500 font-bold text-lg">:</span>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-white leading-none">
            {formatTwoDigits(timeLeft.minutes)}
          </span>
          <span className="text-[8px] text-slate-400 uppercase mt-0.5">Dak</span>
        </div>
        <span className="text-slate-500 font-bold text-lg">:</span>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-cyan-400 leading-none">
            {formatTwoDigits(timeLeft.seconds)}
          </span>
          <span className="text-[8px] text-slate-400 uppercase mt-0.5">San</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-white/5">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${elapsedPercent}%` }}
        />
      </div>
    </div>
  );
}
