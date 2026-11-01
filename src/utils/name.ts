/**
 * Parses full name strings into first and last name according to business rules:
 * If there is 1 gap, firstName is word 1, lastName is word 2.
 * If there are more than 1 gap (3+ words), firstName is the first word and lastName
 * is the last word; all intermediate middle names are excluded.
 */
export function parseFullName(raw: string): { firstName: string; lastName: string } {
  if (!raw) return { firstName: '', lastName: '' };
  const clean = String(raw).trim();
  if (!clean) return { firstName: '', lastName: '' };

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '' };

  return {
    firstName: tokens[0],
    lastName: tokens[tokens.length - 1],
  };
}

