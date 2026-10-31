import React, { useState, useEffect } from 'react';
import { AppProvider, useAppStore } from './Store';
import { CsvUpload } from './components/CsvUpload';
import { SingleEmailFinder } from './components/SingleEmailFinder';
import { KeyManager } from './components/KeyManager';
import { Controls } from './components/Controls';
import { ResultsTable } from './components/ResultsTable';
import { SettingsPanel } from './components/Settings';
import { ToastContainer } from './components/Toast';
import { Zap, Search, FileSpreadsheet, ShieldCheck, Cpu } from 'lucide-react';

function formatRemainingTime(seconds: number | null, isProcessing: boolean): string {
  if (!isProcessing) return '--m --s';
  if (seconds === null) return 'CALCULATING...';
  if (seconds <= 0) return 'FINISHING...';

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function AppContent() {
  const { isProcessing, isPaused, contacts, estimatedRemainingSec, toasts, dismissToast, settings } =
    useAppStore();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>(() => {
    try {
      const saved = localStorage.getItem('veriflow_active_tab_v1');
      if (saved === 'single' || saved === 'bulk') return saved;
    } catch (e) {
      // ignore
    }
    return contacts.length > 0 ? 'bulk' : 'single';
  });

  useEffect(() => {
    try {
      localStorage.setItem('veriflow_active_tab_v1', activeTab);
    } catch (e) {
      // ignore
    }
  }, [activeTab]);
  const engineStatus = isProcessing ? 'PROCESSING' : isPaused ? 'PAUSED' : 'READY';

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-hidden">
      {/* Toast Notification Layer */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* SaaS Obsidian Glass Header */}
      <header className="flex items-center justify-between px-6 py-2.5 bg-[#090d16] text-white shrink-0 border-b border-slate-800/80 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 p-[1px] shadow-sm flex items-center justify-center">
            <div className="w-full h-full bg-[#090d16] rounded-[7px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                VeriFlow
                <span className="text-[11px] font-normal text-slate-400">| Email Engine</span>
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                PROD
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] ${
              activeTab === 'single'
                ? 'bg-blue-600 text-white shadow-xs font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Single Finder</span>
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] ${
              activeTab === 'bulk'
                ? 'bg-blue-600 text-white shadow-xs font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Bulk CSV</span>
            {contacts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300">
                {contacts.length}
              </span>
            )}
          </button>
        </div>

        {/* Engine Status Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              {isProcessing && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isProcessing
                    ? 'bg-emerald-500'
                    : isPaused
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              ></span>
            </span>
            <span
              className={
                isProcessing
                  ? 'text-emerald-400 font-semibold'
                  : isPaused
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }
            >
              {engineStatus}
            </span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Control Sidebar */}
        <aside className="w-76 bg-slate-50/90 border-r border-slate-200/90 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 flex flex-col gap-6">
            <KeyManager />
            <SettingsPanel />
          </div>
        </aside>

        {/* Main Workspace Body */}
        <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {activeTab === 'single' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
              <SingleEmailFinder />
              {contacts.length > 0 && (
                <div className="max-w-3xl mx-auto w-full mt-8 pt-6 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                      Bulk Queue ({contacts.length} loaded)
                    </h4>
                    <button
                      onClick={() => setActiveTab('bulk')}
                      className="text-xs text-blue-600 font-semibold hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      Open Full Bulk View →
                    </button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs h-72 flex flex-col">
                    <ResultsTable />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-6 border-b border-slate-200/80 bg-slate-50/40 shrink-0">
                {contacts.length === 0 ? <CsvUpload /> : <Controls />}
              </div>
              <div className="flex-1 overflow-hidden bg-white flex flex-col">
                <ResultsTable />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Global Status Footer */}
      <footer className="px-6 py-2 bg-slate-50 border-t border-slate-200/80 flex justify-between items-center shrink-0">
        <div className="flex gap-4 text-[11px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-slate-400" />
            WORKERS: <b className="text-slate-700">{settings.concurrency}</b>
          </span>
          <span>
            ETA:{' '}
            <b className="text-slate-700 tabular-nums">
              {formatRemainingTime(estimatedRemainingSec, isProcessing)}
            </b>
          </span>
          <span>
            STRATEGY: <b className="text-slate-700 uppercase">{settings.patternMode.replace('_', '-')}</b>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Client-Side Sandbox • Zero Server Relay</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
