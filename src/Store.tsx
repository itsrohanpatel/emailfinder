import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Contact, ApiKey, Settings } from './types';
import { ToastItem } from './components/Toast';
import {
  generatePermutations,
  normalizeDomain,
  detectPattern,
  generateEmailByPattern,
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
  clearContacts: () => void;
  clearDomainCache: () => void;
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

function loadInitialSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.concurrency === 'number') {
        // Migrate legacy 10 or excessive concurrency to safe Apify cap 3
        const safeConcurrency =
          parsed.concurrency > 5 || parsed.concurrency === 10
            ? 3
            : Math.max(1, parsed.concurrency);

        return {
          concurrency: safeConcurrency,
          delayMs: Math.max(0, parsed.delayMs ?? 300),
          reverifyAll: Boolean(parsed.reverifyAll),
          enableDnsPreCheck: parsed.enableDnsPreCheck ?? true,
          patternMode: parsed.patternMode || 'near_full',
        };
      }
    }
  } catch (err) {
    console.warn('Failed to load settings from localStorage:', err);
  }

  return {
    concurrency: 3,
    delayMs: 300,
    reverifyAll: false,
    enableDnsPreCheck: true,
    patternMode: 'near_full',
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
  const [estimatedRemainingSec, setEstimatedRemainingSec] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Persist contacts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONTACTS, JSON.stringify(contacts));
    } catch (e) {
      console.warn('LocalStorage save failed for contacts:', e);
    }
  }, [contacts]);

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
    const inRef = keysRef.current.find(k => k.token === token);
    if (inRef) {
      inRef.status = 'exhausted';
      inRef.creditsRemaining = 0;
    }
    showToast({
      type: 'warning',
      title: 'API Key Rotated',
      description: `Key ...${token.slice(-6)} was exhausted or rate-limited. Switched to next key.`,
    });
  }, [showToast]);

  const getNextActiveKey = useCallback((): ApiKey | null => {
    const currentList = keysRef.current;
    return currentList.find(k => k.status === 'active' || k.status === 'unchecked') || null;
  }, []);

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

    const worker = async () => {
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
              if (runIdRef.current !== currentRunId) return;

              let retries = 0;
              let candidateDone = false;

              while (retries < 5 && !candidateDone && runIdRef.current === currentRunId) {
                const activeKey = getNextActiveKey();
                if (!activeKey) {
                  // Wait up to 2 seconds before pausing in case key availability updates
                  await new Promise(r => setTimeout(r, 1500));
                  const retryKey = getNextActiveKey();
                  if (!retryKey && runIdRef.current === currentRunId) {
                    runIdRef.current++;
                    setIsPaused(true);
                    setIsProcessing(false);
                    updateContact(contactId, { status: 'pending' });
                    // Return contact back to queue so it's not lost
                    queueRef.current.unshift(contactId);
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
                  if (domain && contact.firstName) {
                    const emailUser = res.validEmail.split('@')[0];
                    const detectedPat = detectPattern(emailUser, contact.firstName, contact.lastName);
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

            // Record contact result
            if (runIdRef.current === currentRunId) {
              if (foundEmail) {
                updateContact(contactId, {
                  status: 'found',
                  email: foundEmail,
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
        activeWorkersRef.current--;
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

    const workerCount = Math.min(settings.concurrency, pendingIds.length);
    for (let i = 0; i < workerCount; i++) {
      worker();
    }
  }, [
    contacts,
    getNextActiveKey,
    markKeyExhausted,
    saveDomainCache,
    settings,
    updateContact,
  ]);

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
        estimatedRemainingSec,
        learnedDomainsCount,
        toasts,
        startProcessing,
        pauseProcessing,
        resumeProcessing,
        stopProcessing,
        clearContacts,
        clearDomainCache,
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
