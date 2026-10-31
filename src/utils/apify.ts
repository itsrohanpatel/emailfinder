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
    const userRes = await fetch('https://api.apify.com/v2/users/me', {
      headers: { Authorization: `Bearer ${token.trim()}` },
      signal: AbortSignal.timeout(15000),
    });

    if (userRes.status === 401) {
      return { success: false, error: 'Invalid or expired API token' };
    }

    if (!userRes.ok) {
      return { success: false, error: `Apify error: HTTP ${userRes.status}` };
    }

    const userData = await userRes.json();
    const plan = userData.data?.plan;
    const planName = plan?.name || 'Free';
    const limitUsd = plan?.monthlyUsageCreditsUsd ?? plan?.maxMonthlyUsageUsd ?? null;

    return {
      success: true,
      creditsRemaining: limitUsd,
      planName,
      exhausted: false,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return { success: false, error: 'Connection timed out checking token' };
    }
    return { success: false, error: error.message || 'Network error' };
  }
}

export async function verifyEmails(
  token: string,
  emails: string[]
): Promise<{
  success: boolean;
  validEmail?: string;
  error?: string;
  isRateLimit?: boolean;
  isExhausted?: boolean;
}> {
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
      const isExhausted =
        res.status === 403 ||
        res.status === 402 ||
        errorMsg.toLowerCase().includes('monthly usage hard limit') ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('credit') ||
        data?.error?.type === 'platform-feature-disabled';

      return { success: false, error: errorMsg, isExhausted };
    }

    if (Array.isArray(data)) {
      const validItem = data.find(
        (item: any) =>
          item.status === 'valid' ||
          item.status === 'deliverable' ||
          item.deliverable === true ||
          item.is_valid === true
      );

      if (validItem) {
        return { success: true, validEmail: validItem.email };
      }
      return { success: true }; // Permutations tested, none were valid
    }

    // In case of single object response
    if (data && typeof data === 'object') {
      if (data.status === 'valid' && data.email) {
        return { success: true, validEmail: data.email };
      }
      return { success: true };
    }

    return { success: false, error: 'Unexpected API response structure' };
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return { success: false, error: 'Apify request timed out after 2 minutes' };
    }
    return { success: false, error: error.message || 'Network error' };
  }
}
