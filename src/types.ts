export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  website: string;
  email: string;
  status: 'pending' | 'processing' | 'found' | 'not_found' | 'error' | 'skipped_missing_info';
  lastError?: string;
  testedPermutations?: string[];
  originalData: Record<string, any>;
}

export interface ApiKey {
  token: string;
  label: string;
  creditsRemaining: number | null;
  status: 'unchecked' | 'active' | 'exhausted' | 'invalid';
  lastCheckedAt?: number;
}

export interface Settings {
  concurrency: number;
  delayMs: number;
  reverifyAll: boolean;
}
