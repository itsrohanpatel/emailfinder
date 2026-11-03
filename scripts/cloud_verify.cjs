/**
 * Headless Cloud Verification Runner for GitHub Actions
 * Runs on Microsoft Azure / GitHub Ubuntu runner with gigabit bandwidth.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Configuration from Environment
const rawContacts = process.env.INPUT_CONTACTS || '[]';
const rawKeys = process.env.INPUT_KEYS || process.env.APIFY_API_KEYS || process.env.APIFY_API_KEY || '';
const patternMode = process.env.INPUT_PATTERN_MODE || 'near_full';
const keyStrategy = process.env.INPUT_KEY_STRATEGY || 'round_robin';
const datasetId = process.env.INPUT_DATASET_ID || '';
const resultsDatasetId = process.env.INPUT_RESULTS_DATASET_ID || '';
const enableRoleFallback = (process.env.INPUT_ENABLE_ROLE_FALLBACK || 'true').toLowerCase() !== 'false';
const threadsPerAccount = Math.min(4, Math.max(1, parseInt(process.env.INPUT_THREADS_PER_ACCOUNT || '4')));

const keys = rawKeys
  .split(';')
  .map(k => k.trim())
  .filter(Boolean);

if (keys.length === 0) {
  console.error('Error: No Apify API keys provided.');
  process.exit(1);
}

// Utilities for Permutation & DNS
function normalizeDomain(url) {
  if (!url) return '';
  let domain = String(url).toLowerCase().trim();
  if (domain.includes('@')) domain = domain.split('@').pop() || '';
  domain = domain.replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/^www\d*\./, '');
  domain = domain.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  return domain.replace(/^\.+|\.+$/g, '').trim();
}

function sanitize(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
    .replace(/\s+(phd|md|jr|sr|ii|iii|esq)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function generatePermutations(firstName, lastName, website, mode = 'near_full') {
  const f = sanitize(firstName);
  const l = sanitize(lastName);
  const d = normalizeDomain(website);
  if (!d || !d.includes('.')) return [];
  if (!f && !l) return [];

  const f1 = f ? f[0] : '';
  const l1 = l ? l[0] : '';

  let rawList = [];

  if (f && l) {
    // Single-Initial Smart Mode (e.g. Maggie W):
    // Generate exactly 3 realistic patterns (maggie.w@, maggiew@, maggie@) with zero duplicates
    if (l.length === 1) {
      return Array.from(new Set([
        `${f}.${l}@${d}`,
        `${f}${l}@${d}`,
        `${f}@${d}`
      ]));
    }

    const top4 = [
      `${f}@${d}`,
      `${f}.${l}@${d}`,
      `${f}${l}@${d}`,
      `${f1}${l}@${d}`
    ];

    const next4 = [
      `${l}@${d}`,
      `${l}.${f}@${d}`,
      `${f}_${l}@${d}`,
      `${l}${f}@${d}`
    ];

    const extended = [
      `${f1}.${l}@${d}`,
      `${f}${l1}@${d}`,
      `${f}.${l1}@${d}`,
      `${l1}${f}@${d}`,
      `${l1}.${f}@${d}`,
      `${l}${f1}@${d}`,
      `${l}.${f1}@${d}`,
      `${f}-${l}@${d}`
    ];

    if (mode === 'lean') {
      rawList = top4;
    } else if (mode === 'exhaustive') {
      rawList = [...top4, ...next4, ...extended];
    } else {
      rawList = [...top4, ...next4];
    }
  } else if (f) {
    rawList = [`${f}@${d}`];
  } else if (l) {
    rawList = [`${l}@${d}`];
  }

  const validEmailRegex = /^[a-z0-9]+([._-][a-z0-9]+)*@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  return Array.from(new Set(rawList.filter(e => validEmailRegex.test(e))));
}

async function checkMx(domain) {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return true;
    const data = await res.json();
    if (data.Status === 3 || !data.Answer) return false;
    return data.Answer.some(a => a.type === 15);
  } catch {
    return true; // Fail-open
  }
}

// In-Memory Domain Cache & Shared Key Pool
const domainCache = new Map();
let activeKeys = [...keys];
let keyIndex = 0;

function markKeyExhausted(token) {
  activeKeys = activeKeys.filter(k => k !== token);
  console.warn(`[Cloud Runner] Key exhausted/invalid. ${activeKeys.length} active key(s) remaining.`);
}

function getNextKey(workerId = 0) {
  if (activeKeys.length === 0) return null;
  if (keyStrategy === 'round_robin') {
    return activeKeys[(workerId + keyIndex++) % activeKeys.length];
  }
  return activeKeys[0];
}

async function verifySingle(token, email) {
  try {
    const res = await fetch('https://api.apify.com/v2/actors/j4YDbwiXnPFzYeF5w/run-sync-get-dataset-items', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ emails: [email], skipInvalidSyntax: true }),
      signal: AbortSignal.timeout(120000),
    });

    if (res.status === 429) return { isRateLimit: true };
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      const msg = String(errData?.error?.message || `HTTP ${res.status}`);
      return { isExhausted: true, error: msg };
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = String(errData?.error?.message || `HTTP ${res.status}`);
      const lower = msg.toLowerCase();
      if (lower.includes('concurrent') || lower.includes('running too many') || lower.includes('rate limit')) {
        return { isRateLimit: true };
      }
      if (lower.includes('quota') || lower.includes('credits') || lower.includes('payment') || lower.includes('exhausted')) {
        return { isExhausted: true, error: msg };
      }
      return { success: false, error: msg };
    }

    const items = await res.json();
    if (Array.isArray(items) && items.length > 0) {
      const item = items[0];
      const isCatchAll = Boolean(item.is_catch_all) || item.status === 'catch-all';
      const isUnknown = item.status === 'unknown' || item.result === 'unknown';
      const isValid = item.status === 'valid' || item.status === 'deliverable' || item.smtp_valid === true;
      return {
        success: true,
        isValid,
        isCatchAll,
        isUnknown,
        email: item.email,
      };
    }
    return { success: false, error: 'Empty item response' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Main Execution Pool
async function run() {
  let contacts = [];

  if (datasetId && keys.length > 0) {
    console.log(`[Cloud Runner] Loading contacts from Apify Dataset: ${datasetId}...`);
    try {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${keys[0]}&offset=${offset}&limit=1000`);
        if (!res.ok) {
          console.warn(`[Cloud Runner] Apify Dataset fetch HTTP ${res.status}.`);
          break;
        }
        const chunk = await res.json();
        if (!Array.isArray(chunk) || chunk.length === 0) {
          hasMore = false;
        } else {
          contacts.push(...chunk);
          offset += chunk.length;
          if (chunk.length < 1000) hasMore = false;
        }
      }
      console.log(`[Cloud Runner] Successfully loaded ${contacts.length} contacts from Apify Dataset.`);
    } catch (err) {
      console.warn(`[Cloud Runner] Error loading dataset: ${err.message}. Falling back.`);
    }
  }

  if (contacts.length === 0) {
    try {
      contacts = JSON.parse(rawContacts || '[]');
    } catch (e) {
      console.error('Failed to parse INPUT_CONTACTS JSON:', e.message);
      process.exit(1);
    }
  }

  if (contacts.length === 0) {
    console.error('Error: No contacts found to verify.');
    process.exit(1);
  }

  console.log(`[Cloud Runner] Loaded ${contacts.length} contacts.`);
  console.log(`[Cloud Runner] Loaded ${keys.length} API keys (Strategy: ${keyStrategy}).`);

  const results = [];
  const total = contacts.length;
  let completed = 0;
  let foundCount = 0;
  let streamBuffer = [];

  function pushStreamItem(item) {
    if (!resultsDatasetId || keys.length === 0) return;
    streamBuffer.push(item);
    if (streamBuffer.length >= 2 || completed === total) {
      const toFlush = [...streamBuffer];
      streamBuffer = [];
      fetch(`https://api.apify.com/v2/datasets/${resultsDatasetId}/items?token=${keys[0]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFlush),
      }).catch(err => console.warn('[Stream Push Error]', err.message));
    }
  }

  const queue = contacts.map((c, idx) => ({ ...c, originalIndex: idx }));
  const WORKERS_PER_KEY = threadsPerAccount;
  const concurrency = Math.min(keys.length * WORKERS_PER_KEY, 32);

  console.log(`[Cloud Runner] Starting verification pool with ${concurrency} parallel workers (${WORKERS_PER_KEY} per Apify account across ${keys.length} accounts)...`);

  async function worker(workerId) {
    let currentToken = getNextKey(workerId);

    while (queue.length > 0) {
      if (activeKeys.length === 0) {
        console.error('[Cloud Runner] All Apify keys exhausted.');
        break;
      }

      const contact = queue.shift();
      if (!contact) break;

      const domain = normalizeDomain(contact.website || contact.domain || contact.company_domain || contact.Website || contact.Domain || '');

      if (!domain || !domain.includes('.')) {
        results.push({ ...contact, status: 'skipped_missing_info', email: '', lastError: 'Missing or invalid domain' });
        pushStreamItem({ id: contact.id, status: 'skipped_missing_info', email: '', lastError: 'Missing or invalid domain' });
        completed++;
        continue;
      }

      // 1. DNS Pre-Check
      const hasMx = await checkMx(domain);
      if (!hasMx) {
        results.push({ ...contact, status: 'skipped_no_mx', email: '', lastError: 'No active MX records ($0)' });
        pushStreamItem({ id: contact.id, status: 'skipped_no_mx', email: '', lastError: 'No active MX records ($0)' });
        completed++;
        continue;
      }

      // 2. Domain Cache Check
      const cached = domainCache.get(domain);
      if (cached === 'CATCH_ALL') {
        results.push({ ...contact, status: 'catch_all', email: '', lastError: 'Domain is catch-all ($0)' });
        pushStreamItem({ id: contact.id, status: 'catch_all', email: '', lastError: 'Domain is catch-all ($0)' });
        completed++;
        continue;
      }
      if (cached === 'UNKNOWN') {
        results.push({ ...contact, status: 'unknown', email: '', lastError: 'Domain inconclusive / greylisted ($0)' });
        pushStreamItem({ id: contact.id, status: 'unknown', email: '', lastError: 'Domain inconclusive / greylisted ($0)' });
        completed++;
        continue;
      }

      // 3. Permutations with Whitespace & Honorific Normalization
      let rawFn = (contact.firstName || contact.first_name || contact['First Name'] || '').trim();
      let rawLn = (contact.lastName || contact.last_name || contact['Last Name'] || '').trim();

      rawFn = rawFn.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').replace(/\s+(phd|md|jr|sr|ii|iii|esq)\.?$/i, '').trim();
      rawLn = rawLn.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').replace(/\s+(phd|md|jr|sr|ii|iii|esq)\.?$/i, '').trim();

      if (rawFn && !rawLn && rawFn.includes(' ')) {
        const parts = rawFn.split(/\s+/);
        rawFn = parts[0];
        rawLn = parts.slice(1).join(' ');
      } else if (rawLn && !rawFn && rawLn.includes(' ')) {
        const parts = rawLn.split(/\s+/);
        rawFn = parts[0];
        rawLn = parts.slice(1).join(' ');
      }

      const perms = generatePermutations(rawFn, rawLn, domain, patternMode);

      let foundEmail = '';
      let isCatchAll = false;
      let isUnknown = false;
      let lastErr = '';

      for (const candidate of perms) {
        let retries = 0;
        let done = false;

        while (retries < 5 && !done) {
          if (!currentToken) {
            currentToken = getNextKey(workerId);
            if (!currentToken) break;
          }

          const check = await verifySingle(currentToken, candidate);

          if (check.isRateLimit) {
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
            retries++;
            continue;
          }

          if (check.isExhausted) {
            markKeyExhausted(currentToken);
            currentToken = getNextKey(workerId);
            if (!currentToken) {
              lastErr = 'All API keys exhausted';
              break;
            }
            retries++;
            continue;
          }

          if (!check.success) {
            lastErr = check.error;
            await new Promise(r => setTimeout(r, 1000));
            retries++;
            continue;
          }

          done = true;

          if (check.isCatchAll) {
            isCatchAll = true;
            if (domain) domainCache.set(domain, 'CATCH_ALL');
            break;
          }

          if (check.isValid) {
            foundEmail = candidate;
            break;
          }

          if (check.isUnknown) {
            isUnknown = true;
            if (domain) domainCache.set(domain, 'UNKNOWN');
            break;
          }
        }

        if (foundEmail || isCatchAll || isUnknown || activeKeys.length === 0) break;
      }

      let isRoleFallback = false;

      // Independent HR & Careers Fallback:
      // If personal permutations yield no match, verify hr@ and careers@ for this contact
      if (enableRoleFallback && !foundEmail && !isCatchAll && !isUnknown && domain && activeKeys.length > 0) {
        const roleCandidates = [`hr@${domain}`, `careers@${domain}`];
        for (const roleEmail of roleCandidates) {
          let retries = 0;
          let done = false;
          while (retries < 4 && !done) {
            if (!currentToken) {
              currentToken = getNextKey(workerId);
              if (!currentToken) break;
            }

            const check = await verifySingle(currentToken, roleEmail);
            if (check.isRateLimit) {
              await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
              retries++;
              continue;
            }
            if (check.isExhausted) {
              markKeyExhausted(currentToken);
              currentToken = getNextKey(workerId);
              if (!currentToken) break;
              retries++;
              continue;
            }
            if (!check.success) {
              await new Promise(r => setTimeout(r, 1000));
              retries++;
              continue;
            }
            done = true;
            if (check.isCatchAll) {
              isCatchAll = true;
              if (domain) domainCache.set(domain, 'CATCH_ALL');
              break;
            }
            if (check.isValid) {
              foundEmail = roleEmail;
              isRoleFallback = true;
              break;
            }
          }
          if (foundEmail || isCatchAll || activeKeys.length === 0) break;
        }
      }

      completed++;

      let finalStatus = 'not_found';
      let verifiedEmail = '';
      let cleanErr = '';

      if (foundEmail) {
        foundCount++;
        finalStatus = isRoleFallback ? 'found_role_fallback' : 'found';
        verifiedEmail = foundEmail;
        cleanErr = isRoleFallback ? 'Company HR/Careers Fallback' : '';
      } else if (isCatchAll) {
        finalStatus = 'catch_all';
        cleanErr = 'Catch-all server';
      } else if (isUnknown) {
        finalStatus = 'unknown';
        cleanErr = 'Inconclusive / greylisted domain';
      } else {
        cleanErr = (lastErr || '').toLowerCase().includes('concurrent') || (lastErr || '').toLowerCase().includes('limit')
          ? 'Verification inconclusive'
          : (lastErr || 'No match');
      }

      results.push({ ...contact, status: finalStatus, email: verifiedEmail, lastError: cleanErr });
      pushStreamItem({ id: contact.id, status: finalStatus, email: verifiedEmail, lastError: cleanErr });

      if (completed % 10 === 0 || completed === total) {
        console.log(`[Progress] ${completed}/${total} processed (${((completed / total) * 100).toFixed(1)}%) - Found: ${foundCount}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  if (streamBuffer.length > 0 && resultsDatasetId && keys.length > 0) {
    const finalFlush = [...streamBuffer];
    streamBuffer = [];
    await fetch(`https://api.apify.com/v2/datasets/${resultsDatasetId}/items?token=${keys[0]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalFlush),
    }).catch(() => {});
  }

  // Export Results in original input sequence with all user CSV columns preserved
  console.log('[Cloud Runner] All contacts processed. Exporting Excel & CSV...');
  const outDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  results.sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));

  const exportRows = results.map(r => {
    const base = r.originalData ? { ...r.originalData } : { ...r };
    delete base.originalIndex;
    delete base.originalData;
    return {
      ...base,
      VerifiedEmail: r.email || '',
      VerificationStatus: r.status,
      LastError: r.lastError || '',
    };
  });

  // CSV
  const headers = Object.keys(exportRows[0] || {}).join(',');
  const csvContent = [headers, ...exportRows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  fs.writeFileSync(path.join(outDir, 'veriflow_verified_leads.csv'), csvContent);

  // Excel
  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Verified Leads');
  XLSX.writeFile(wb, path.join(outDir, 'veriflow_verified_leads.xlsx'));

  console.log(`[Cloud Runner] SUCCESS: Saved output to ${path.join(outDir, 'veriflow_verified_leads.xlsx')}`);
}

run().catch(err => {
  console.error('[Cloud Runner FATAL]', err);
  process.exit(1);
});

