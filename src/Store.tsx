import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Contact, ApiKey, Settings } from './types';
import { generatePermutations } from './utils/permutation';
import { verifyEmails, getDefaultApiKey } from './utils/apify';

const STORAGE_KEYS = 'veriflow_api_keys_v1';
const STORAGE_SETTINGS = 'veriflow_settings_v1';

interface AppState {
  contacts: Contact[];
  apiKeys: ApiKey[];
  settings: Settings;
  isProcessing: boolean;
  isPaused: boolean;
  estimatedRemainingSec: number | null;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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
        return {
          concurrency: Math.min(20, Math.max(1, parsed.concurrency)),
          delayMs: Math.max(0, parsed.delayMs ?? 500),
          reverifyAll: Boolean(parsed.reverifyAll),
        };
      }
    }
  } catch (err) {
    console.warn('Failed to load settings from localStorage:', err);
  }

  return {
    concurrency: 4,
    delayMs: 500,
    reverifyAll: false,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(loadInitialKeys);
  const [settings, setSettings] = useState<Settings>(loadInitialSettings);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [estimatedRemainingSec, setEstimatedRemainingSec] = useState<number | null>(null);

  // Synchronous atomic queue for concurrency
  const queueRef = useRef<number[]>([]);
  // Run generation counter to discard zombie workers on stop/pause
  const runIdRef = useRef<number>(0);
  const keysRef = useRef<ApiKey[]>(apiKeys);
  const contactsMapRef = useRef<Map<number, Contact>>(new Map());
  const activeWorkersRef = useRef<number>(0);

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
  }, []);

  const getNextActiveKey = useCallback((): ApiKey | null => {
    const currentList = keysRef.current;
    const found = currentList.find(k => k.status === 'active' || k.status === 'unchecked');
    return found || null;
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

    // Any in-flight row that was 'processing' will be put back to 'pending'
    setContacts(prev =>
      prev.map(c => (c.status === 'processing' ? { ...c, status: 'pending' } : c))
    );
  }, []);

  const processQueue = useCallback(async () => {
    const currentRunId = ++runIdRef.current;

    // Fill atomic queue with all pending contacts
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

      while (runIdRef.current === currentRunId) {
        const contactId = queueRef.current.shift();
        if (contactId === undefined) {
          break; // Queue drained
        }

        const contact = contactsMapRef.current.get(contactId);
        if (!contact || contact.status !== 'pending') {
          continue;
        }

        updateContact(contactId, { status: 'processing' });

        const permutations = generatePermutations(
          contact.firstName,
          contact.lastName,
          contact.website,
          contact.email
        );

        if (permutations.length === 0) {
          updateContact(contactId, {
            status: 'skipped_missing_info',
            lastError: 'Missing name or valid domain',
          });
          completedCount++;
          continue;
        }

        let retries = 0;
        let success = false;

        while (retries < 3 && !success && runIdRef.current === currentRunId) {
          const activeKey = getNextActiveKey();
          if (!activeKey) {
            // Out of keys!
            runIdRef.current++;
            setIsPaused(true);
            setIsProcessing(false);
            updateContact(contactId, { status: 'pending' });
            alert('All API keys are exhausted or invalid. Please add a valid Apify API key.');
            return;
          }

          const res = await verifyEmails(activeKey.token, permutations);

          if (runIdRef.current !== currentRunId) {
            // Cancelled or stopped while awaiting API response
            return;
          }

          if (res.isRateLimit) {
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, retries)));
            retries++;
            continue;
          }

          if (res.isExhausted) {
            // Mark exhausted synchronously to prevent infinite loop
            markKeyExhausted(activeKey.token);
            // Re-loop with the next active key immediately
            continue;
          }

          if (!res.success) {
            if (retries >= 2) {
              updateContact(contactId, {
                status: 'error',
                lastError: res.error || 'Verification failed',
                testedPermutations: permutations,
              });
            } else {
              await new Promise(r => setTimeout(r, 1000));
            }
            retries++;
            continue;
          }

          // Successful verification result
          success = true;
          if (res.validEmail) {
            updateContact(contactId, {
              status: 'found',
              email: res.validEmail,
              testedPermutations: permutations,
            });
          } else {
            updateContact(contactId, {
              status: 'not_found',
              testedPermutations: permutations,
            });
          }
        }

        if (!success && runIdRef.current === currentRunId) {
          const currentStatus = contactsMapRef.current.get(contactId)?.status;
          if (currentStatus === 'processing') {
            updateContact(contactId, { status: 'pending' });
          }
        }

        completedCount++;

        // Calculate estimated remaining seconds
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (completedCount > 0 && elapsedSec > 2) {
          const ratePerSec = completedCount / elapsedSec;
          const remaining = Math.max(0, initialTotal - completedCount);
          setEstimatedRemainingSec(Math.round(remaining / ratePerSec));
        }

        // Delay between batch tasks
        if (settings.delayMs > 0 && runIdRef.current === currentRunId) {
          await new Promise(r => setTimeout(r, settings.delayMs));
        }
      }

      activeWorkersRef.current--;
      if (activeWorkersRef.current <= 0 && runIdRef.current === currentRunId) {
        setIsProcessing(false);
        setEstimatedRemainingSec(null);
      }
    };

    const workerCount = Math.min(settings.concurrency, pendingIds.length);
    for (let i = 0; i < workerCount; i++) {
      worker();
    }
  }, [contacts, getNextActiveKey, markKeyExhausted, settings, updateContact]);

  const startProcessing = useCallback(() => {
    processQueue();
  }, [processQueue]);

  const resumeProcessing = useCallback(() => {
    processQueue();
  }, [processQueue]);

  const clearContacts = useCallback(() => {
    stopProcessing();
    setContacts([]);
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
        startProcessing,
        pauseProcessing,
        resumeProcessing,
        stopProcessing,
        clearContacts,
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
