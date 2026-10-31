import React, { useState } from 'react';
import { useAppStore } from '../Store';
import {
  generatePermutations,
  normalizeDomain,
  detectPattern,
  generateEmailByPattern,
} from '../utils/permutation';
import { verifyEmails } from '../utils/apify';
import { checkDomainMx } from '../utils/dns';
import { Contact } from '../types';
import {
  Search,
  Check,
  Copy,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Plus,
  Zap,
} from 'lucide-react';

const DEMO_PRESETS = [
  { fn: 'Brian', ln: 'Chesky', domain: 'airbnb.com' },
  { fn: 'Patrick', ln: 'Collison', domain: 'stripe.com' },
  { fn: 'Marc', ln: 'Benioff', domain: 'salesforce.com' },
  { fn: 'Stewart', ln: 'Butterfield', domain: 'slack.com' },
];

export function SingleEmailFinder() {
  const { apiKeys, setContacts, setApiKeys, contacts, settings, showToast } = useAppStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [website, setWebsite] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{
    status: 'idle' | 'found' | 'not_found' | 'catch_all' | 'no_mx' | 'error';
    email?: string;
    error?: string;
    permutationsTested?: string[];
    callsMade?: number;
    stoppedReason?: string;
  }>({ status: 'idle' });

  const [copied, setCopied] = useState(false);

  const activeKey = apiKeys.find(k => k.status === 'active' || k.status === 'unchecked');

  const fillDemo = (demo: { fn: string; ln: string; domain: string }) => {
    setFirstName(demo.fn);
    setLastName(demo.ln);
    setWebsite(demo.domain);
    setEmailInput('');
    setResult({ status: 'idle' });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName && !lastName && !emailInput) {
      showToast({
        type: 'warning',
        title: 'Missing Contact Name',
        description: 'Please enter a name or an existing email address.',
      });
      return;
    }

    if (!website && !emailInput?.includes('@')) {
      showToast({
        type: 'warning',
        title: 'Missing Corporate Domain',
        description: 'Please enter a company website (e.g. stripe.com) or an email.',
      });
      return;
    }

    if (!activeKey) {
      showToast({
        type: 'error',
        title: 'No Active Apify Key',
        description: 'Please add a valid Apify API token in the sidebar to verify emails.',
      });
      return;
    }

    setIsSearching(true);
    setResult({ status: 'idle' });

    const domain = normalizeDomain(website || emailInput);

    // 1. Free DNS MX Pre-Check via Google DoH
    if (settings.enableDnsPreCheck && domain && domain.includes('.')) {
      const mxRes = await checkDomainMx(domain);
      if (!mxRes.hasMx) {
        setIsSearching(false);
        setResult({
          status: 'no_mx',
          error: `Domain "${domain}" has no active MX records and cannot receive email. ($0 Apify cost)`,
          callsMade: 0,
        });
        showToast({
          type: 'info',
          title: 'Dead Domain Detected',
          description: `"${domain}" has no MX records. Skipped without Apify charges.`,
        });
        return;
      }
    }

    const perms = generatePermutations(
      firstName,
      lastName,
      website,
      emailInput,
      settings.patternMode
    );

    if (perms.length === 0) {
      setIsSearching(false);
      setResult({
        status: 'error',
        error: 'Could not generate valid email permutations from the provided input.',
      });
      return;
    }

    try {
      const availableKeys = apiKeys.filter(k => k.status === 'active' || k.status === 'unchecked');
      if (availableKeys.length === 0) {
        setResult({
          status: 'error',
          error: 'No active API keys available.',
        });
        return;
      }

      let currentKeyIdx = 0;
      let foundEmail: string | undefined;
      let isCatchAll = false;
      let isUnknown = false;
      let lastErr: string | undefined;
      const tested: string[] = [];

      // Check Domain Pattern Memory
      let orderedPerms = [...perms];
      try {
        const storedPatterns = localStorage.getItem('veriflow_domain_patterns_v1');
        if (storedPatterns) {
          const map = JSON.parse(storedPatterns);
          if (map && map[domain]) {
            const preferred = generateEmailByPattern(firstName, lastName, domain, map[domain]);
            if (preferred) {
              orderedPerms = [preferred, ...perms.filter(p => p !== preferred)];
            }
          }
        }
      } catch (err) {
        console.warn('Failed reading domain cache:', err);
      }

      // Sequential Stop-on-Match Loop
      for (const candidateEmail of orderedPerms) {
        tested.push(candidateEmail);

        let emailChecked = false;
        while (!emailChecked && currentKeyIdx < availableKeys.length) {
          const keyToUse = availableKeys[currentKeyIdx];
          try {
            const res = await verifyEmails(keyToUse.token, [candidateEmail]);

            if (res.isRateLimit || res.isExhausted) {
              currentKeyIdx++;
              continue;
            }

            emailChecked = true;

            if (res.validEmail) {
              foundEmail = res.validEmail;
              // Save successful pattern to domain cache
              const pat = detectPattern(res.validEmail, firstName, lastName);
              if (pat && domain) {
                try {
                  const raw = localStorage.getItem('veriflow_domain_patterns_v1') || '{}';
                  const map = JSON.parse(raw);
                  map[domain] = pat;
                  localStorage.setItem('veriflow_domain_patterns_v1', JSON.stringify(map));
                } catch (e) {
                  console.warn(e);
                }
              }
              break;
            }

            if (res.isCatchAll) {
              isCatchAll = true;
              break;
            }

            if (res.isUnknown) {
              isUnknown = true;
              break;
            }
          } catch (err: any) {
            if (err?.status === 402 || err?.status === 429) {
              currentKeyIdx++;
            } else {
              emailChecked = true;
              lastErr = err?.message || 'Verification call failed';
            }
          }
        }

        if (foundEmail || isCatchAll || isUnknown) {
          break;
        }
      }

      setIsSearching(false);

      if (foundEmail) {
        setResult({
          status: 'found',
          email: foundEmail,
          permutationsTested: tested,
          callsMade: tested.length,
        });
        showToast({
          type: 'success',
          title: 'Deliverable Email Verified!',
          description: foundEmail,
        });
      } else if (isCatchAll) {
        setResult({
          status: 'catch_all',
          error: `Domain "${domain}" is a catch-all server (accepts all addresses). Bailed out early to save credits.`,
          permutationsTested: tested,
          callsMade: tested.length,
        });
      } else if (isUnknown) {
        setResult({
          status: 'catch_all',
          error: `Server responded with unknown / greylisted mailbox. Bailed out to prevent excessive calls.`,
          permutationsTested: tested,
          callsMade: tested.length,
        });
      } else if (lastErr) {
        setResult({
          status: 'error',
          error: lastErr,
          permutationsTested: tested,
          callsMade: tested.length,
        });
      } else {
        setResult({
          status: 'not_found',
          error: 'No valid deliverable corporate email found among evaluated permutations.',
          permutationsTested: tested,
          callsMade: tested.length,
        });
      }
    } catch (err: any) {
      setIsSearching(false);
      setResult({
        status: 'error',
        error: err?.message || 'Unexpected search failure',
      });
    }
  };

  const handleCopy = () => {
    if (result.email) {
      navigator.clipboard.writeText(result.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({
        type: 'success',
        title: 'Copied to Clipboard',
        description: result.email,
      });
    }
  };

  const handleAddToBulk = () => {
    if (!result.email && !firstName && !lastName) return;

    const newContact: Contact = {
      id: contacts.reduce((max, c) => Math.max(max, c.id), 0) + 1,
      firstName,
      lastName,
      website: website || normalizeDomain(emailInput),
      email: result.email || emailInput,
      status: result.status === 'found' ? 'found' : result.status === 'catch_all' ? 'catch_all' : 'not_found',
      testedPermutations: result.permutationsTested,
      originalData: {
        'First Name': firstName,
        'Last Name': lastName,
        Website: website,
        Email: result.email || emailInput,
      },
    };

    setContacts(prev => [newContact, ...prev]);
    showToast({
      type: 'success',
      title: 'Added to Bulk Queue',
      description: `${firstName} ${lastName} added with status: ${newContact.status}`,
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-2">
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              Single Contact Finder
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cost-optimized sequential permutation verifier with instant early stop.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-[11px] font-mono text-slate-500 uppercase">
              {activeKey ? 'Key Active' : 'No Key'}
            </span>
          </div>
        </div>

        {/* Demo Preset Buttons */}
        <div className="px-6 pt-4 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-slate-400">Quick Test:</span>
          {DEMO_PRESETS.map(demo => (
            <button
              key={demo.fn}
              type="button"
              onClick={() => fillDemo(demo)}
              className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200/70 text-slate-700 rounded-lg font-medium transition-colors cursor-pointer border border-slate-200 active:scale-[0.98]"
            >
              {demo.fn} ({demo.domain})
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSearch} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="e.g. Brian"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="e.g. Chesky"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-sans"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Company Website / Domain
            </label>
            <input
              type="text"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="e.g. airbnb.com or https://www.airbnb.com"
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
            />
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-mono text-slate-400">
              or verify direct email
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Direct Email Address (Optional)
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="e.g. brian@airbnb.com"
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={isSearching}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {isSearching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                <span>Verifying Permutations Sequentially...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Find & Verify Deliverable Email</span>
              </>
            )}
          </button>
        </form>

        {/* Results Presentation Section */}
        {result.status !== 'idle' && (
          <div className="p-6 bg-slate-50/70 border-t border-slate-200 animate-in fade-in">
            {result.status === 'found' && (
              <div className="bg-emerald-50 border border-emerald-200/90 rounded-xl p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Deliverable Email Found
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    Stopped on Call #{result.callsMade} (Saved{' '}
                    {Math.max(0, 8 - (result.callsMade || 1))} calls)
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-emerald-200/80 shadow-2xs">
                  <span className="font-mono text-sm font-bold text-slate-900 select-all">
                    {result.email}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer active:scale-[0.98]"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleAddToBulk}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-200 active:scale-[0.98]"
                      title="Add this contact and result into the bulk queue"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Bulk</span>
                    </button>
                  </div>
                </div>

                {/* Permutation chips */}
                {result.permutationsTested && result.permutationsTested.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-emerald-200/60">
                    <div className="text-[10px] uppercase font-mono font-bold text-emerald-800/80 mb-1.5">
                      Permutations Evaluated:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.permutationsTested.map(p => {
                        const isMatch = p === result.email;
                        return (
                          <span
                            key={p}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              isMatch
                                ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                                : 'bg-emerald-100/60 text-emerald-800 line-through opacity-70'
                            }`}
                          >
                            {p}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {result.status === 'catch_all' && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-purple-800 text-xs font-bold mb-1">
                  <AlertTriangle className="w-4 h-4 text-purple-600" />
                  <span>Catch-All Domain (Early Bailout Triggered)</span>
                </div>
                <p className="text-xs text-purple-700 leading-relaxed">{result.error}</p>
                <div className="mt-2 text-[10px] font-mono text-purple-600">
                  Stopped after Call #{result.callsMade} to prevent unnecessary charges.
                </div>
              </div>
            )}

            {result.status === 'no_mx' && (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-800 text-xs font-bold mb-1">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <span>Dead Domain (Free DNS Pre-Check)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{result.error}</p>
              </div>
            )}

            {result.status === 'not_found' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-700 text-xs font-bold mb-1">
                  <XCircle className="w-4 h-4 text-slate-400" />
                  <span>No Deliverable Match Found</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{result.error}</p>
              </div>
            )}

            {result.status === 'error' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-rose-800 text-xs font-bold mb-1">
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span>Verification Error</span>
                </div>
                <p className="text-xs text-rose-700 leading-relaxed">{result.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
