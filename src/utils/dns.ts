import { normalizeDomain } from './permutation';

const mxCache = new Map<string, boolean>();

export function clearMxCache(): void {
  mxCache.clear();
}

export function getCachedMxStatus(domain: string): boolean | undefined {
  const norm = normalizeDomain(domain);
  return mxCache.get(norm);
}

export interface MxCheckResult {
  hasMx: boolean;
  mxRecords?: string[];
  fromCache?: boolean;
  skippedError?: boolean;
}

/**
 * Checks if a domain has active MX (Mail Exchange) DNS records using
 * Google's public DNS-over-HTTPS endpoint. Zero API keys, 100% free.
 */
export async function checkDomainMx(domain: string): Promise<MxCheckResult> {
  const norm = normalizeDomain(domain);
  if (!norm || !norm.includes('.')) {
    return { hasMx: false };
  }

  // Check cache first
  if (mxCache.has(norm)) {
    return { hasMx: mxCache.get(norm)!, fromCache: true };
  }

  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(norm)}&type=MX`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) {
      // If DoH service error, fail-open to avoid blocking verification
      return { hasMx: true, skippedError: true };
    }

    const data = await res.json();

    // Status: 0 = NOERROR, 3 = NXDOMAIN (Non-Existent Domain)
    if (data.Status === 3 || !data.Answer || !Array.isArray(data.Answer)) {
      mxCache.set(norm, false);
      return { hasMx: false };
    }

    // Filter Answer for DNS type 15 (MX records)
    const mxRecords = data.Answer.filter((ans: any) => ans.type === 15).map(
      (ans: any) => ans.data
    );

    const hasMx = mxRecords.length > 0;
    mxCache.set(norm, hasMx);

    return { hasMx, mxRecords };
  } catch (err: any) {
    // If DoH network times out or is blocked, fail-open so verification continues
    return { hasMx: true, skippedError: true };
  }
}
