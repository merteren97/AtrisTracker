import React from 'react';
import { Cpu, Terminal, Sparkles, LayoutGrid } from 'lucide-react';

export default function NavigationTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'antigravity', label: 'Antigravity', icon: Cpu, color: 'from-blue-500 to-cyan-500' },
    { id: 'codex', label: 'Codex', icon: Terminal, color: 'from-emerald-500 to-teal-500' },
    { id: 'claudecode', label: 'Claude', icon: Sparkles, color: 'from-amber-500 to-violet-500' },
    { id: 'overview', label: 'Özet', icon: LayoutGrid, color: 'from-indigo-500 to-purple-500' },
  ];

  return (
    <div className="flex items-center space-x-1 p-1 bg-slate-950/80 rounded-xl border border-white/5 mx-3 my-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-slate-800/90 text-white shadow-md border border-white/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
