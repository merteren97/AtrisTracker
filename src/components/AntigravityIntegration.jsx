import React from 'react';
import { Radio, Unplug } from 'lucide-react';

export default function AntigravityIntegration({ status, busy, onEnable, onDisable }) {
  if (!status) return null;

  const enabled = Boolean(status.enabled);
  const hasTelemetry = Boolean(status.last_telemetry_at);
  const detail = enabled
    ? hasTelemetry
      ? '5h / haftalık değerler resmi statusline telemetry üzerinden okunur.'
      : 'Bağlantı hazır; Antigravity CLI açıldığında ilk telemetry kaydedilir.'
    : 'Prompt çalıştırmadan resmi statusline verisini yerelde yakalar.';

  return (
    <div className="p-2.5 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`p-1.5 rounded-lg ${enabled ? 'bg-emerald-950/70' : 'bg-slate-950/70'}`}>
          {enabled ? (
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Unplug className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-slate-200">
            {enabled ? 'Canlı kota bağlantısı aktif' : 'Canlı Antigravity kotasını bağla'}
          </div>
          <div className="text-[9px] text-slate-400 truncate">{detail}</div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={enabled ? onDisable : onEnable}
        className={`shrink-0 text-[9px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
          enabled
            ? 'border-slate-600/40 text-slate-300 hover:bg-slate-800'
            : 'border-cyan-500/30 text-cyan-300 bg-cyan-950/30 hover:bg-cyan-950/50'
        }`}
      >
        {busy ? 'İşleniyor…' : enabled ? 'Kapat' : 'Etkinleştir'}
      </button>
    </div>
  );
}
