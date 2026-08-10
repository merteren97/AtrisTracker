import React, { useState, useEffect } from 'react';
import { RotateCw, Pin, PinOff, Minus, X, Settings } from 'lucide-react';
import packageInfo from '../../package.json';

export default function Header({ onRefresh, isScanning, onOpenSettings, settingsActive = false }) {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isAlwaysOnTop().then((state) => setIsAlwaysOnTop(state));
    }
  }, []);

  const handleTogglePin = async () => {
    if (window.electronAPI) {
      const newState = await window.electronAPI.toggleAlwaysOnTop();
      setIsAlwaysOnTop(newState);
    }
  };

  const handleMinimize = () => {
    if (window.electronAPI) window.electronAPI.minimizeWindow();
  };

  const handleClose = () => {
    if (window.electronAPI) window.electronAPI.closeWindow();
  };

  return (
    <header className="app-drag-region flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-white/10 backdrop-blur-md select-none rounded-t-xl">
      <div className="flex items-center space-x-2">
        <img
          src="./logo.jpg"
          alt="AtrisTracker Logo"
          className="w-6 h-6 rounded-lg object-cover border border-cyan-500/30 shadow-glow"
        />
        <div className="flex flex-col">
          <span className="text-xs font-bold bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
            AtrisTracker
          </span>
          <span className="text-[9px] text-slate-400 font-mono leading-none">
            v{packageInfo.version} • Overlay
          </span>
        </div>
      </div>

      <div className="app-no-drag flex items-center space-x-1">
        <button
          onClick={onOpenSettings}
          title="Ayarlar"
          className={`p-1.5 rounded-lg transition-colors ${
            settingsActive
              ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onRefresh}
          disabled={isScanning}
          title="Verileri Yenile"
          className={`p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors ${
            isScanning ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-cyan-400' : ''}`} />
        </button>

        <button
          onClick={handleTogglePin}
          title={isAlwaysOnTop ? 'Üstte Tut (Aktif)' : 'Üstte Tut (Pasif)'}
          className={`p-1.5 rounded-lg transition-colors ${
            isAlwaysOnTop
              ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          {isAlwaysOnTop ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={handleMinimize}
          title="Küçült"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClose}
          title="Kapat (Tepsiye Küçült)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
