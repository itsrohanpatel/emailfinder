import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../Store';
import { checkApiKey } from '../utils/apify';
import { ApiKey } from '../types';
import { Key, Plus, RefreshCw, Eye, EyeOff, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export function KeyManager() {
  const { apiKeys, setApiKeys, showToast } = useAppStore();
  const [newKeys, setNewKeys] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [showAdd, setShowAdd] = useState(apiKeys.length === 0);
  const [showTokens, setShowTokens] = useState(false);

  const checkKeys = useCallback(
    async (keysToCheck: ApiKey[]) => {
      setIsChecking(true);
      for (const key of keysToCheck) {
        const result = await checkApiKey(key.token);
        setApiKeys(prev =>
          prev.map(k => {
            if (k.token === key.token) {
              if (result.success) {
                return {
                  ...k,
                  creditsRemaining: result.creditsRemaining ?? null,
                  label: result.planName ? `Apify (${result.planName})` : k.label,
                  status: result.exhausted ? 'exhausted' : 'active',
                  lastCheckedAt: Date.now(),
                };
              } else {
                return {
                  ...k,
                  status: 'invalid',
                  creditsRemaining: 0,
                  lastCheckedAt: Date.now(),
                };
              }
            }
            return k;
          })
        );
      }
      setIsChecking(false);
    },
    [setApiKeys]
  );

  const checkAllKeys = () => checkKeys(apiKeys);

  // Automatically check newly added (unchecked) keys
  useEffect(() => {
    const uncheckedKeys = apiKeys.filter(k => k.status === 'unchecked');
    if (uncheckedKeys.length > 0 && !isChecking) {
      checkKeys(uncheckedKeys);
    }
  }, [apiKeys, isChecking, checkKeys]);

  const handleAddKeys = () => {
    const rawTokens: string[] = newKeys
      .split('\n')
      .map(t => t.trim())
      .filter((t): t is string => Boolean(t));

    const uniqueTokens: string[] = Array.from(new Set(rawTokens));

    if (uniqueTokens.length === 0) {
      setShowAdd(false);
      return;
    }

    const newEntries: ApiKey[] = uniqueTokens.map(token => ({
      token,
      label: 'Apify Key',
      creditsRemaining: null,
      status: 'unchecked',
    }));

    setApiKeys(prev => {
      const existingTokens = new Set(prev.map(k => k.token));
      const added = newEntries.filter(e => !existingTokens.has(e.token));
      return [...prev, ...added];
    });

    setNewKeys('');
    setShowAdd(false);

    showToast({
      type: 'success',
      title: 'API Keys Added',
      description: `${uniqueTokens.length} token(s) configured for automatic rotation.`,
    });
  };

  const removeKey = (token: string) => {
    setApiKeys(prev => prev.filter(k => k.token !== token));
    showToast({
      type: 'info',
      title: 'Key Removed',
      description: 'The selected API key was removed from browser storage.',
    });
  };

  const clearAllKeys = () => {
    setApiKeys([]);
    showToast({
      type: 'info',
      title: 'All Keys Cleared',
      description: 'All Apify API keys were removed.',
    });
  };

  const activeCount = apiKeys.filter(k => k.status === 'active' || k.status === 'unchecked').length;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-slate-400" />
          <span>Apify Key Rotation</span>
        </h2>
        <div className="flex items-center gap-1.5">
          {apiKeys.length > 0 && (
            <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {activeCount} READY
            </span>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[11px] text-blue-600 font-semibold hover:text-blue-700 cursor-pointer flex items-center gap-0.5 active:scale-[0.98]"
          >
            <Plus className="w-3 h-3" />
            <span>{showAdd ? 'Close' : 'Add'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {showAdd && (
          <div className="mb-3 bg-white p-3 rounded-xl border border-blue-200 shadow-sm animate-in fade-in">
            <textarea
              value={newKeys}
              onChange={e => setNewKeys(e.target.value)}
              placeholder="Paste Apify API tokens (one per line)..."
              className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 min-h-[65px] transition-all"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddKeys}
                className="flex-1 bg-slate-900 hover:bg-black text-white text-xs font-semibold py-1.5 rounded-lg transition-colors cursor-pointer active:scale-[0.98]"
              >
                Save Tokens
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 border border-slate-200 text-slate-600 text-xs font-medium py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {apiKeys.length === 0 && !showAdd && (
          <div className="text-xs text-slate-500 bg-white p-3.5 rounded-xl border border-dashed border-slate-300 text-center shadow-2xs">
            <p className="font-medium text-slate-700">No API Keys Connected</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Add your Apify personal token to start verifying emails at $0.89/1k.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2.5 inline-flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Connect Apify Token</span>
            </button>
          </div>
        )}

        {apiKeys.map(key => {
          const isExhausted = key.status === 'exhausted' || key.status === 'invalid';
          const displayedToken = showTokens
            ? key.token
            : key.token.length > 8
            ? `apify_api_...${key.token.slice(-4)}`
            : `••••••••`;

          return (
            <div
              key={key.token}
              className={`p-3 border rounded-xl shadow-2xs transition-all ${
                isExhausted
                  ? 'bg-slate-100/70 border-slate-200 grayscale opacity-75'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex justify-between items-center text-xs mb-1 font-mono">
                <span className="text-slate-700 font-medium truncate max-w-[150px]">
                  {displayedToken}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[9px] uppercase px-2 py-0.5 rounded-full font-bold tracking-wider ${
                      key.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : key.status === 'invalid'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : key.status === 'exhausted'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {key.status}
                  </span>
                  <button
                    onClick={() => removeKey(key.token)}
                    title="Remove key"
                    className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate">{key.label || 'Apify Token'}</span>
                {key.creditsRemaining !== null && (
                  <span className="font-mono text-slate-500 font-medium">
                    ${key.creditsRemaining.toFixed(2)} USD
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {apiKeys.length > 0 && !isChecking && (
          <div className="flex justify-between items-center pt-1.5 text-xs">
            <button
              onClick={() => setShowTokens(!showTokens)}
              className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              {showTokens ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showTokens ? 'Mask' : 'Reveal'}</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={checkAllKeys}
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
              <button
                onClick={clearAllKeys}
                className="text-slate-400 hover:text-rose-600 font-medium transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {isChecking && (
          <div className="w-full mt-2 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-medium animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Checking Apify balance...</span>
          </div>
        )}
      </div>
    </section>
  );
}
