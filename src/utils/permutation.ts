export type PermutationMode = 'lean' | 'near_full' | 'exhaustive';

/**
 * Normalizes a URL, domain, or email string to a clean hostname domain.
 * e.g., "https://www.google.com/search?q=test" -> "google.com"
 * e.g., "user@company.co.uk" -> "company.co.uk"
 */
export function normalizeDomain(url: string): string {
  if (!url) return '';
  let domain = url.toLowerCase().trim();

  // If input contains an email address (e.g. info@domain.com)
  if (domain.includes('@')) {
    domain = domain.split('@').pop() || '';
  }

  // Remove mailto:, protocols, and leading www
  domain = domain.replace(/^mailto:/, '');
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^ftp:\/\//, '');
  domain = domain.replace(/^www\d*\./, '');

  // Strip path, query params, hash fragments, and ports
  domain = domain.split('/')[0].split('?')[0].split('#')[0].split(':')[0];

  // Strip trailing/leading dots or spaces
  domain = domain.replace(/^\.+|\.+$/g, '').trim();

  if (!domain.includes('.') || domain.endsWith('.')) {
    return domain;
  }

  return domain;
}

/**
 * Sanitizes a person's name part into clean alphanumeric ASCII characters.
 * Removes honorifics, titles, accents, and special characters.
 */
export function sanitizeNamePart(name: string): string {
  if (!name) return '';
  let cleaned = name.toLowerCase().trim();

  // Remove accents / diacritics (e.g. José -> jose)
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remove common prefixes and suffixes
  cleaned = cleaned.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '');
  cleaned = cleaned.replace(/\s+(phd|md|jr|sr|ii|iii|esq)\.?$/i, '');

  // Keep only lowercase letters and digits
  cleaned = cleaned.replace(/[^a-z0-9]/g, '');

  return cleaned;
}

/**
 * Detects which pattern an email user part matches.
 */
export function detectPattern(emailUser: string, firstName: string, lastName: string): string | null {
  const f = sanitizeNamePart(firstName);
  const l = sanitizeNamePart(lastName);
  const u = (emailUser || '').toLowerCase().trim();

  if (!f && !l) return null;

  const f1 = f ? f[0] : '';
  const l1 = l ? l[0] : '';

  if (u === f) return 'first';
  if (l && u === `${f}.${l}`) return 'first.last';
  if (l && u === `${f}${l}`) return 'firstlast';
  if (l && u === `${f1}${l}`) return 'flast';
  if (l && u === l) return 'last';
  if (l && u === `${l}.${f}`) return 'last.first';
  if (l && u === `${f}_${l}`) return 'first_last';
  if (l && u === `${l}${f}`) return 'lastfirst';
  if (l && u === `${f1}.${l}`) return 'f.last';
  if (l && u === `${f}${l1}`) return 'firstl';
  if (l && u === `${f}.${l1}`) return 'first.l';
  if (l && u === `${l1}${f}`) return 'lfirst';
  if (l && u === `${l1}.${f}`) return 'l.first';
  if (l && u === `${l}${f1}`) return 'lastf';
  if (l && u === `${l}.${f1}`) return 'last.f';
  if (l && u === `${f}-${l}`) return 'first-last';

  return null;
}

/**
 * Generates an email address from a known pattern name.
 */
export function generateEmailByPattern(
  firstName: string,
  lastName: string,
  domain: string,
  pattern: string
): string {
  const f = sanitizeNamePart(firstName);
  const l = sanitizeNamePart(lastName);
  const normDomain = normalizeDomain(domain);

  const f1 = f ? f[0] : '';
  const l1 = l ? l[0] : '';

  let user = f;

  switch (pattern) {
    case 'first':
      user = f;
      break;
    case 'first.last':
      user = l ? `${f}.${l}` : f;
      break;
    case 'firstlast':
      user = l ? `${f}${l}` : f;
      break;
    case 'flast':
      user = l ? `${f1}${l}` : f;
      break;
    case 'last':
      user = l ? l : f;
      break;
    case 'last.first':
      user = l ? `${l}.${f}` : f;
      break;
    case 'first_last':
      user = l ? `${f}_${l}` : f;
      break;
    case 'lastfirst':
      user = l ? `${l}${f}` : f;
      break;
    case 'f.last':
      user = l ? `${f1}.${l}` : f;
      break;
    case 'firstl':
      user = l ? `${f}${l1}` : f;
      break;
    case 'first.l':
      user = l ? `${f}.${l1}` : f;
      break;
    case 'lfirst':
      user = l ? `${l1}${f}` : f;
      break;
    case 'l.first':
      user = l ? `${l1}.${f}` : f;
      break;
    case 'lastf':
      user = l ? `${l}${f1}` : f;
      break;
    case 'last.f':
      user = l ? `${l}.${f1}` : f;
      break;
    case 'first-last':
      user = l ? `${f}-${l}` : f;
      break;
    default:
      user = l ? `${f}.${l}` : f;
  }

  return `${user}@${normDomain}`;
}

/**
 * Generates an ordered, deduplicated list of probable email permutations
 * ordered strictly by real-world empirical frequency:
 * 1. first (42.0%)
 * 2. first.last (33.7%)
 * 3. firstlast (5.5%)
 * 4. flast (5.4%)
 * 5. last (3.6%)
 * 6. last.first (3.0%)
 * 7. first_last (3.0%)
 * 8. lastfirst (2.7%)
 * ...extended formats
 */
export function generatePermutations(
  firstName: string,
  lastName: string,
  website: string,
  existingEmail?: string,
  mode: PermutationMode = 'near_full'
): string[] {
  let domain = normalizeDomain(website);

  if (!domain && existingEmail && existingEmail.includes('@')) {
    domain = normalizeDomain(existingEmail);
  }

  let rawFn = (firstName || '').trim();
  let rawLn = (lastName || '').trim();

  // Split full name if entered only in first name
  if (rawFn && !rawLn && rawFn.includes(' ')) {
    const parts = rawFn.split(/\s+/);
    rawFn = parts[0];
    rawLn = parts.slice(1).join(' ');
  }
  // Split full name if entered only in last name
  else if (rawLn && !rawFn && rawLn.includes(' ')) {
    const parts = rawLn.split(/\s+/);
    rawFn = parts[0];
    rawLn = parts.slice(1).join(' ');
  }

  const f = sanitizeNamePart(rawFn);
  const l = sanitizeNamePart(rawLn);

  const permutations: string[] = [];

  // If a direct email was already provided, prioritize it
  if (existingEmail && existingEmail.includes('@')) {
    const cleanEmail = existingEmail.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      permutations.push(cleanEmail);
    }
  }

  if (domain && domain.includes('.')) {
    if (f && l) {
      const f1 = f.charAt(0);
      const l1 = l.charAt(0);

      // Top 4 patterns (Lean) -> 86.7% coverage
      const top4 = [
        `${f}@${domain}`,
        `${f}.${l}@${domain}`,
        `${f}${l}@${domain}`,
        `${f1}${l}@${domain}`,
      ];

      // Next 4 patterns -> brings coverage to 98.9% (Near-Full)
      const next4 = [
        `${l}@${domain}`,
        `${l}.${f}@${domain}`,
        `${f}_${l}@${domain}`,
        `${l}${f}@${domain}`,
      ];

      // Extended remaining patterns (Exhaustive)
      const extended = [
        `${f1}.${l}@${domain}`,
        `${f}${l1}@${domain}`,
        `${f}.${l1}@${domain}`,
        `${l1}${f}@${domain}`,
        `${l1}.${f}@${domain}`,
        `${l}${f1}@${domain}`,
        `${l}.${f1}@${domain}`,
        `${f}-${l}@${domain}`,
      ];

      if (mode === 'lean') {
        permutations.push(...top4);
      } else if (mode === 'near_full') {
        permutations.push(...top4, ...next4);
      } else {
        permutations.push(...top4, ...next4, ...extended);
      }
    } else if (f) {
      permutations.push(`${f}@${domain}`);
    } else if (l) {
      permutations.push(`${l}@${domain}`);
    }
  }

  // Deduplicate and filter out any malformed strings
  const validEmailRegex = /^[a-z0-9]+([._-][a-z0-9]+)*@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const email of permutations) {
    const lower = email.toLowerCase().trim();
    if (!seen.has(lower) && validEmailRegex.test(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }

  return result;
}
