export function getDefaultApiKey(): string {
  const envKey = (import.meta.env.VITE_APIFY_API_KEY || '').trim();
  return envKey;
}

export async function checkApiKey(token: string): Promise<{
  success: boolean;
  creditsRemaining?: number | null;
  planName?: string;
  exhausted?: boolean;
  error?: string;
}> {
  if (!token || !token.trim()) {
    return { success: false, error: 'Empty token' };
  }

  try {
    const [userRes, usageRes] = await Promise.allSettled([
      fetch('https://api.apify.com/v2/users/me', {
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(15000),
      }),
      fetch('https://api.apify.com/v2/users/me/usage/monthly', {
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(15000),
      }),
    ]);

    if (userRes.status !== 'fulfilled') {
      return { success: false, error: 'Failed connecting to Apify' };
    }

    if (userRes.value.status === 401) {
      return { success: false, error: 'Invalid or expired API token' };
    }

    if (!userRes.value.ok) {
      return { success: false, error: `Apify error: HTTP ${userRes.value.status}` };
    }

    const userData = await userRes.value.json();
    const plan = userData.data?.plan;
    const planName = plan?.name || plan?.tier || 'Free';
    const limitUsd = plan?.monthlyUsageCreditsUsd ?? plan?.maxMonthlyUsageUsd ?? null;

    let creditsRemaining: number | null = limitUsd;
    if (usageRes.status === 'fulfilled' && usageRes.value.ok) {
      try {
        const usageData = await usageRes.value.json();
        const spentUsd =
          usageData.data?.totalUsageCreditsUsdAfterVolumeDiscount ??
          usageData.data?.totalUsageCreditsUsdBeforeVolumeDiscount ??
          0;
        if (typeof limitUsd === 'number') {
          creditsRemaining = Math.max(0, limitUsd - spentUsd);
        }
      } catch (e) {
        // Fallback to limitUsd
      }
    }

    const isExhausted = creditsRemaining !== null && creditsRemaining <= 0.005;

    return {
      success: true,
      creditsRemaining,
      planName,
      exhausted: isExhausted,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return { success: false, error: 'Connection timed out checking token' };
    }
    return { success: false, error: error.message || 'Network error' };
  }
}

export interface VerifyEmailsResponse {
  success: boolean;
  validEmail?: string;
  isCatchAll?: boolean;
  isUnknown?: boolean;
  status?: string;
  error?: string;
  isRateLimit?: boolean;
  isExhausted?: boolean;
}

export async function verifyEmails(
  token: string,
  emails: string[]
): Promise<VerifyEmailsResponse> {
  if (!token || !token.trim()) {
    return { success: false, error: 'No API key provided', isExhausted: true };
  }

  if (!emails || emails.length === 0) {
    return { success: true };
  }

  try {
    const res = await fetch(
      'https://api.apify.com/v2/actors/j4YDbwiXnPFzYeF5w/run-sync-get-dataset-items',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          emails,
          skipInvalidSyntax: true,
        }),
        signal: AbortSignal.timeout(120000),
      }
    );

    if (res.status === 429) {
      return { success: false, error: 'Rate limited by Apify', isRateLimit: true };
    }

    if (res.status === 401) {
      return { success: false, error: 'Invalid or expired API token', isExhausted: true };
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      return { success: false, error: `Invalid response from Apify (HTTP ${res.status})` };
    }

    if (!res.ok) {
      const errorMsg = data?.error?.message || `HTTP ${res.status}`;
      const errorType = data?.error?.type || '';
      const lowerMsg = errorMsg.toLowerCase();

      const isConcurrency =
        lowerMsg.includes('concurrent') ||
        lowerMsg.includes('running too many') ||
        lowerMsg.includes('rate limit') ||
        errorType === 'actor-is-already-running-too-many-times' ||
        errorType === 'rate-limit-exceeded';

      if (res.status === 429 || isConcurrency) {
        return {
          success: false,
          error: errorMsg || 'Apify rate/concurrency limit reached, backing off...',
          isRateLimit: true,
        };
      }

      const isExhausted =
        res.status === 402 ||
        (res.status === 403 &&
          !isConcurrency &&
          (lowerMsg.includes('monthly usage') ||
            lowerMsg.includes('hard limit') ||
            lowerMsg.includes('quota') ||
            lowerMsg.includes('credit') ||
            lowerMsg.includes('billing') ||
            errorType === 'platform-feature-disabled'));

      return { success: false, error: errorMsg, isExhausted };
    }

    // BounceVerify returns an array of evaluated item records
    if (Array.isArray(data)) {
      // Check for catch-all status on the first returned record
      const firstItem = data[0];
      const isCatchAll =
        Boolean(firstItem?.is_catch_all) ||
        firstItem?.status === 'catch-all' ||
        firstItem?.status === 'accept-all';

      const isUnknown =
        firstItem?.status === 'unknown' ||
        firstItem?.result === 'unknown' ||
        firstItem?.smtp_check === 'unknown';

      // Look for a verified valid / deliverable email
      const validItem = data.find(
        (item: any) =>
          item.status === 'valid' ||
          item.status === 'deliverable' ||
          item.deliverable === true ||
          item.smtp_valid === true
      );

      if (validItem) {
        return {
          success: true,
          validEmail: validItem.email,
          isCatchAll,
          isUnknown,
          status: validItem.status,
        };
      }

      return {
        success: true,
        isCatchAll,
        isUnknown,
        status: firstItem?.status || 'invalid',
      };
    }

    if (data && typeof data === 'object') {
      const isCatchAll =
        Boolean(data.is_catch_all) ||
        data.status === 'catch-all' ||
        data.status === 'accept-all';

      const isUnknown =
        data.status === 'unknown' ||
        data.result === 'unknown' ||
        data.smtp_check === 'unknown';

      if ((data.status === 'valid' || data.smtp_valid === true) && data.email) {
        return { success: true, validEmail: data.email, isCatchAll, isUnknown, status: data.status };
      }
      return { success: true, isCatchAll, isUnknown, status: data.status || 'invalid' };
    }

    return { success: false, error: 'Unexpected API response structure' };
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return { success: false, error: 'Apify request timed out after 2 minutes' };
    }
    return { success: false, error: error.message || 'Network error' };
  }
}
