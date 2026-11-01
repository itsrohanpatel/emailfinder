import React from 'react';
import { useAppStore } from '../Store';
import { PermutationMode } from '../utils/permutation';
import { Sliders, ShieldCheck, Cpu, Database, RotateCcw, Cloud, Key, Check } from 'lucide-react';

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
      <div className="flex items-center gap-1.5 mb-3">
        <Sliders className="w-3.5 h-3.5 text-slate-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Engine & Cost Controls
        </h2>
      </div>

      <div className="space-y-4">
        {/* Permutation Strategy */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Permutation Strategy
          </label>
          <select
            value={settings.patternMode}
            disabled={isProcessing}
            onChange={e =>
              setSettings(s => ({ ...s, patternMode: e.target.value as PermutationMode }))
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
          >
            <option value="near_full">Near-Full: Top 8 (98.9% Coverage, 85% Savings)</option>
            <option value="lean">Lean: Top 4 (86.7% Coverage, Fastest)</option>
            <option value="exhaustive">Exhaustive: All 14 Patterns</option>
          </select>
          <span className="text-[11px] text-slate-400 mt-1.5 block leading-tight">
            Near-Full discovers 98.9% of emails with sequential early stop.
          </span>
        </div>

        {/* DNS MX Pre-Check Toggle */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Free DNS MX Pre-Check</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
              Bails out on dead domains via free Google DoH ($0 cost)
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() =>
              setSettings(s => ({ ...s, enableDnsPreCheck: !s.enableDnsPreCheck }))
            }
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer shrink-0 ml-1 ${
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

        {/* Concurrency Slider */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span>Parallel Workers</span>
            </label>
            <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60 tabular-nums">
              {settings.concurrency} {settings.concurrency === 1 ? 'thread' : 'threads'}
            </span>
          </div>
          <input
            type="range"
            className="w-full accent-blue-600 cursor-pointer"
            value={Math.min(5, settings.concurrency)}
            min="1"
            max="5"
            disabled={isProcessing}
            onChange={e =>
              setSettings(s => ({
                ...s,
                concurrency: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)),
              }))
            }
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
            <span>1 worker</span>
            <span>3 (optimum)</span>
            <span>5 max (Apify cap)</span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[1, 3, 5].map(cnt => (
              <button
                key={cnt}
                type="button"
                disabled={isProcessing}
                onClick={() => setSettings(s => ({ ...s, concurrency: cnt }))}
                className={`flex-1 py-1 rounded-md text-[10px] font-mono font-medium border transition-all cursor-pointer ${
                  settings.concurrency === cnt
                    ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cnt} {cnt === 3 ? '★ Recommended' : cnt === 5 ? 'Max Cap' : 'Thread'}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-400 mt-1.5 block leading-tight">
            Apify enforces a 5 concurrent run cap. 3 threads prevents 429 rate limits and runs with zero stalls.
          </span>
        </div>

        {/* Worker Delay */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <label className="block text-xs font-semibold text-slate-800 mb-1">
            Worker Delay (ms)
          </label>
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
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
          />
          <span className="text-[10px] text-slate-400 mt-1 block">
            Pause between consecutive calls per worker.
          </span>
        </div>

        {/* Re-verify Existing */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-800">Re-verify existing</div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
              Re-checks rows that already contain an email
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setSettings(s => ({ ...s, reverifyAll: !s.reverifyAll }))}
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer shrink-0 ml-1 ${
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
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-800 font-semibold flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>Domain Cache</span>
            </span>
            <span className="font-mono text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60 text-[10px] tabular-nums">
              {learnedDomainsCount} domains
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Corporate email patterns are cached locally to test future coworkers on Call #1 (94% savings).
          </div>
          {learnedDomainsCount > 0 && !isProcessing && (
            <button
              onClick={clearDomainCache}
              className="text-[11px] text-slate-500 hover:text-rose-600 font-medium transition-colors flex items-center gap-1 cursor-pointer pt-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Domain Cache</span>
            </button>
          )}
        </div>

        {/* GitHub Cloud Runner Configuration */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-800 font-semibold flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 text-indigo-600" />
              <span>GitHub Cloud Runner</span>
            </span>
            <span
              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase ${
                settings.githubToken && settings.githubRepo
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {settings.githubToken && settings.githubRepo ? 'Connected' : 'Optional'}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 mb-2.5 leading-tight">
            Offload long-running verification jobs to GitHub Actions cloud runners with gigabit connection.
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-mono text-slate-500 mb-1">GitHub Repo (owner/repo)</label>
              <input
                type="text"
                placeholder="itsrohanpatel/emailfinder"
                value={settings.githubRepo || ''}
                disabled={isProcessing}
                onChange={e => {
                  const cleaned = e.target.value.trim()
                    .replace(/^https?:\/\/github\.com\//i, '')
                    .replace(/^git@github\.com:/i, '')
                    .replace(/\.git$/i, '')
                    .replace(/^\/+|\/+$/g, '');
                  setSettings(s => ({ ...s, githubRepo: cleaned }));
                }}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-500 mb-1">GitHub Token (PAT with repo access)</label>
              <input
                type="password"
                placeholder="ghp_••••••••••••••••••••••••••••••••"
                value={settings.githubToken || ''}
                disabled={isProcessing}
                onChange={e => setSettings(s => ({ ...s, githubToken: e.target.value.trim() }))}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
