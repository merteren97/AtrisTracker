import React, { useState, useEffect, useCallback } from 'react';
import { CircleAlert } from 'lucide-react';
import Header from './components/Header';
import NavigationTabs from './components/NavigationTabs';
import AccountSelector from './components/AccountSelector';
import RadialProgress from './components/RadialProgress';
import CountdownTimer from './components/CountdownTimer';
import WeeklyTimeline from './components/WeeklyTimeline';
import HistoryChart from './components/HistoryChart';
import OverviewView from './components/OverviewView';
import SettingsView from './components/SettingsView';

const TOOL_TABS = ['antigravity', 'codex', 'claudecode'];

export default function App() {
  const [activeTab, setActiveTab] = useState('antigravity');
  const [isScanning, setIsScanning] = useState(false);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const [antigravityIntegration, setAntigravityIntegration] = useState(null);
  const [accountsByTool, setAccountsByTool] = useState({
    antigravity: [],
    codex: [],
    claudecode: [],
  });
  const [selectedAccounts, setSelectedAccounts] = useState({
    antigravity: null,
    codex: null,
    claudecode: null,
  });
  const [usageData, setUsageData] = useState({
    antigravity: null,
    codex: null,
    claude: null,
  });
  const [historyData, setHistoryData] = useState([]);

  const fetchAntigravityIntegrationStatus = useCallback(async () => {
    if (!window.electronAPI?.getAntigravityIntegrationStatus) {
      setAntigravityIntegration({ enabled: false });
      return;
    }
    const status = await window.electronAPI.getAntigravityIntegrationStatus();
    setAntigravityIntegration(status);
  }, []);

  const fetchUsageData = useCallback(async () => {
    if (window.electronAPI) {
      const [agAccounts, codexAccounts, claudeAccounts] = await Promise.all([
        window.electronAPI.getAccountsByTool('antigravity'),
        window.electronAPI.getAccountsByTool('codex'),
        window.electronAPI.getAccountsByTool('claudecode'),
      ]);

      setAccountsByTool({
        antigravity: agAccounts || [],
        codex: codexAccounts || [],
        claudecode: claudeAccounts || [],
      });

      const isToolTab = TOOL_TABS.includes(activeTab);
      const currentToolKey = isToolTab ? activeTab : 'antigravity';
      const toolAccounts =
        currentToolKey === 'antigravity'
          ? agAccounts
          : currentToolKey === 'codex'
          ? codexAccounts
          : claudeAccounts;

      const activeAcc = toolAccounts.find((account) => account.active === 1) || toolAccounts[0];
      const selectedEmail = selectedAccounts[currentToolKey] || activeAcc?.email || null;

      const [agSnapshot, codexSnapshot, claudeSnapshot] = await Promise.all([
        window.electronAPI.getSnapshotByAccount(
          'antigravity',
          activeTab === 'antigravity' ? selectedEmail : selectedAccounts.antigravity
        ),
        window.electronAPI.getSnapshotByAccount(
          'codex',
          activeTab === 'codex' ? selectedEmail : selectedAccounts.codex
        ),
        window.electronAPI.getSnapshotByAccount(
          'claudecode',
          activeTab === 'claudecode' ? selectedEmail : selectedAccounts.claudecode
        ),
      ]);

      setUsageData({
        antigravity: agSnapshot,
        codex: codexSnapshot,
        claude: claudeSnapshot,
      });

      if (isToolTab) {
        const history = await window.electronAPI.getUsageHistoryByAccount(
          currentToolKey,
          selectedEmail,
          15
        );
        setHistoryData(history || []);
      } else {
        setHistoryData([]);
      }
    } else {
      const now = new Date();
      const mockAccounts = [
        { email: 'merteren1997@gmail.com', active: 1 },
        { email: 'account2.antigravity@gmail.com', active: 0 },
        { email: 'work.account@google.com', active: 0 },
      ];
      setAccountsByTool({
        antigravity: mockAccounts,
        codex: [{ email: 'merteren1997@hotmail.com', active: 1 }],
        claudecode: [{ email: 'claude@example.com', active: 1 }],
      });

      const mockAg = {
        tool: 'antigravity',
        account_email: selectedAccounts.antigravity || 'merteren1997@gmail.com',
        usage_percent: 42.5,
        limit_count: 100,
        used_count: 42.5,
        rolling_5h_percent: 42.5,
        next_5h_reset_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        weekly_usage_count: 71,
        weekly_usage_percent: 71,
        weekly_reset_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        timestamp: now.toISOString(),
      };

      setUsageData({ antigravity: mockAg, codex: null, claude: null });
      setHistoryData([
        { timestamp: new Date(now - 400000).toISOString(), rolling_5h_percent: 20 },
        { timestamp: new Date(now - 300000).toISOString(), rolling_5h_percent: 28 },
        { timestamp: new Date(now - 200000).toISOString(), rolling_5h_percent: 35 },
        { timestamp: new Date(now - 100000).toISOString(), rolling_5h_percent: 42.5 },
      ]);
    }
  }, [activeTab, selectedAccounts]);

  const handleSelectAccount = (email) => {
    if (TOOL_TABS.includes(activeTab)) {
      setSelectedAccounts((previous) => ({ ...previous, [activeTab]: email }));
    }
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      if (window.electronAPI) await window.electronAPI.scanUsage();
      await fetchUsageData();
      await fetchAntigravityIntegrationStatus();
    } finally {
      setTimeout(() => setIsScanning(false), 500);
    }
  };

  const handleIntegrationChange = async (enable) => {
    if (!window.electronAPI) return;
    setIntegrationBusy(true);
    try {
      const status = enable
        ? await window.electronAPI.enableAntigravityIntegration()
        : await window.electronAPI.disableAntigravityIntegration();
      setAntigravityIntegration(status);
      await fetchUsageData();
    } finally {
      setIntegrationBusy(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
    fetchAntigravityIntegrationStatus();
    const unsubscribe = window.electronAPI?.onUsageUpdated?.(() => {
      fetchUsageData();
      fetchAntigravityIntegrationStatus();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchUsageData, fetchAntigravityIntegrationStatus]);

  const currentData =
    activeTab === 'antigravity'
      ? usageData.antigravity
      : activeTab === 'codex'
      ? usageData.codex
      : activeTab === 'claudecode'
      ? usageData.claude
      : null;

  const currentToolTitle =
    activeTab === 'antigravity'
      ? 'Antigravity CLI'
      : activeTab === 'codex'
      ? 'Codex CLI'
      : activeTab === 'claudecode'
      ? 'Claude Code'
      : 'Genel Özet';

  const currentAccounts = accountsByTool[activeTab] || [];
  const selectedEmail =
    selectedAccounts[activeTab] || currentData?.account_email || currentAccounts[0]?.email;

  const emptyHint =
    activeTab === 'antigravity'
      ? 'Ayarlar içinden Antigravity telemetry yedeğini etkinleştirip Antigravity CLI’da bir işlem yaptıktan sonra yenile.'
      : activeTab === 'codex'
      ? 'Codex CLI güncel ve giriş yapılmış olmalı. AtrisTracker önce app-server rate limit kaynağını, gerekirse eski session kaydını dener.'
      : 'Claude Code OAuth oturumunun aktif olduğundan emin ol. AtrisTracker ortam değişkeni, config dizini ve macOS Keychain kimlik bilgilerini kontrol eder.';

  return (
    <div className="w-full h-screen bg-slate-950/85 text-slate-100 flex flex-col border border-white/10 rounded-xl overflow-hidden glass-panel shadow-2xl">
      <Header
        onRefresh={handleManualScan}
        isScanning={isScanning}
        onOpenSettings={() => setActiveTab('settings')}
        settingsActive={activeTab === 'settings'}
      />
      <NavigationTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 custom-scrollbar">
        {activeTab === 'settings' ? (
          <SettingsView
            antigravityStatus={antigravityIntegration}
            integrationBusy={integrationBusy}
            onEnableAntigravity={() => handleIntegrationChange(true)}
            onDisableAntigravity={() => handleIntegrationChange(false)}
          />
        ) : activeTab === 'overview' ? (
          <OverviewView usageData={usageData} />
        ) : (
          <>
            <AccountSelector
              accounts={currentAccounts}
              selectedAccountEmail={selectedEmail}
              onSelectAccount={handleSelectAccount}
              lastSync={currentData?.timestamp}
            />

            {currentData ? (
              <>
                <RadialProgress
                  percentage={currentData?.rolling_5h_percent ?? currentData?.usage_percent ?? null}
                  label={`${currentToolTitle} 5-Saatlik Limit`}
                />

                <CountdownTimer
                  resetTimeISO={currentData?.next_5h_reset_at}
                  title="5-Saatlik Kota Sıfırlaması"
                />

                <WeeklyTimeline
                  weeklyUsagePercent={
                    currentData?.weekly_usage_percent ?? currentData?.weekly_usage_count ?? null
                  }
                  weeklyResetISO={currentData?.weekly_reset_at}
                />

                <HistoryChart historyData={historyData} />
              </>
            ) : (
              <div className="p-3 bg-slate-900/50 rounded-xl border border-dashed border-white/10 flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-950/30 border border-amber-500/20 shrink-0">
                  <CircleAlert className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200">
                    {currentAccounts.length ? 'Hesap bulundu, quota verisi bekleniyor' : 'Henüz hesap bulunamadı'}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">{emptyHint}</p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
