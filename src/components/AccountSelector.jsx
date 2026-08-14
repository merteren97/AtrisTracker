import React from 'react';
import { Clock3, Trash2, UserCheck } from 'lucide-react';

export default function AccountSelector({
  accounts = [],
  selectedAccountEmail,
  onSelectAccount,
  onDeleteAccount,
  lastSync,
}) {
  if (!accounts || accounts.length === 0) return null;

  const selectedAccount =
    accounts.find((account) => account.email === selectedAccountEmail) || accounts[0];
  const syncValue = lastSync || selectedAccount?.last_snapshot_at || null;
  const syncText = syncValue
    ? new Date(syncValue).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : 'Veri bekleniyor';

  return (
    <div className="p-2.5 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-300">Hesap</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-950/70 border border-white/5 text-slate-500">
            {accounts.length}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono shrink-0">
          <Clock3 className="w-2.5 h-2.5" />
          <span>{syncText}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
        {accounts.map((account) => {
          const isSelected = selectedAccountEmail === account.email;
          const isActiveSession = account.active === 1;

          return (
            <div
              key={account.id || account.email}
              role="button"
              tabIndex={0}
              onClick={() => onSelectAccount(account.email)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectAccount(account.email);
                }
              }}
              title={isActiveSession ? `${account.email} • aktif oturum` : account.email}
              className={`group flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[10px] font-mono transition-all duration-200 shrink-0 border max-w-[210px] cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 text-white border-cyan-500/40 shadow-sm'
                  : 'bg-slate-950/50 text-slate-400 hover:text-slate-200 border-white/5 hover:bg-slate-900/80'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isActiveSession ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
              <span className="truncate">{account.email}</span>
              {!isActiveSession && typeof onDeleteAccount === 'function' && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteAccount(account.email);
                  }}
                  className="p-0.5 rounded-md text-slate-500 opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-red-950/40 shrink-0 transition-opacity"
                  title="Kayıtlı hesap verisini sil"
                  aria-label={`${account.email} verisini sil`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
