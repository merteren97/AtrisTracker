import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import ConfirmDialog from './components/ConfirmDialog';
import { getQuotaWindowState, getWindowLabel, WEEKLY_KIND } from './quotaWindows';

const TOOL_TABS = ['antigravity', 'codex', 'claudecode'];

export default function App() {
  const [activeTab, setActiveTab] = useState('antigravity');
  const [isScanning, setIsScanning] = useState(false);
  const [accountsByTool, setAccountsByTool] = useState({ antigravity: [], codex: [], claudecode: [] });
  const [selectedAccounts, setSelectedAccounts] = useState({ antigravity: null, codex: null, claudecode: null });
  const [usageData, setUsageData] = useState({ antigravity: null, codex: null, claude: null });
  const [historyData, setHistoryData] = useState([]);
  const [weeklyTrendData, setWeeklyTrendData] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Last known active (currently logged-in) account per tool, so a stale chip
  // selection never hides a newly switched login's fresh data.
  const activeAccountsRef = useRef({ antigravity: null, codex: null, claudecode: null });
  // App-styled confirmation dialog state; resolves to a boolean when answered.
  const [confirmBox, setConfirmBox] = useState(null);
  const confirmResolveRef = useRef(null);

  const fetchUsageData = useCallback(async () => {
    if (window.electronAPI) {
      const [agAccounts, codexAccounts, claudeAccounts] = await Promise.all([
        window.electronAPI.getAccountsByTool('antigravity'),
        window.electronAPI.getAccountsByTool('codex'),
        window.electronAPI.getAccountsByTool('claudecode'),
      ]);
      setAccountsByTool({ antigravity: agAccounts || [], codex: codexAccounts || [], claudecode: claudeAccounts || [] });

      const isToolTab = TOOL_TABS.includes(activeTab);
      const currentToolKey = isToolTab ? activeTab : 'antigravity';
      const toolAccounts = currentToolKey === 'antigravity' ? agAccounts : currentToolKey === 'codex' ? codexAccounts : claudeAccounts;
      const activeAcc = toolAccounts.find((account) => account.active === 1) || toolAccounts[0];
      const activeEmail = activeAcc?.email || null;
      let selectedEmail = selectedAccounts[currentToolKey] || activeEmail;
      if (activeAccountsRef.current[currentToolKey] && activeAccountsRef.current[currentToolKey] !== activeEmail) {
        // The logged-in account changed (e.g. switched CLI login); follow it
        // instead of keeping a stale chip selection from the old account.
        selectedEmail = activeEmail;
        setSelectedAccounts((previous) => ({ ...previous, [currentToolKey]: activeEmail }));
      }
      activeAccountsRef.current = { ...activeAccountsRef.current, [currentToolKey]: activeEmail };

      const [agSnapshot, codexSnapshot, claudeSnapshot] = await Promise.all([
        window.electronAPI.getSnapshotByAccount('antigravity', activeTab === 'antigravity' ? selectedEmail : selectedAccounts.antigravity),
        window.electronAPI.getSnapshotByAccount('codex', activeTab === 'codex' ? selectedEmail : selectedAccounts.codex),
        window.electronAPI.getSnapshotByAccount('claudecode', activeTab === 'claudecode' ? selectedEmail : selectedAccounts.claudecode),
      ]);
      setUsageData({ antigravity: agSnapshot, codex: codexSnapshot, claude: claudeSnapshot });

      if (isToolTab) {
        const [history, weeklyTrend] = await Promise.all([
          window.electronAPI.getUsageHistoryByAccount(currentToolKey, selectedEmail, 15),
          window.electronAPI.getWeeklyUsageTrendByAccount(currentToolKey, selectedEmail, 7),
        ]);
        setHistoryData(history || []);
        setWeeklyTrendData(weeklyTrend || []);
      } else {
        setHistoryData([]);
        setWeeklyTrendData([]);
      }
      return;
    }

    const now = new Date();
    setAccountsByTool({
      antigravity: [{ email: 'account@example.com', active: 1 }],
      codex: [{ email: 'codex@example.com', active: 1 }],
      claudecode: [{ email: 'claude@example.com', active: 1 }],
    });
    setUsageData({
      antigravity: {
        tool: 'antigravity', account_email: 'account@example.com', rolling_5h_percent: 42.5,
        next_5h_reset_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        weekly_usage_percent: 71,
        weekly_reset_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        timestamp: now.toISOString(),
      },
      codex: null,
      claude: null,
    });
  }, [activeTab, selectedAccounts]);

  const handleSelectAccount = (email) => {
    if (TOOL_TABS.includes(activeTab)) setSelectedAccounts((previous) => ({ ...previous, [activeTab]: email }));
  };

  const requestConfirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmBox(options);
      }),
    []
  );

  const answerConfirm = useCallback((accepted) => {
    setConfirmBox(null);
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    if (typeof resolve === 'function') resolve(Boolean(accepted));
  }, []);

  const handleDeleteAccount = async (email) => {
    if (!TOOL_TABS.includes(activeTab) || !window.electronAPI?.deleteAccount) return;
    const account = accountsByTool[activeTab]?.find((item) => item.email === email);
    if (!account || account.active === 1) return; // aktif oturum silinemez
    const confirmed = await requestConfirm({
      title: 'Hesap verisini sil',
      message: `"${email}" hesabının kayıtlı verisi silinsin mi? Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!confirmed) return;
    const deleted = await window.electronAPI.deleteAccount(activeTab, email);
    if (deleted) {
      setSelectedAccounts((previous) =>
        previous[activeTab] === email ? { ...previous, [activeTab]: null } : previous
      );
      await fetchUsageData();
    }
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      if (window.electronAPI) await window.electronAPI.scanUsage();
      await fetchUsageData();
    } finally {
      setTimeout(() => setIsScanning(false), 500);
    }
  };

  useEffect(() => {
    fetchUsageData();
    const unsubscribe = window.electronAPI?.onUsageUpdated?.(() => fetchUsageData());
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [fetchUsageData]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentData = activeTab === 'antigravity' ? usageData.antigravity : activeTab === 'codex' ? usageData.codex : activeTab === 'claudecode' ? usageData.claude : null;
  const currentToolTitle = activeTab === 'antigravity' ? 'Antigravity CLI' : activeTab === 'codex' ? 'Codex CLI' : activeTab === 'claudecode' ? 'Claude Code' : 'Genel Özet';
  const currentAccounts = accountsByTool[activeTab] || [];
  const selectedEmail = selectedAccounts[activeTab] || currentData?.account_email || currentAccounts[0]?.email;
  const windowState = getQuotaWindowState(currentData, nowMs);
  const primaryWindow = windowState.primary;
  const primaryPercent = primaryWindow?.percent ?? null;
  const primaryLabel = primaryWindow
    ? `${currentToolTitle} ${getWindowLabel(primaryWindow.kind)} Limit`
    : `${currentToolTitle} Kota Limiti`;
  const primaryResetTitle = primaryWindow
    ? `${getWindowLabel(primaryWindow.kind)} Kota Sıfırlaması`
    : 'Kota Sıfırlaması';
  const emptyHint = activeTab === 'antigravity'
    ? 'Antigravity CLI veya IDE açıkken yenile. AtrisTracker quota servisinden doğrudan okur; statusline/telemetry kurulumu gerekmez.'
    : activeTab === 'codex'
    ? 'Codex CLI güncel ve giriş yapılmış olmalı. AtrisTracker resmi app-server rate limit API’sini kullanır.'
    : 'Claude Code OAuth oturumunun aktif olduğundan emin ol. AtrisTracker usage endpoint’ini doğrudan sorgular; statusline kullanmaz.';

  return (
    <div className="w-full h-screen bg-slate-950/85 text-slate-100 flex flex-col border border-white/10 rounded-xl overflow-hidden glass-panel shadow-2xl">
      <Header onRefresh={handleManualScan} isScanning={isScanning} onOpenSettings={() => setActiveTab('settings')} settingsActive={activeTab === 'settings'} />
      <NavigationTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 custom-scrollbar">
        {activeTab === 'settings' ? <SettingsView /> : activeTab === 'overview' ? <OverviewView usageData={usageData} nowMs={nowMs} /> : (
          <>
            <AccountSelector accounts={currentAccounts} selectedAccountEmail={selectedEmail} onSelectAccount={handleSelectAccount} onDeleteAccount={handleDeleteAccount} lastSync={currentData?.timestamp} />
            {currentData ? (
              <>
                <RadialProgress percentage={primaryPercent} label={primaryLabel} status={primaryWindow?.status} />
                <CountdownTimer
                  resetTimeISO={primaryWindow?.resetAtISO}
                  title={primaryResetTitle}
                  windowSeconds={primaryWindow?.durationSeconds}
                  status={primaryWindow?.status}
                />
                {windowState.weekly.available && (
                  <WeeklyTimeline windowState={windowState.weekly} />
                )}
                <HistoryChart historyData={historyData} windowKind={primaryWindow?.kind} />
                {windowState.weekly.available && primaryWindow?.kind !== WEEKLY_KIND && (
                  <HistoryChart historyData={weeklyTrendData} windowKind={WEEKLY_KIND} timeFormat="date" />
                )}
              </>
            ) : (
              <div className="p-3 bg-slate-900/50 rounded-xl border border-dashed border-white/10 flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-950/30 border border-amber-500/20 shrink-0"><CircleAlert className="w-3.5 h-3.5 text-amber-300" /></div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200">{currentAccounts.length ? 'Hesap bulundu, quota verisi bekleniyor' : 'Henüz hesap bulunamadı'}</div>
                  <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">{emptyHint}</p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <ConfirmDialog
        open={Boolean(confirmBox)}
        title={confirmBox?.title}
        message={confirmBox?.message}
        confirmLabel={confirmBox?.confirmLabel}
        cancelLabel={confirmBox?.cancelLabel}
        danger={confirmBox?.danger}
        onConfirm={() => answerConfirm(true)}
        onCancel={() => answerConfirm(false)}
      />
    </div>
  );
}
