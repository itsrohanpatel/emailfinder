import React from 'react';
import { useAppStore } from '../Store';
import { PermutationMode } from '../utils/permutation';

export function SettingsPanel() {
  const {
    settings,
    setSettings,
    isProcessing,
    learnedDomainsCount,
    clearDomainCache,
  } = useAppStore();

  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        Engine & Cost Settings
      </h2>
      <div className="space-y-4">
        {/* Permutation Mode */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Permutation Strategy
          </label>
          <select
            value={settings.patternMode}
            disabled={isProcessing}
            onChange={e =>
              setSettings(s => ({ ...s, patternMode: e.target.value as PermutationMode }))
            }
            className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500 shadow-xs cursor-pointer"
          >
            <option value="near_full">Near-Full: Top 8 (98.9% Hit Rate, 85% Cost Saved)</option>
            <option value="lean">Lean: Top 4 (86.7% Hit Rate, Fastest)</option>
            <option value="exhaustive">Exhaustive: All 14 Patterns</option>
          </select>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Near-Full finds 98.9% of emails with sequential early stop.
          </span>
        </div>

        {/* DNS MX Pre-Check Toggle */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <div className="text-xs text-slate-700 font-medium">Free DNS MX Pre-Check</div>
            <div className="text-[10px] text-slate-400">
              Skips dead domains via free DoH (saves $0.00 on invalid domains)
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() =>
              setSettings(s => ({ ...s, enableDnsPreCheck: !s.enableDnsPreCheck }))
            }
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer shrink-0 ml-2 ${
              settings.enableDnsPreCheck ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-xs transition-transform ${
                settings.enableDnsPreCheck ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            ></div>
          </button>
        </div>

        {/* Concurrency */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-slate-700">Concurrency (Workers)</label>
            <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
              {settings.concurrency}
            </span>
          </div>
          <input
            type="range"
            className="w-full accent-blue-600"
            value={settings.concurrency}
            min="1"
            max="15"
            disabled={isProcessing}
            onChange={e =>
              setSettings(s => ({
                ...s,
                concurrency: Math.min(15, Math.max(1, parseInt(e.target.value) || 1)),
              }))
            }
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>1 worker</span>
            <span>15 max parallel</span>
          </div>
        </div>

        {/* Delay */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-700">Worker Delay (ms)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={settings.delayMs}
            disabled={isProcessing}
            onChange={e =>
              setSettings(s => ({
                ...s,
                delayMs: Math.max(0, parseInt(e.target.value) || 0),
              }))
            }
            className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>

        {/* Re-verify Existing */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <div className="text-xs text-slate-700 font-medium">Re-verify existing</div>
            <div className="text-[10px] text-slate-400">Re-checks rows with existing emails</div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setSettings(s => ({ ...s, reverifyAll: !s.reverifyAll }))}
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer shrink-0 ml-2 ${
              settings.reverifyAll ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-xs transition-transform ${
                settings.reverifyAll ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            ></div>
          </button>
        </div>

        {/* Domain Pattern Memory Status */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-600 font-medium">Domain Memory Cache</span>
            <span className="font-mono text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
              {learnedDomainsCount} companies
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mb-2">
            Learned company email formats are saved to test next employees on Call 1.
          </div>
          {learnedDomainsCount > 0 && !isProcessing && (
            <button
              onClick={() => {
                if (window.confirm('Clear all learned company email patterns?')) {
                  clearDomainCache();
                }
              }}
              className="text-[10px] text-slate-500 hover:text-red-600 font-semibold uppercase tracking-wider underline cursor-pointer"
            >
              Reset Domain Patterns
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
