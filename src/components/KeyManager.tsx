import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../Store';
import { checkApiKey } from '../utils/apify';
import { ApiKey } from '../types';

export function KeyManager() {
  const { apiKeys, setApiKeys } = useAppStore();
  const [newKeys, setNewKeys] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [showAdd, setShowAdd] = useState(apiKeys.length === 0);

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
  };

  const removeKey = (token: string) => {
    setApiKeys(prev => prev.filter(k => k.token !== token));
  };

  const clearAllKeys = () => {
    if (window.confirm('Remove all API keys from browser storage?')) {
      setApiKeys([]);
    }
  };

  const activeCount = apiKeys.filter(k => k.status === 'active' || k.status === 'unchecked').length;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          API Key Rotation
        </h2>
        <div className="flex items-center gap-2">
          {apiKeys.length > 0 && (
            <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {activeCount} ACTIVE
            </span>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-blue-600 font-semibold hover:underline"
          >
            {showAdd ? 'CANCEL' : '+ ADD KEY'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {showAdd && (
          <div className="mb-4 bg-white p-2.5 rounded border border-blue-200 shadow-sm">
            <textarea
              value={newKeys}
              onChange={e => setNewKeys(e.target.value)}
              placeholder="Paste Apify API tokens (one per line)..."
              className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:border-blue-500 min-h-[60px]"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddKeys}
                className="flex-1 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider py-1.5 rounded hover:bg-black"
              >
                Save Keys
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 border border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {apiKeys.length === 0 && !showAdd && (
          <div className="text-xs text-slate-400 italic bg-white p-3 rounded border border-dashed border-slate-200 text-center">
            No keys saved. Click <b>+ ADD KEY</b> to add your Apify token.
          </div>
        )}

        {apiKeys.map(key => {
          const isExhausted = key.status === 'exhausted' || key.status === 'invalid';
          const masked =
            key.token.length > 8
              ? `apify_...${key.token.slice(-4)}`
              : `key_...${key.token.slice(-2)}`;

          return (
            <div
              key={key.token}
              className={`p-2.5 border rounded shadow-sm transition-opacity ${
                isExhausted
                  ? 'bg-slate-100 border-slate-200 grayscale opacity-60'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex justify-between items-center text-xs mb-1 font-mono">
                <span className="text-slate-600 font-medium">{masked}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ${
                      key.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : key.status === 'invalid'
                        ? 'bg-red-100 text-red-700'
                        : key.status === 'exhausted'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {key.status}
                  </span>
                  <button
                    onClick={() => removeKey(key.token)}
                    title="Remove key"
                    className="text-slate-400 hover:text-red-500 text-xs px-1"
                  >
                    ×
                  </button>
                </div>
              </div>

              {key.label && (
                <div className="text-[10px] text-slate-400 truncate">{key.label}</div>
              )}
            </div>
          );
        })}

        {apiKeys.length > 0 && !isChecking && (
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={checkAllKeys}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold uppercase tracking-wider"
            >
              Refresh Status
            </button>
            <button
              onClick={clearAllKeys}
              className="text-[10px] text-red-500 hover:text-red-700 font-semibold uppercase tracking-wider"
            >
              Clear All
            </button>
          </div>
        )}

        {isChecking && (
          <div className="w-full mt-2 text-center text-[10px] text-slate-400 uppercase tracking-wider animate-pulse">
            Checking token status...
          </div>
        )}
      </div>
    </section>
  );
}
