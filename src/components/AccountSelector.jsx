import React from 'react';
import { UserCheck, Shield, Clock, CheckCircle2, History } from 'lucide-react';

export default function AccountSelector({ accounts = [], selectedAccountEmail, onSelectAccount, toolTitle }) {
  if (!accounts || accounts.length === 0) return null;

  return (
    <div className="p-2.5 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-300">
          <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Kayıtlı Hesabı Seç ({accounts.length})</span>
        </div>
        <span className="text-[9px] text-slate-400 font-mono">Çoklu Oturum Takibi</span>
      </div>

      {/* Account Pills Switcher */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 custom-scrollbar">
        {accounts.map((acc) => {
          const isSelected = selectedAccountEmail === acc.email;
          const isActiveSession = acc.active === 1;

          return (
            <button
              key={acc.id || acc.email}
              onClick={() => onSelectAccount(acc.email)}
              className={`flex items-center space-x-1.5 py-1 px-2.5 rounded-lg text-xs font-mono transition-all duration-200 shrink-0 border ${
                isSelected
                  ? 'bg-slate-800 text-white border-cyan-500/50 shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-white/5 hover:bg-slate-900/80'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {isActiveSession && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isActiveSession ? 'bg-emerald-500' : 'bg-slate-500'
                  }`}
                ></span>
              </span>

              <span className="truncate max-w-[130px] font-medium">{acc.email}</span>

              {isActiveSession ? (
                <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-400 font-sans font-bold border border-emerald-500/30">
                  Aktif
                </span>
              ) : (
                <span className="text-[8px] px-1 py-0.2 rounded bg-slate-900 text-slate-400 font-sans font-medium border border-white/5">
                  Kayıtlı
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
