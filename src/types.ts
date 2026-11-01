import { PermutationMode } from './utils/permutation';

export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  website: string;
  email: string;
  status:
    | 'pending'
    | 'processing'
    | 'found'
    | 'not_found'
    | 'error'
    | 'skipped_missing_info'
    | 'skipped_no_mx'
    | 'catch_all'
    | 'unknown';
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
  enableDnsPreCheck: boolean;
  patternMode: PermutationMode;
  keyStrategy: 'failover' | 'round_robin';
  executionTarget: 'local' | 'github_cloud';
  githubToken?: string;
  githubRepo?: string;
}

export interface PreFlightEstimate {
  totalContacts: number;
  expectedCalls: number;
  worstCaseCalls: number;
  expectedCostUsd: number;
  worstCaseCostUsd: number;
  availableCreditsUsd: number;
  isSufficient: boolean;
  shortageUsd: number;
  recommendedKeysToAdd: number;
}
