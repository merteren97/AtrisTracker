import React, { useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Download,
  RefreshCw,
  Rocket,
  TriangleAlert,
} from 'lucide-react';
import AntigravityIntegration from './AntigravityIntegration';

export default function SettingsView({
  antigravityStatus,
  integrationBusy,
  onEnableAntigravity,
  onDisableAntigravity,
}) {
  const [startupStatus, setStartupStatus] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [openingUpdate, setOpeningUpdate] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return undefined;

    window.electronAPI.getStartupStatus?.().then(setStartupStatus);
    window.electronAPI.getUpdateStatus?.().then(setUpdateStatus);
    const unsubscribe = window.electronAPI.onUpdateStatus?.((status) => setUpdateStatus(status));
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const toggleStartup = async () => {
    if (!window.electronAPI?.setStartupEnabled || !startupStatus?.supported) return;
    const status = await window.electronAPI.setStartupEnabled(!startupStatus.enabled);
    setStartupStatus(status);
  };

  const checkForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setCheckingUpdate(true);
    try {
      const status = await window.electronAPI.checkForUpdates();
      setUpdateStatus(status);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const openUpdate = async () => {
    if (!window.electronAPI?.openUpdate) return;
    setOpeningUpdate(true);
    try {
      await window.electronAPI.openUpdate();
    } finally {
      setOpeningUpdate(false);
    }
  };

  const updateAvailable = Boolean(updateStatus?.updateAvailable);
  const updateError = updateStatus?.error || null;

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-sm font-bold text-slate-100">Ayarlar</h2>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Güncelleme, başlangıç ve veri toplama entegrasyonlarını yönet.
        </p>
      </div>

      <section className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <div className={`p-1.5 rounded-lg ${updateAvailable ? 'bg-cyan-950/60' : 'bg-slate-950/70'}`}>
              <BellRing className={`w-3.5 h-3.5 ${updateAvailable ? 'text-cyan-300' : 'text-slate-400'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-200">Güncellemeler</span>
                {updateAvailable ? (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300">
                    v{updateStatus.latestVersion} hazır
                  </span>
                ) : updateStatus?.checkedAt && !updateError ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : null}
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5 leading-relaxed">
                Yeni sürüm varsa AtrisTracker bildirim gösterir. İndirme veya kurulum sen istemeden başlamaz.
              </p>
            </div>
          </div>
        </div>

        {updateError && (
          <div className="flex items-start gap-1.5 text-[9px] text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded-lg p-2">
            <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
            <span>Güncelleme kontrolü yapılamadı: {updateError}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] text-slate-500 font-mono truncate">
            Mevcut: v{updateStatus?.currentVersion || '—'}
            {updateStatus?.checkedAt ? ` • Son kontrol ${new Date(updateStatus.checkedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={checkingUpdate}
              className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              title="Güncellemeleri kontrol et"
            >
              <RefreshCw className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`} />
            </button>
            {updateAvailable && (
              <button
                type="button"
                onClick={openUpdate}
                disabled={openingUpdate}
                className="flex items-center gap-1 text-[9px] font-semibold px-2.5 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-200 bg-cyan-950/30 hover:bg-cyan-950/50 disabled:opacity-50"
              >
                <Download className="w-3 h-3" />
                <span>{openingUpdate ? 'Açılıyor…' : 'Yükselt'}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-slate-950/70">
              <Rocket className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-200">Windows ile başlat</div>
              <div className="text-[9px] text-slate-400">
                AtrisTracker oturum açıldığında arka planda başlasın.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleStartup}
            disabled={!startupStatus?.supported}
            className={`relative w-9 h-5 rounded-full border transition-colors disabled:opacity-40 ${
              startupStatus?.enabled
                ? 'bg-cyan-600/70 border-cyan-400/50'
                : 'bg-slate-800 border-white/10'
            }`}
            title={startupStatus?.supported ? 'Başlangıç ayarını değiştir' : 'Bu platformda desteklenmiyor'}
          >
            <span
              className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
                startupStatus?.enabled ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      <section className="space-y-1.5">
        <div className="px-1 text-[10px] font-semibold text-slate-300">Antigravity veri yedeği</div>
        <AntigravityIntegration
          status={antigravityStatus}
          busy={integrationBusy}
          onEnable={onEnableAntigravity}
          onDisable={onDisableAntigravity}
        />
        <p className="px-1 text-[9px] text-slate-500 leading-relaxed">
          Yerel quota servisi kullanılamazsa statusline telemetry son güvenilir veriyi korumaya yardımcı olur.
        </p>
      </section>
    </div>
  );
}
