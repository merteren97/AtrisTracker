import React from 'react';
import { Cpu, Terminal, Sparkles, AlertCircle } from 'lucide-react';

export default function OverviewView({ usageData }) {
  const tools = [
    {
      id: 'antigravity',
      name: 'Antigravity CLI',
      icon: Cpu,
      data: usageData.antigravity,
      color: 'from-blue-500 to-cyan-500',
      badgeColor: 'border-cyan-500/30 text-cyan-400 bg-cyan-950/40',
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      icon: Terminal,
      data: usageData.codex,
      color: 'from-emerald-500 to-teal-500',
      badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/40',
    },
    {
      id: 'claudecode',
      name: 'Claude Code',
      icon: Sparkles,
      data: usageData.claude,
      color: 'from-amber-500 to-violet-500',
      badgeColor: 'border-amber-500/30 text-amber-400 bg-amber-950/40',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-300 font-semibold px-1">
        <span>Tüm Servisler Özeti</span>
        <span className="text-[10px] text-slate-400 font-mono">3 Aktif Araç</span>
      </div>

      <div className="space-y-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const data = tool.data || {};
          const percent = Math.round(data.rolling_5h_percent || data.usage_percent || 0);

          return (
            <div
              key={tool.id}
              className="p-3 bg-slate-900/60 rounded-xl border border-white/5 backdrop-blur-sm space-y-2 glass-card-hover"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`p-1.5 rounded-lg bg-gradient-to-br ${tool.color} text-white shadow-sm`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">{tool.name}</span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {data.account_email || 'Aktif Oturum'}
                    </span>
                  </div>
                </div>

                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md border ${tool.badgeColor}`}>
                  %{percent}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full bg-gradient-to-r ${tool.color} rounded-full transition-all duration-500`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                  <span>{data.used_count || 0} / {data.limit_count || 0} istek</span>
                  <span>5h Rolling Window</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
