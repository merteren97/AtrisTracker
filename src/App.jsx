import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import NavigationTabs from './components/NavigationTabs';
import AccountSelector from './components/AccountSelector';
import RadialProgress from './components/RadialProgress';
import CountdownTimer from './components/CountdownTimer';
import AccountCard from './components/AccountCard';
import WeeklyTimeline from './components/WeeklyTimeline';
import HistoryChart from './components/HistoryChart';
import OverviewView from './components/OverviewView';

export default function App() {
  const [activeTab, setActiveTab] = useState('antigravity');
  const [isScanning, setIsScanning] = useState(false);
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

      const currentToolKey = activeTab === 'overview' ? 'antigravity' : activeTab;
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

      if (activeTab !== 'overview') {
        const history = await window.electronAPI.getUsageHistoryByAccount(
          currentToolKey,
          selectedEmail,
          15
        );
        setHistoryData(history || []);
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

      setUsageData({
        antigravity: mockAg,
        codex: null,
        claude: null,
      });

      setHistoryData([
        { timestamp: new Date(now - 400000).toISOString(), rolling_5h_percent: 20 },
        { timestamp: new Date(now - 300000).toISOString(), rolling_5h_percent: 28 },
        { timestamp: new Date(now - 200000).toISOString(), rolling_5h_percent: 35 },
        { timestamp: new Date(now - 100000).toISOString(), rolling_5h_percent: 42.5 },
      ]);
    }
  }, [activeTab, selectedAccounts]);

  const handleSelectAccount = (email) => {
    if (activeTab !== 'overview') {
      setSelectedAccounts((previous) => ({
        ...previous,
        [activeTab]: email,
      }));
    }
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      if (window.electronAPI) {
        await window.electronAPI.scanUsage();
      }
      await fetchUsageData();
    } finally {
      setTimeout(() => setIsScanning(false), 500);
    }
  };

  useEffect(() => {
    fetchUsageData();
    const unsubscribe = window.electronAPI?.onUsageUpdated?.(() => {
      fetchUsageData();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchUsageData]);

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

  return (
    <div className="w-full h-screen bg-slate-950/85 text-slate-100 flex flex-col border border-white/10 rounded-xl overflow-hidden glass-panel shadow-2xl">
      <Header onRefresh={handleManualScan} isScanning={isScanning} />
      <NavigationTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 custom-scrollbar">
        {activeTab === 'overview' ? (
          <OverviewView usageData={usageData} />
        ) : (
          <>
            <AccountSelector
              accounts={currentAccounts}
              selectedAccountEmail={selectedEmail}
              onSelectAccount={handleSelectAccount}
              toolTitle={currentToolTitle}
            />

            <AccountCard
              email={currentData?.account_email || selectedEmail || 'Bilinmiyor'}
              toolName={currentToolTitle}
              lastLogin={currentData?.timestamp}
            />

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
        )}
      </main>
    </div>
  );
}
