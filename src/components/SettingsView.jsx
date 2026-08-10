import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Download, RefreshCw, RotateCcw, Rocket, ShieldCheck, TriangleAlert } from 'lucide-react';

const PROVIDERS = [
  { key: 'antigravity', label: 'Antigravity', expected: 'local quota service' },
  { key: 'codex', label: 'Codex', expected: 'app-server rate limits' },
  { key: 'claude', label: 'Claude', expected: 'OAuth usage endpoint' },
];

export default function SettingsView() {
  const [startupStatus, setStartupStatus] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateActionBusy, setUpdateActionBusy] = useState(false);
  const [scanningProviders, setScanningProviders] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    window.electronAPI.getStartupStatus?.().then(setStartupStatus);
    window.electronAPI.getUpdateStatus?.().then(setUpdateStatus);
    window.electronAPI.getScanStatus?.().then(setScanStatus);
    const unsubscribeUpdate = window.electronAPI.onUpdateStatus?.(setUpdateStatus);
    const unsubscribeUsage = window.electronAPI.onUsageUpdated?.(() => window.electronAPI.getScanStatus?.().then(setScanStatus));
    return () => {
      if (typeof unsubscribeUpdate === 'function') unsubscribeUpdate();
      if (typeof unsubscribeUsage === 'function') unsubscribeUsage();
    };
  }, []);

  const toggleStartup = async () => {
    if (!window.electronAPI?.setStartupEnabled || !startupStatus?.supported) return;
    setStartupStatus(await window.electronAPI.setStartupEnabled(!startupStatus.enabled));
  };

  const checkForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setCheckingUpdate(true);
    try { setUpdateStatus(await window.electronAPI.checkForUpdates()); }
    finally { setCheckingUpdate(false); }
  };

  const handleUpdateAction = async () => {
    if (!window.electronAPI) return;
    setUpdateActionBusy(true);
    try {
      if (updateStatus?.stage === 'downloaded') await window.electronAPI.installUpdate?.();
      else {
        const status = await window.electronAPI.downloadUpdate?.();
        if (status) setUpdateStatus(status);
      }
    } finally { setUpdateActionBusy(false); }
  };

  const refreshDiagnostics = async () => {
    if (!window.electronAPI?.scanUsage) return;
    setScanningProviders(true);
    try { setScanStatus(await window.electronAPI.scanUsage()); }
    finally { setScanningProviders(false); }
  };

  const updateAvailable = Boolean(updateStatus?.updateAvailable);
  const downloaded = updateStatus?.stage === 'downloaded';
  const downloading = updateStatus?.stage === 'downloading';
  const updateError = updateStatus?.error || null;

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-sm font-bold text-slate-100">Ayarlar</h2>
        <p className="text-[10px] text-slate-400 mt-0.5">Güncelleme, başlangıç ve telemetry kullanmayan quota kaynaklarını yönet.</p>
      </div>

      <section className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-3">
        <div className="flex items-start gap-2">
          <div className={`p-1.5 rounded-lg ${updateAvailable ? 'bg-cyan-950/60' : 'bg-slate-950/70'}`}>
            <BellRing className={`w-3.5 h-3.5 ${updateAvailable ? 'text-cyan-300' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-200">Güncellemeler</span>
              {updateAvailable ? <span className="text-[8px] px-1.5 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300">v{updateStatus?.latestVersion} hazır</span> : updateStatus?.checkedAt && !updateError ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : null}
            </div>
            <p className="text-[9px] text-slate-400 mt-0.5 leading-relaxed">Kontrol otomatik yapılır; indirme ve kurulum yalnızca sen başlattığında gerçekleşir.</p>
          </div>
        </div>

        {downloading && (
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] text-slate-400"><span>Güncelleme indiriliyor</span><span className="font-mono">{Math.round(updateStatus?.percent || 0)}%</span></div>
            <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${updateStatus?.percent || 0}%` }} /></div>
          </div>
        )}

        {updateError && <div className="flex items-start gap-1.5 text-[9px] text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded-lg p-2"><TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" /><span>{updateError}</span></div>}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] text-slate-500 font-mono truncate">Mevcut: v{updateStatus?.currentVersion || '—'}</div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={checkForUpdates} disabled={checkingUpdate || downloading} className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-slate-800 disabled:opacity-50" title="Güncellemeleri kontrol et"><RefreshCw className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`} /></button>
            {updateAvailable && (
              <button type="button" onClick={handleUpdateAction} disabled={updateActionBusy || downloading} className="flex items-center gap-1 text-[9px] font-semibold px-2.5 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-200 bg-cyan-950/30 hover:bg-cyan-950/50 disabled:opacity-50">
                {downloaded ? <RotateCcw className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                <span>{downloaded ? 'Kur ve yeniden başlat' : downloading ? 'İndiriliyor…' : 'Yükselt'}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-950/30"><ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /></div>
            <div><div className="text-[11px] font-semibold text-slate-200">Telemetry’siz veri toplama</div><div className="text-[9px] text-slate-400">Hiçbir provider’a statusline/hook kurulmaz.</div></div>
          </div>
          <button type="button" onClick={refreshDiagnostics} disabled={scanningProviders} className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${scanningProviders ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="space-y-1.5">
          {PROVIDERS.map(({ key, label, expected }) => {
            const provider = scanStatus?.[key] || null;
            const live = provider?.scan_status === 'live';
            return (
              <div key={key} className="p-2 rounded-lg bg-slate-950/55 border border-white/5">
                <div className="flex items-center justify-between gap-2"><div><span className="text-[10px] font-semibold text-slate-300">{label}</span><span className="text-[8px] text-slate-600 ml-1.5">{expected}</span></div><span className={`text-[8px] font-semibold ${live ? 'text-emerald-400' : 'text-amber-300'}`}>{live ? 'Canlı' : 'Veri yok'}</span></div>
                <div className="text-[8px] text-slate-500 font-mono mt-0.5 break-all">{provider?.source || 'Kaynak henüz belirlenmedi'}</div>
                {provider?.error && <div className="text-[8px] text-amber-300/90 mt-1 leading-relaxed break-words">{provider.error}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0"><div className="p-1.5 rounded-lg bg-slate-950/70"><Rocket className="w-3.5 h-3.5 text-indigo-300" /></div><div><div className="text-[11px] font-semibold text-slate-200">Windows ile başlat</div><div className="text-[9px] text-slate-400">AtrisTracker oturum açıldığında arka planda başlasın.</div></div></div>
          <button type="button" onClick={toggleStartup} disabled={!startupStatus?.supported} className={`relative w-9 h-5 rounded-full border transition-colors disabled:opacity-40 ${startupStatus?.enabled ? 'bg-cyan-600/70 border-cyan-400/50' : 'bg-slate-800 border-white/10'}`}><span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${startupStatus?.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button>
        </div>
      </section>
    </div>
  );
}
