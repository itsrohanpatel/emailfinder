import React, { useState } from 'react';
import { AppProvider, useAppStore } from './Store';
import { CsvUpload } from './components/CsvUpload';
import { SingleEmailFinder } from './components/SingleEmailFinder';
import { KeyManager } from './components/KeyManager';
import { Controls } from './components/Controls';
import { ResultsTable } from './components/ResultsTable';
import { SettingsPanel } from './components/Settings';

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
  const { isProcessing, isPaused, contacts, estimatedRemainingSec } = useAppStore();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const engineStatus = isProcessing ? 'ACTIVE' : isPaused ? 'PAUSED' : 'IDLE';

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 bg-[#0f172a] text-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-lg italic shadow-sm">
            V
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            VeriFlow <span className="text-blue-400">Verifier</span>
          </h1>
          <div className="ml-2 px-2 py-0.5 bg-slate-800 rounded text-[10px] uppercase font-mono tracking-widest text-slate-400 border border-slate-700">
            v1.3.1-production
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'single'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>🔍</span> Single Finder
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bulk'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>📂</span> Bulk CSV ({contacts.length})
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
            <div
              className={`w-2 h-2 rounded-full ${
                isProcessing
                  ? 'bg-emerald-400 animate-pulse'
                  : isPaused
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
              }`}
            ></div>
            <span className="text-xs font-mono text-slate-300">ENGINE: {engineStatus}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 flex flex-col gap-6">
            <KeyManager />
            <SettingsPanel />
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {activeTab === 'single' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <SingleEmailFinder />
              {contacts.length > 0 && (
                <div className="max-w-3xl mx-auto w-full mt-8 pt-6 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Bulk Queue ({contacts.length} contacts)
                    </h4>
                    <button
                      onClick={() => setActiveTab('bulk')}
                      className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                    >
                      Open Bulk View →
                    </button>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs h-72 flex flex-col">
                    <ResultsTable />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50/50 shrink-0">
                {contacts.length === 0 ? <CsvUpload /> : <Controls />}
              </div>
              <div className="flex-1 overflow-hidden bg-white flex flex-col">
                <ResultsTable />
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="px-6 py-2 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex gap-4 text-[10px] font-mono text-slate-400">
          <span>MODE: {activeTab.toUpperCase()}</span>
          <span>
            ESTIMATED_REMAINING:{' '}
            <span className="text-slate-600 font-bold">
              {formatRemainingTime(estimatedRemainingSec, isProcessing)}
            </span>
          </span>
          <span>STORAGE: LOCALSTORAGE + IN-MEMORY</span>
        </div>
        <div className="text-[10px] text-slate-500">
          Client-Side SPA • Powered by Apify Actor{' '}
          <span className="text-slate-800 font-semibold">j4YDbwiXnPFzYeF5w</span>
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
