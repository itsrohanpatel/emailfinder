const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const APIFY_TOKEN = process.env.APIFY_API_KEY || '';
const INPUT_PATH = 'C:\\Users\\rohan\\Downloads\\Book1.xlsx';
const OUTPUT_PATH = 'C:\\Users\\rohan\\Downloads\\Book1_verified_results.csv';

// Probability-ordered patterns
function parseFullName(raw) {
  if (!raw) return { firstName: '', lastName: '' };
  const clean = String(raw).trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '' };
  return {
    firstName: tokens[0],
    lastName: tokens[tokens.length - 1],
  };
}

function normalizeDomain(raw) {
  if (!raw) return '';
  let d = String(raw).trim().toLowerCase();
  d = d.replace(/^https?:\/\//i, '');
  d = d.replace(/^www\./i, '');
  d = d.split('/')[0].split(':')[0];
  return d;
}

function generatePermutations(firstName, lastName, domain) {
  if (!domain || !domain.includes('.')) return [];
  const f = (firstName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const l = (lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!f && !l) return [];
  const fi = f ? f[0] : '';

  const candidates = [];
  if (f) candidates.push(`${f}@${domain}`); // 1. first
  if (f && l) candidates.push(`${f}.${l}@${domain}`); // 2. first.last
  if (f && l) candidates.push(`${f}${l}@${domain}`); // 3. firstlast
  if (fi && l) candidates.push(`${fi}${l}@${domain}`); // 4. flast
  if (l) candidates.push(`${l}@${domain}`); // 5. last
  if (l && f) candidates.push(`${l}.${f}@${domain}`); // 6. last.first
  if (f && l) candidates.push(`${f}_${l}@${domain}`); // 7. first_last
  if (l && f) candidates.push(`${l}${f}@${domain}`); // 8. lastfirst

  return Array.from(new Set(candidates));
}

// DNS MX Cache
const mxCache = new Map();
async function checkMx(domain) {
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain);
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      mxCache.set(domain, true);
      return true;
    }
    const data = await res.json();
    const hasMx = Boolean(data.Answer && data.Answer.some(a => a.type === 15));
    mxCache.set(domain, hasMx);
    return hasMx;
  } catch {
    mxCache.set(domain, true);
    return true; // Fail-open
  }
}

// Apify verification
async function verifyCandidate(email, token) {
  try {
    const res = await fetch('https://api.apify.com/v2/actors/j4YDbwiXnPFzYeF5w/run-sync-get-dataset-items', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ emails: [email], skipInvalidSyntax: true }),
      signal: AbortSignal.timeout(60000),
    });

    if (res.status === 429) return { isRateLimit: true };
    if (res.status === 402 || res.status === 403) return { isExhausted: true };

    const data = await res.json();
    if (!res.ok) return { success: false, error: data?.error?.message || `HTTP ${res.status}` };

    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const isDeliverable = item.status === 'valid' || item.status === 'deliverable' || item.deliverable === true;
      const isCatchAll = Boolean(item.is_catch_all) || item.risk_type === 'catch_all';
      const isUnknown = item.status === 'unknown';
      return {
        success: true,
        valid: isDeliverable,
        isCatchAll,
        isUnknown,
        email: item.email,
        status: item.status,
      };
    }
    return { success: false, error: 'Empty response array' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  console.log(`[VeriFlow Engine] Reading: ${INPUT_PATH}`);
  const buf = fs.readFileSync(INPUT_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`[VeriFlow Engine] Loaded ${rawRows.length} contacts from Book1.xlsx`);
  console.log(`[VeriFlow Engine] Using Apify token: ${APIFY_TOKEN.slice(0, 10)}...${APIFY_TOKEN.slice(-4)}`);

  const contacts = rawRows.map((r, idx) => {
    const name = r.Name || r['Full Name'] || `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim();
    const { firstName, lastName } = parseFullName(name);
    const domain = normalizeDomain(r.Domain || r.Website || '');
    return {
      id: idx + 1,
      raw: r,
      firstName,
      lastName,
      domain,
      status: 'pending',
      verifiedEmail: '',
      callsMade: 0,
    };
  });

  const domainMemory = new Map();
  const CONCURRENCY = 4; // Safe for Apify Free tier (5 max runs)
  const results = [];
  let processedCount = 0;
  let foundCount = 0;
  let catchAllCount = 0;
  let noMxCount = 0;
  let totalCalls = 0;

  const queue = [...contacts];

  async function worker(workerId) {
    while (queue.length > 0) {
      const contact = queue.shift();
      if (!contact) break;

      // 1. MX Pre-check
      if (contact.domain) {
        const hasMx = await checkMx(contact.domain);
        if (!hasMx) {
          contact.status = 'no_mx';
          processedCount++;
          noMxCount++;
          results.push(contact);
          console.log(`[Worker ${workerId}] #${contact.id} ${contact.firstName} ${contact.lastName} (${contact.domain}): [NO MX] skipped in 30ms ($0 cost)`);
          continue;
        }
      }

      // 2. Check if domain was previously caught as CATCH_ALL
      if (domainMemory.get(contact.domain) === 'CATCH_ALL') {
        contact.status = 'catch_all';
        processedCount++;
        catchAllCount++;
        results.push(contact);
        console.log(`[Worker ${workerId}] #${contact.id} ${contact.firstName} ${contact.lastName} (${contact.domain}): [CATCH-ALL from cache] skipped ($0 cost)`);
        continue;
      }

      // 3. Generate permutations
      let perms = generatePermutations(contact.firstName, contact.lastName, contact.domain);
      if (perms.length === 0) {
        contact.status = 'missing_info';
        processedCount++;
        results.push(contact);
        continue;
      }

      // Check domain memory preference
      const remembered = domainMemory.get(contact.domain);
      if (remembered && remembered !== 'CATCH_ALL') {
        // e.g. first.last pattern
        const prefEmail = `${contact.firstName.toLowerCase()}.${contact.lastName.toLowerCase()}@${contact.domain}`;
        if (perms.includes(prefEmail)) {
          perms = [prefEmail, ...perms.filter(p => p !== prefEmail)];
        }
      }

      // 4. Sequential Stop-on-Match Loop
      let foundEmail = '';
      let isCatchAll = false;
      let calls = 0;

      for (const candidate of perms) {
        calls++;
        totalCalls++;

        let res = await verifyCandidate(candidate, APIFY_TOKEN);
        if (res.isRateLimit) {
          await new Promise(r => setTimeout(r, 2000));
          res = await verifyCandidate(candidate, APIFY_TOKEN);
        }

        if (res.valid) {
          foundEmail = candidate;
          contact.status = 'deliverable';
          contact.verifiedEmail = candidate;
          foundCount++;
          // Save domain pattern
          if (candidate.startsWith(`${contact.firstName.toLowerCase()}.${contact.lastName.toLowerCase()}@`)) {
            domainMemory.set(contact.domain, 'first.last');
          } else if (candidate.startsWith(`${contact.firstName.toLowerCase()}@`)) {
            domainMemory.set(contact.domain, 'first');
          }
          break; // STOP ON FIRST MATCH!
        }

        if (res.isCatchAll) {
          isCatchAll = true;
          domainMemory.set(contact.domain, 'CATCH_ALL');
          break; // BAIL OUT ON CATCH ALL!
        }

        // Short throttle between requests
        await new Promise(r => setTimeout(r, 250));
      }

      contact.callsMade = calls;
      if (foundEmail) {
        contact.status = 'deliverable';
        contact.verifiedEmail = foundEmail;
        console.log(`[Worker ${workerId}] #${contact.id} ${contact.firstName} ${contact.lastName} (${contact.domain}): [FOUND] -> ${foundEmail} (Call #${calls})`);
      } else if (isCatchAll) {
        contact.status = 'catch_all';
        catchAllCount++;
        console.log(`[Worker ${workerId}] #${contact.id} ${contact.firstName} ${contact.lastName} (${contact.domain}): [CATCH-ALL] bailed out on Call #${calls}`);
      } else {
        contact.status = 'not_found';
        console.log(`[Worker ${workerId}] #${contact.id} ${contact.firstName} ${contact.lastName} (${contact.domain}): [NOT FOUND] checked ${calls} patterns`);
      }

      processedCount++;
      results.push(contact);
    }
  }

  // Start 4 workers
  console.log(`[VeriFlow Engine] Starting ${CONCURRENCY} parallel workers...`);
  const workerPromises = [];
  for (let w = 1; w <= CONCURRENCY; w++) {
    workerPromises.push(worker(w));
  }

  await Promise.all(workerPromises);

  // Write CSV Output
  console.log(`[VeriFlow Engine] Writing results to: ${OUTPUT_PATH}`);
  const exportRows = results.map(r => ({
    ...r.raw,
    Verified_Email: r.verifiedEmail,
    Verification_Status: r.status,
    Calls_Made: r.callsMade,
  }));

  const exportWb = XLSX.utils.book_new();
  const exportWs = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(exportWb, exportWs, 'Verified');
  XLSX.writeFile(exportWb, OUTPUT_PATH);

  // Also write an identical CSV format
  const csvContent = XLSX.utils.sheet_to_csv(exportWs);
  fs.writeFileSync(OUTPUT_PATH.replace('.xlsx', '.csv'), csvContent);

  const costSpent = (totalCalls * 0.89) / 1000;
  console.log('\n=============================================');
  console.log('           VERIFICATION COMPLETED            ');
  console.log('=============================================');
  console.log(`  Total Contacts:     ${contacts.length}`);
  console.log(`  Deliverable Found:  ${foundCount}`);
  console.log(`  Catch-All Domains:  ${catchAllCount}`);
  console.log(`  No MX / Dead:       ${noMxCount}`);
  console.log(`  Total API Calls:    ${totalCalls}`);
  console.log(`  Total Cost Spent:   $${costSpent.toFixed(2)} USD (at $0.89/1k)`);
  console.log(`  Results Saved To:   ${OUTPUT_PATH}`);
  console.log('=============================================\n');
}

run().catch(err => console.error('Engine error:', err));

