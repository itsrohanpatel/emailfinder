import React, { useState } from 'react';
import { useAppStore } from '../Store';
import { generatePermutations } from '../utils/permutation';
import { verifyEmails } from '../utils/apify';
import { Contact } from '../types';

export function SingleEmailFinder() {
  const { apiKeys, setContacts, setApiKeys, contacts } = useAppStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [website, setWebsite] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{
    status: 'idle' | 'found' | 'not_found' | 'error';
    email?: string;
    error?: string;
    permutationsTested?: string[];
  }>({ status: 'idle' });

  const [copied, setCopied] = useState(false);

  const activeKey = apiKeys.find(k => k.status === 'active' || k.status === 'unchecked');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName && !lastName && !emailInput) {
      alert('Please enter a name or an email address.');
      return;
    }

    if (!website && !emailInput?.includes('@')) {
      alert('Please enter a corporate website/domain or an email address.');
      return;
    }

    if (!activeKey) {
      alert('No active Apify API keys found! Please add an API key in the sidebar.');
      return;
    }

    setIsSearching(true);
    setResult({ status: 'idle' });

    const perms = generatePermutations(firstName, lastName, website, emailInput);

    if (perms.length === 0) {
      setIsSearching(false);
      setResult({
        status: 'error',
        error: 'Could not generate valid email permutations from the provided input.',
      });
      return;
    }

    try {
      // Allow trying active keys in order
      const availableKeys = apiKeys.filter(k => k.status === 'active' || k.status === 'unchecked');
      let searchSuccess = false;

      for (const key of availableKeys) {
        const res = await verifyEmails(key.token, perms);

        if (res.isExhausted) {
          setApiKeys(prev =>
            prev.map(k =>
              k.token === key.token ? { ...k, status: 'exhausted', creditsRemaining: 0 } : k
            )
          );
          continue; // Try next key
        }

        if (res.isRateLimit) {
          continue; // Try next key
        }

        if (!res.success) {
          setResult({
            status: 'error',
            error: res.error || 'Verification failed.',
            permutationsTested: perms,
          });
          searchSuccess = true;
          break;
        }

        if (res.validEmail) {
          setResult({
            status: 'found',
            email: res.validEmail,
            permutationsTested: perms,
          });
        } else {
          setResult({
            status: 'not_found',
            permutationsTested: perms,
          });
        }
        searchSuccess = true;
        break;
      }

      if (!searchSuccess) {
        setResult({
          status: 'error',
          error: 'All available API keys are exhausted or rate limited. Please check your tokens.',
          permutationsTested: perms,
        });
      }
    } catch (err: any) {
      setResult({
        status: 'error',
        error: err.message || 'An unexpected network error occurred.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddToList = () => {
    let fn = firstName.trim();
    let ln = lastName.trim();

    if (fn && !ln && fn.includes(' ')) {
      const parts = fn.split(/\s+/);
      fn = parts[0];
      ln = parts.slice(1).join(' ');
    }

    // Safe ID generation without Math.max call stack overflow
    const maxId = contacts.reduce((max, c) => (c.id > max ? c.id : max), 0);
    const nextId = maxId + 1;

    const newContact: Contact = {
      id: nextId,
      firstName: fn,
      lastName: ln,
      website: website.trim(),
      email: result.email || emailInput.trim(),
      status:
        result.status === 'found'
          ? 'found'
          : result.status === 'not_found'
          ? 'not_found'
          : 'pending',
      testedPermutations: result.permutationsTested,
      originalData: {
        'First Name': fn,
        'Last Name': ln,
        Website: website,
        Email: result.email || emailInput,
      },
    };

    setContacts(prev => [...prev, newContact]);
    alert(`Added ${fn || 'Contact'} ${ln} to bulk queue!`);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Single Email Finder & Verifier
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Find or verify corporate email addresses using name-and-domain permutations
          </p>
        </div>
        {activeKey && (
          <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
            Apify Key Ready
          </span>
        )}
      </div>

      <form onSubmit={handleSearch} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              First Name
            </label>
            <input
              type="text"
              placeholder="e.g. Satya"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Last Name
            </label>
            <input
              type="text"
              placeholder="e.g. Nadella"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Website / Domain
            </label>
            <input
              type="text"
              placeholder="e.g. microsoft.com"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Or Direct Email to Verify (Optional)
          </label>
          <input
            type="email"
            placeholder="e.g. satya@microsoft.com"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSearching}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-2"
          >
            {isSearching ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>VERIFYING PERMUTATIONS...</span>
              </>
            ) : (
              <span>FIND & VERIFY EMAIL</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleAddToList}
            disabled={!firstName && !lastName && !emailInput}
            className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-semibold py-2.5 px-4 rounded transition-colors border border-slate-200"
          >
            + Add to Bulk Queue
          </button>
        </div>
      </form>

      {/* Result Presentation */}
      {result.status !== 'idle' && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          {result.status === 'found' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Verified Deliverable Email
                  </span>
                </div>
                <div className="mt-1 text-base font-mono font-bold text-emerald-950">
                  {result.email}
                </div>
                {result.permutationsTested && (
                  <div className="mt-1 text-[11px] text-emerald-700">
                    Tested {result.permutationsTested.length} email pattern permutations
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(result.email!)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition-colors shadow-sm"
              >
                {copied ? 'COPIED!' : 'COPY EMAIL'}
              </button>
            </div>
          )}

          {result.status === 'not_found' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                <span>No valid deliverable email found across tested patterns.</span>
              </div>
              {result.permutationsTested && (
                <div className="mt-2 text-[11px] font-mono text-slate-500 break-words">
                  Patterns checked: {result.permutationsTested.join(', ')}
                </div>
              )}
            </div>
          )}

          {result.status === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <div className="font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span>Verification Error</span>
              </div>
              <p className="mt-1 text-slate-600">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
