import React from 'react';
import { useAppStore } from '../Store';

export function SettingsPanel() {
  const { settings, setSettings, isProcessing } = useAppStore();

  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        Engine Settings
      </h2>
      <div className="space-y-4">
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
            max="10"
            disabled={isProcessing}
            onChange={e =>
              setSettings(s => ({
                ...s,
                concurrency: Math.min(10, Math.max(1, parseInt(e.target.value) || 1)),
              }))
            }
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>1 worker</span>
            <span>10 max</span>
          </div>
        </div>

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
          <span className="text-[10px] text-slate-400">Delay between worker requests to prevent rate limiting</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            <div className="text-xs text-slate-700 font-medium">Re-verify existing emails</div>
            <div className="text-[10px] text-slate-400">Re-checks rows that already contain an email on CSV import</div>
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
      </div>
    </section>
  );
}
