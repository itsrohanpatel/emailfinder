import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkDomainMx, clearMxCache, getCachedMxStatus } from './dns';

describe('DNS MX Pre-Check via DoH', () => {
  beforeEach(() => {
    clearMxCache();
    vi.restoreAllMocks();
  });

  it('identifies valid mail domains with active MX records', async () => {
    const res = await checkDomainMx('google.com');
    expect(res.hasMx).toBe(true);
  }, 10000);

  it('flags non-existent or invalid domains as having no MX', async () => {
    const res = await checkDomainMx('nonexistent12345fakedomain999.invalid');
    expect(res.hasMx).toBe(false);
  }, 10000);

  it('handles empty or blank domain inputs without throwing', async () => {
    const res = await checkDomainMx('');
    expect(res.hasMx).toBe(false);

    const res2 = await checkDomainMx('   ');
    expect(res2.hasMx).toBe(false);
  });

  it('caches lookup results to avoid repeated network requests', async () => {
    expect(getCachedMxStatus('microsoft.com')).toBeUndefined();
    await checkDomainMx('microsoft.com');
    expect(getCachedMxStatus('microsoft.com')).toBe(true);
  }, 10000);

  it('parses mock MX response correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ name: 'mockcorp.com.', type: 15, data: '10 mail.mockcorp.com.' }],
      }),
    } as any);

    const res = await checkDomainMx('mockcorp.com');
    expect(res.hasMx).toBe(true);
    expect(res.mxRecords).toEqual(['10 mail.mockcorp.com.']);
  });
});
