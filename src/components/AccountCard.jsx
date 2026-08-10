import React from 'react';
import { UserCheck, ShieldCheck, Key, Lock } from 'lucide-react';

export default function AccountCard({ email = 'Bilinmiyor', toolName = 'Antigravity CLI', lastLogin }) {
  const formattedDate = lastLogin
    ? new Date(lastLogin).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Anlık';

  return (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Giriş Yapılan Hesap</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-500/30 text-blue-300 font-mono font-medium flex items-center space-x-1">
          <Lock className="w-2.5 h-2.5" />
          <span>Tek Oturum</span>
        </span>
      </div>

      <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-lg border border-white/5">
        <div className="flex items-center space-x-2 overflow-hidden">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
            {email.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-medium text-slate-100 truncate font-mono">
              {email}
            </span>
            <span className="text-[9px] text-slate-400 flex items-center space-x-1">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              <span>{toolName} Doğrulandı</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0 pl-2">
          <span className="text-[9px] text-slate-400 font-mono">Son Senkron:</span>
          <span className="text-[10px] text-cyan-400 font-mono font-semibold">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
