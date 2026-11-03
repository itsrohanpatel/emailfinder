import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Contact, ApiKey, Settings, PreFlightEstimate } from './types';
import { ToastItem } from './components/Toast';
import {
  generatePermutations,
  normalizeDomain,
  detectPattern,
  generateEmailByPattern,
  PermutationMode,
} from './utils/permutation';
import { verifyEmails, getDefaultApiKey } from './utils/apify';
import { checkDomainMx } from './utils/dns';

const STORAGE_KEYS = 'veriflow_api_keys_v1';
const STORAGE_SETTINGS = 'veriflow_settings_v1';
const STORAGE_DOMAIN_PATTERNS = 'veriflow_domain_patterns_v1';
const STORAGE_CONTACTS = 'veriflow_contacts_v1';

interface AppState {
  contacts: Contact[];
  apiKeys: ApiKey[];
  settings: Settings;
  isProcessing: boolean;
  isPaused: boolean;
  isCloudRunning: boolean;
  estimatedRemainingSec: number | null;
  learnedDomainsCount: number;
  toasts: ToastItem[];
}

interface AppContextType extends AppState {
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKey[]>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  startProcessing: () => void;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  stopProcessing: () => void;
  startCloudSync: (resultsDatasetId: string, totalCount: number, primaryToken: string) => void;
  stopCloudSync: () => void;
  clearContacts: () => void;
  clearDomainCache: () => void;
  getPreFlightEstimate: () => PreFlightEstimate;
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function loadInitialContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_CONTACTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load contacts from localStorage:', err);
  }
  return [];
}

function loadInitialKeys(): ApiKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load keys from localStorage:', err);
  }

  const defaultKey = getDefaultApiKey();
  if (defaultKey) {
    return [
      {
        token: defaultKey,
        label: 'Default Env Key',
        creditsRemaining: null,
        status: 'unchecked',
      },
    ];
  }

  return [];
}

export function computePreFlightEstimate(
  contacts: Contact[],
  apiKeys: ApiKey[],
  patternMode: PermutationMode
): PreFlightEstimate {
  const pending = contacts.filter(c => c.status === 'pending');
  const count = pending.length;

  const maxPerms = patternMode === 'lean' ? 4 : patternMode === 'exhaustive' ? 16 : 8;
  const avgCallsPerLead = 2.0;
  const costPerCall = 0.00089;

  const expectedCalls = Math.round(count * avgCallsPerLead);
  const worstCaseCalls = count * maxPerms;

  const expectedCostUsd = Number((expectedCalls * costPerCall).toFixed(4));
  const worstCaseCostUsd = Number((worstCaseCalls * costPerCall).toFixed(4));

  const activeKeys = apiKeys.filter(k => k.status === 'active' || k.status === 'unchecked');
  let totalCredits = 0;
  for (const k of activeKeys) {
    if (typeof k.creditsRemaining === 'number') {
      totalCredits += k.creditsRemaining;
    } else {
      totalCredits += 5.0; // Assume fresh $5.00 free tier if unchecked
    }
  }
  totalCredits = Number(totalCredits.toFixed(4));

  const isSufficient = totalCredits >= expectedCostUsd;
  const shortageUsd = isSufficient ? 0 : Number((expectedCostUsd - totalCredits).toFixed(4));
  const recommendedKeysToAdd = isSufficient ? 0 : Math.ceil(shortageUsd / 5.0);

  return {
    totalContacts: count,
    expectedCalls,
    worstCaseCalls,
    expectedCostUsd,
    worstCaseCostUsd,
    availableCreditsUsd: totalCredits,
    isSufficient,
    shortageUsd,
    recommendedKeysToAdd,
  };
}

function loadInitialSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.concurrency === 'number') {
        const threadsPerAccount = Math.min(4, Math.max(1, parsed.threadsPerAccount ?? 4));
        const safeConcurrency = Math.min(32, Math.max(1, parsed.concurrency ?? 12));

        return {
          concurrency: safeConcurrency,
          threadsPerAccount,
          delayMs: Math.max(0, parsed.delayMs ?? 300),
          reverifyAll: Boolean(parsed.reverifyAll),
          enableDnsPreCheck: parsed.enableDnsPreCheck ?? true,
          enableRoleFallback: parsed.enableRoleFallback ?? true,
          patternMode: parsed.patternMode || 'near_full',
          keyStrategy: parsed.keyStrategy === 'failover' ? 'failover' : 'round_robin',
          executionTarget: parsed.executionTarget === 'github_cloud' ? 'github_cloud' : 'local',
          githubToken: parsed.githubToken || '',
          githubRepo: parsed.githubRepo || '',
        };
      }
    }
  } catch (err) {
    console.warn('Failed to load settings from localStorage:', err);
  }

  return {
    concurrency: 12,
    threadsPerAccount: 4,
    delayMs: 300,
    reverifyAll: false,
    enableDnsPreCheck: true,
    enableRoleFallback: true,
    patternMode: 'near_full',
    keyStrategy: 'round_robin',
    executionTarget: 'local',
    githubToken: '',
    githubRepo: '',
  };
}

function loadInitialDomainPatterns(): Map<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_DOMAIN_PATTERNS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return new Map(Object.entries(parsed));
      }
    }
  } catch (err) {
    console.warn('Failed to load domain patterns from localStorage:', err);
  }
  return new Map<string, string>();
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>(loadInitialContacts);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(loadInitialKeys);
  const [settings, setSettings] = useState<Settings>(loadInitialSettings);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCloudRunning, setIsCloudRunning] = useState(false);
  const [cloudDatasetInfo, setCloudDatasetInfo] = useState<{ resultsDatasetId: string; token: string; total: number } | null>(() => {
    try {
      const saved = localStorage.getItem('veriflow_cloud_job');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [estimatedRemainingSec, setEstimatedRemainingSec] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const startCloudSync = useCallback((resultsDatasetId: string, totalCount: number, primaryToken: string) => {
    const info = { resultsDatasetId, total: totalCount, token: primaryToken };
    setIsCloudRunning(true);
    setCloudDatasetInfo(info);
    try {
      localStorage.setItem('veriflow_cloud_job', JSON.stringify(info));
    } catch {}
  }, []);

  const stopCloudSync = useCallback(() => {
    setIsCloudRunning(false);
    setCloudDatasetInfo(null);
    setEstimatedRemainingSec(null);
    try {
      localStorage.removeItem('veriflow_cloud_job');
    } catch {}
  }, []);

  // Resume cloud syncing on reload if an active job was saved
  useEffect(() => {
    if (cloudDatasetInfo && !isCloudRunning) {
      setIsCloudRunning(true);
    }
  }, [cloudDatasetInfo, isCloudRunning]);

  // Real-Time Bi-Directional Cloud Polling Loop
  useEffect(() => {
    if (!isCloudRunning || !cloudDatasetInfo) return;

    let offset = 0;
    let pollTimer: any = null;
    let isCancelled = false;
    const cloudStartTime = Date.now();

    const poll = async () => {
      if (isCancelled) return;
      try {
        const url = `https://api.apify.com/v2/datasets/${cloudDatasetInfo.resultsDatasetId}/items?token=${cloudDatasetInfo.token}&offset=${offset}&limit=500`;
        const res = await fetch(url);
        if (res.ok) {
          const newItems = await res.json();
          if (Array.isArray(newItems) && newItems.length > 0) {
            offset += newItems.length;

            const elapsedSec = (Date.now() - cloudStartTime) / 1000;
            if (offset > 0 && elapsedSec > 2) {
              const ratePerSec = offset / elapsedSec;
              const remaining = Math.max(0, cloudDatasetInfo.total - offset);
              setEstimatedRemainingSec(Math.round(remaining / ratePerSec));
            }

            setContacts(prev => {
              const map = new Map<any, any>();
              for (const it of newItems) {
                if (it.id !== undefined) map.set(it.id, it);
              }

              return prev.map(c => {
                const match = map.get(c.id);
                if (match) {
                  return {
                    ...c,
                    status: match.status,
                    email: match.email || c.email,
                    lastError: match.lastError || '',
                  };
                }
                return c;
              });
            });

            if (offset >= cloudDatasetInfo.total) {
              stopCloudSync();
              showToast({
                type: 'success',
                title: 'Cloud Run Completed!',
                description: `All ${offset}/${cloudDatasetInfo.total} contacts processed and updated live.`,
              });
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Real-time cloud poll warning:', err);
      }

      if (!isCancelled) {
        pollTimer = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [isCloudRunning, cloudDatasetInfo, stopCloudSync, showToast]);

  // Persist contacts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONTACTS, JSON.stringify(contacts));
    } catch (e) {
      console.warn('LocalStorage save failed for contacts:', e);
    }
  }, [contacts]);

  // Synchronous atomic queue for concurrency
  const queueRef = useRef<number[]>([]);
  const runIdRef = useRef<number>(0);
  const keysRef = useRef<ApiKey[]>(apiKeys);
  const contactsMapRef = useRef<Map<number, Contact>>(new Map());
  const activeWorkersRef = useRef<number>(0);

  // Domain pattern memory & cache
  const domainPatternCache = useRef<Map<string, string>>(loadInitialDomainPatterns());
  const [learnedDomainsCount, setLearnedDomainsCount] = useState<number>(
    () => domainPatternCache.current.size
  );

  // Sync keys ref & persistence
  useEffect(() => {
    keysRef.current = apiKeys;
    try {
      localStorage.setItem(STORAGE_KEYS, JSON.stringify(apiKeys));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }, [apiKeys]);

  // Sync settings persistence
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }, [settings]);

  // Sync contacts map
  useEffect(() => {
    const map = new Map<number, Contact>();
    for (const c of contacts) {
      map.set(c.id, c);
    }
    contactsMapRef.current = map;
  }, [contacts]);

  const saveDomainCache = useCallback(() => {
    try {
      const obj = Object.fromEntries(domainPatternCache.current);
      localStorage.setItem(STORAGE_DOMAIN_PATTERNS, JSON.stringify(obj));
      setLearnedDomainsCount(domainPatternCache.current.size);
    } catch (e) {
      console.warn('Domain cache save failed:', e);
    }
  }, []);

  const clearDomainCache = useCallback(() => {
    domainPatternCache.current.clear();
    localStorage.removeItem(STORAGE_DOMAIN_PATTERNS);
    setLearnedDomainsCount(0);
    showToast({
      type: 'info',
      title: 'Domain Cache Cleared',
      description: 'Reset corporate email patterns memory.',
    });
  }, [showToast]);

  const updateContact = useCallback((id: number, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
    const existing = contactsMapRef.current.get(id);
    if (existing) {
      contactsMapRef.current.set(id, { ...existing, ...updates });
    }
  }, []);

  const markKeyExhausted = useCallback((token: string) => {
    setApiKeys(prev =>
      prev.map(k => (k.token === token ? { ...k, status: 'exhausted', creditsRemaining: 0 } : k))
    );
    keysRef.current = keysRef.current.map(k =>
      k.token === token ? { ...k, status: 'exhausted', creditsRemaining: 0 } : k
    );
    showToast({
      type: 'warning',
      title: 'API Key Rotated',
      description: `Key ...${token.slice(-6)} was exhausted or rate-limited. Switched to next key.`,
    });
  }, [showToast]);

  const roundRobinKeyIndexRef = useRef<number>(0);

  const getNextActiveKey = useCallback((workerId?: number): ApiKey | null => {
    const active = keysRef.current.filter(k => k.status === 'active' || k.status === 'unchecked');
    if (active.length === 0) return null;

    if (settings.keyStrategy === 'round_robin') {
      if (workerId !== undefined) {
        return active[workerId % active.length];
      }
      const idx = Math.abs(roundRobinKeyIndexRef.current++) % active.length;
      return active[idx];
    } else {
      return active[0];
    }
  }, [settings.keyStrategy]);

  const stopProcessing = useCallback(() => {
    runIdRef.current++;
    queueRef.current = [];
    setIsProcessing(false);
    setIsPaused(false);
    setEstimatedRemainingSec(null);

    setContacts(prev =>
      prev.map(c => (c.status === 'processing' ? { ...c, status: 'pending' } : c))
    );
  }, []);

  const pauseProcessing = useCallback(() => {
    runIdRef.current++;
    setIsPaused(true);
    setIsProcessing(false);
    setEstimatedRemainingSec(null);

    setContacts(prev =>
      prev.map(c => (c.status === 'processing' ? { ...c, status: 'pending' } : c))
    );
  }, []);

  const processQueue = useCallback(async () => {
    const currentRunId = ++runIdRef.current;

    const pendingIds = contacts
      .filter(c => c.status === 'pending')
      .map(c => c.id);

    if (pendingIds.length === 0) {
      return;
    }

    queueRef.current = pendingIds;
    setIsProcessing(true);
    setIsPaused(false);

    const initialTotal = pendingIds.length;
    let completedCount = 0;
    const startTime = Date.now();
    activeWorkersRef.current = 0;

    const worker = async (workerId: number = 0) => {
      activeWorkersRef.current++;

      try {
        while (runIdRef.current === currentRunId) {
          const contactId = queueRef.current.shift();
          if (contactId === undefined) {
            break; // Queue drained
          }

          const contact = contactsMapRef.current.get(contactId);
          if (!contact || contact.status !== 'pending') {
            completedCount++;
            continue;
          }

          try {
            updateContact(contactId, { status: 'processing' });

            const domain = normalizeDomain(contact.website || contact.email);

            // 1. FREE DNS MX PRE-CHECK
            if (settings.enableDnsPreCheck && domain && domain.includes('.')) {
              const mxRes = await checkDomainMx(domain);
              if (runIdRef.current !== currentRunId) return;

              if (!mxRes.hasMx) {
                updateContact(contactId, {
                  status: 'skipped_no_mx',
                  lastError: 'Domain has no active MX mail records (0 Apify cost)',
                });
                completedCount++;
                continue;
              }
            }

            // 2. CHECK IF DOMAIN WAS PREVIOUSLY DETECTED AS CATCH-ALL OR UNKNOWN
            const cachedDomainType = domain ? domainPatternCache.current.get(domain) : null;
            if (cachedDomainType === 'CATCH_ALL') {
              updateContact(contactId, {
                status: 'catch_all',
                lastError: 'Domain mail server is catch-all (unverifiable permutations)',
              });
              completedCount++;
              continue;
            }
            if (cachedDomainType === 'UNKNOWN') {
              updateContact(contactId, {
                status: 'unknown',
                lastError: 'Domain mail server inconclusive / greylisted ($0 Apify cost)',
              });
              completedCount++;
              continue;
            }

            // 3. GENERATE CANDIDATE PERMUTATIONS IN ORDER
            const standardCandidates = generatePermutations(
              contact.firstName,
              contact.lastName,
              contact.website,
              contact.email,
              settings.patternMode
            );

            if (standardCandidates.length === 0) {
              updateContact(contactId, {
                status: 'skipped_missing_info',
                lastError: 'Missing name or valid domain',
              });
              completedCount++;
              continue;
            }

            // Check Domain Pattern Memory: Prioritize learned pattern at the front of the list
            let orderedCandidates = standardCandidates;
            if (
              cachedDomainType &&
              cachedDomainType !== 'CATCH_ALL' &&
              cachedDomainType !== 'UNKNOWN'
            ) {
              const cachedEmail = generateEmailByPattern(
                contact.firstName,
                contact.lastName,
                domain,
                cachedDomainType
              );
              if (cachedEmail) {
                orderedCandidates = [
                  cachedEmail,
                  ...standardCandidates.filter(e => e.toLowerCase() !== cachedEmail.toLowerCase()),
                ];
              }
            }

            // 4. SEQUENTIAL STOP-ON-MATCH VERIFICATION
            let foundEmail: string | undefined;
            let isCatchAll = false;
            let isUnknown = false;
            let lastErr: string | undefined;
            const testedList: string[] = [];

            for (const candidateEmail of orderedCandidates) {
              if (runIdRef.current !== currentRunId) {
                const current = contactsMapRef.current.get(contactId);
                if (current && current.status === 'processing') {
                  updateContact(contactId, { status: 'pending' });
                  if (!queueRef.current.includes(contactId)) {
                    queueRef.current.unshift(contactId);
                  }
                }
                return;
              }

              let retries = 0;
              let candidateDone = false;

              while (retries < 5 && !candidateDone && runIdRef.current === currentRunId) {
                const activeKey = getNextActiveKey(workerId);
                if (!activeKey) {
                  // Wait up to 2 seconds before pausing in case key availability updates
                  await new Promise(r => setTimeout(r, 1500));
                  const retryKey = getNextActiveKey(workerId);
                  if (!retryKey && runIdRef.current === currentRunId) {
                    runIdRef.current++;
                    setIsPaused(true);
                    setIsProcessing(false);

                    // Reset all currently processing contacts back to pending so parallel workers don't abandon them
                    setContacts(prev =>
                      prev.map(c => (c.status === 'processing' ? { ...c, status: 'pending' } : c))
                    );
                    for (const id of contactsMapRef.current.keys()) {
                      const c = contactsMapRef.current.get(id);
                      if (c && c.status === 'processing') {
                        c.status = 'pending';
                        if (!queueRef.current.includes(id)) {
                          queueRef.current.unshift(id);
                        }
                      }
                    }

                    showToast({
                      type: 'error',
                      title: 'No Active API Keys',
                      description: 'All API keys are exhausted or invalid. Please add a valid Apify API key in the sidebar.',
                    });
                    return;
                  }
                  continue;
                }

                // Verify 1 candidate email at a time
                const res = await verifyEmails(activeKey.token, [candidateEmail]);
                if (runIdRef.current !== currentRunId) return;

                if (res.isRateLimit) {
                  // Concurrency or rate limit: jitter backoff and retry this candidate without marking key exhausted
                  const backoff = 1500 * Math.pow(1.5, retries) + Math.random() * 800;
                  await new Promise(r => setTimeout(r, backoff));
                  retries++;
                  continue;
                }

                if (res.isExhausted) {
                  markKeyExhausted(activeKey.token);
                  continue;
                }

                if (!res.success) {
                  lastErr = res.error;
                  if (retries >= 3) {
                    candidateDone = true;
                  } else {
                    await new Promise(r => setTimeout(r, 1000));
                  }
                  retries++;
                  continue;
                }

                // Success response for this candidate
                candidateDone = true;
                testedList.push(candidateEmail);

                // A: Catch-All Bail-Out
                if (res.isCatchAll) {
                  isCatchAll = true;
                  if (domain) {
                    domainPatternCache.current.set(domain, 'CATCH_ALL');
                    saveDomainCache();
                  }
                  break; // Stop testing further candidates!
                }

                // B: Match Found! Stop immediately!
                if (res.validEmail) {
                  foundEmail = res.validEmail;

                  // Learn the company pattern for subsequent contacts
                  if (domain && (contact.firstName || contact.lastName)) {
                    const emailUser = res.validEmail.split('@')[0];
                    const detectedPat = detectPattern(emailUser, contact.firstName || '', contact.lastName || '');
                    if (detectedPat) {
                      domainPatternCache.current.set(domain, detectedPat);
                      saveDomainCache();
                    }
                  }
                  break; // STOP ON FIRST MATCH!
                }

                // C: Status Unknown / Inconclusive Domain Bail-Out
                if (res.isUnknown) {
                  isUnknown = true;
                  if (domain) {
                    domainPatternCache.current.set(domain, 'UNKNOWN');
                    saveDomainCache();
                  }
                  break; // Stop testing further candidates!
                }

                // D: Status Invalid -> Loop advances to next candidate permutation
              }

              if (foundEmail || isCatchAll || isUnknown) {
                break;
              }

              // Optional worker delay between sequential candidate checks
              if (settings.delayMs > 0 && runIdRef.current === currentRunId) {
                await new Promise(r => setTimeout(r, settings.delayMs));
              }
            }

            let isRoleFallback = false;

            // Independent HR & Careers Fallback:
            // If personal permutations yield no match, verify hr@ then careers@ for this contact
            if (
              !foundEmail &&
              !isCatchAll &&
              !isUnknown &&
              domain &&
              settings.enableRoleFallback !== false
            ) {
              const roleCandidates = [`hr@${domain}`, `careers@${domain}`];
              for (const roleEmail of roleCandidates) {
                if (runIdRef.current !== currentRunId) return;

                let roleRetries = 0;
                let roleDone = false;

                while (roleRetries < 5 && !roleDone && runIdRef.current === currentRunId) {
                  const activeKey = getNextActiveKey(workerId);
                  if (!activeKey) break;

                  const res = await verifyEmails(activeKey.token, [roleEmail]);
                  if (res.isRateLimit) {
                    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
                    roleRetries++;
                    continue;
                  }
                  if (res.isExhausted) {
                    markKeyExhausted(activeKey.token);
                    continue;
                  }
                  if (!res.success) {
                    await new Promise(r => setTimeout(r, 1000));
                    roleRetries++;
                    continue;
                  }

                  roleDone = true;
                  testedList.push(roleEmail);

                  if (res.isCatchAll) {
                    isCatchAll = true;
                    if (domain) {
                      domainPatternCache.current.set(domain, 'CATCH_ALL');
                      saveDomainCache();
                    }
                    break;
                  }

                  if (res.isUnknown) {
                    isUnknown = true;
                    if (domain) {
                      domainPatternCache.current.set(domain, 'UNKNOWN');
                      saveDomainCache();
                    }
                    break;
                  }

                  if (res.validEmail) {
                    foundEmail = res.validEmail;
                    isRoleFallback = true;
                    break;
                  }
                }

                if (foundEmail || isCatchAll) break;
              }
            }

            // Record contact result
            if (runIdRef.current === currentRunId) {
              if (foundEmail) {
                updateContact(contactId, {
                  status: isRoleFallback ? 'found_role_fallback' : 'found',
                  email: foundEmail,
                  lastError: isRoleFallback ? 'Company HR/Careers Fallback' : undefined,
                  testedPermutations: testedList,
                });
              } else if (isCatchAll) {
                updateContact(contactId, {
                  status: 'catch_all',
                  lastError: 'Domain is catch-all (mailbox verified as accept-all)',
                  testedPermutations: testedList,
                });
              } else if (isUnknown) {
                updateContact(contactId, {
                  status: 'unknown',
                  lastError: 'Domain mail server inconclusive / greylisted (unknown domain)',
                  testedPermutations: testedList,
                });
              } else {
                updateContact(contactId, {
                  status: 'not_found',
                  lastError: lastErr,
                  testedPermutations: testedList,
                });
              }

              completedCount++;

              const elapsedSec = (Date.now() - startTime) / 1000;
              if (completedCount > 0 && elapsedSec > 2) {
                const ratePerSec = completedCount / elapsedSec;
                const remaining = Math.max(0, initialTotal - completedCount);
                setEstimatedRemainingSec(Math.round(remaining / ratePerSec));
              }
            }
          } catch (itemErr: any) {
            console.error(`Error processing contact ${contactId}:`, itemErr);
            updateContact(contactId, {
              status: 'error',
              lastError: itemErr?.message || 'Processing error',
            });
            completedCount++;
          }
        }
      } catch (fatalWorkerErr) {
        console.error('Fatal worker error:', fatalWorkerErr);
      } finally {
        activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        if (activeWorkersRef.current <= 0 && runIdRef.current === currentRunId) {
          setIsProcessing(false);
          setEstimatedRemainingSec(null);
          showToast({
            type: 'success',
            title: 'Verification Complete',
            description: `Finished processing all ${initialTotal} contacts.`,
          });
        }
      }
    };

    const activeKeyCount = Math.max(
      1,
      keysRef.current.filter(k => k.status === 'active' || k.status === 'unchecked').length
    );
    const threadsPerKey = Math.min(4, Math.max(1, settings.threadsPerAccount ?? 4));

    // When round-robin is active, scale total parallel workers across all active accounts (e.g. 6 accounts * 4 threads = 24 workers)
    const safeWorkerLimit =
      settings.keyStrategy === 'round_robin'
        ? Math.min(activeKeyCount * threadsPerKey, 32)
        : Math.min(threadsPerKey, 4);

    const workerCount = Math.min(safeWorkerLimit, pendingIds.length);
    for (let i = 0; i < workerCount; i++) {
      worker(i);
    }
  }, [
    contacts,
    getNextActiveKey,
    markKeyExhausted,
    saveDomainCache,
    settings,
    updateContact,
  ]);

  const getPreFlightEstimate = useCallback((): PreFlightEstimate => {
    return computePreFlightEstimate(contacts, apiKeys, settings.patternMode);
  }, [contacts, apiKeys, settings.patternMode]);

  const startProcessing = useCallback(() => {
    processQueue();
  }, [processQueue]);

  const resumeProcessing = useCallback(() => {
    processQueue();
  }, [processQueue]);

  const clearContacts = useCallback(() => {
    stopProcessing();
    setContacts([]);
    try {
      localStorage.removeItem(STORAGE_CONTACTS);
    } catch (e) {
      console.warn(e);
    }
  }, [stopProcessing]);

  return (
    <AppContext.Provider
      value={{
        contacts,
        setContacts,
        apiKeys,
        setApiKeys,
        settings,
        setSettings,
        isProcessing,
        isPaused,
        isCloudRunning,
        estimatedRemainingSec,
        learnedDomainsCount,
        toasts,
        startProcessing,
        pauseProcessing,
        resumeProcessing,
        stopProcessing,
        startCloudSync,
        stopCloudSync,
        clearContacts,
        clearDomainCache,
        getPreFlightEstimate,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Missing AppProvider');
  return context;
}
