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

  // Basic domain sanity: must contain a dot and at least 2 characters on TLD
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
 * Generates an ordered, deduplicated list of probable email permutations
 * given a person's name and corporate domain.
 */
export function generatePermutations(
  firstName: string,
  lastName: string,
  website: string,
  existingEmail?: string
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

  // If a direct email was already provided and has valid syntax, test it first
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

      const patterns = [
        `${f}@${domain}`,
        `${f}.${l}@${domain}`,
        `${f}${l}@${domain}`,
        `${f1}${l}@${domain}`,
        `${f1}.${l}@${domain}`,
        `${f}${l1}@${domain}`,
        `${f}.${l1}@${domain}`,
        `${l}@${domain}`,
        `${l}.${f}@${domain}`,
        `${l}${f}@${domain}`,
        `${l1}${f}@${domain}`,
        `${l1}.${f}@${domain}`,
        `${l}${f1}@${domain}`,
        `${l}.${f1}@${domain}`,
        `${f}_${l}@${domain}`,
        `${f}-${l}@${domain}`,
      ];
      permutations.push(...patterns);
    } else if (f) {
      // Only first name available
      permutations.push(`${f}@${domain}`);
    } else if (l) {
      // Only last name available
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
