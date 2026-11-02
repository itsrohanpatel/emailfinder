import { describe, it, expect } from 'vitest';
import {
  normalizeDomain,
  sanitizeNamePart,
  generatePermutations,
  generateRolePermutations,
  detectPattern,
  generateEmailByPattern,
  type PermutationMode,
} from './permutation';

describe('normalizeDomain', () => {
  it('strips protocols, www, query params, and paths', () => {
    expect(normalizeDomain('https://www.google.com/search?q=test')).toBe('google.com');
    expect(normalizeDomain('http://sub.domain.co.uk/path/file.html#hash')).toBe('sub.domain.co.uk');
  });

  it('extracts domain when given an email address', () => {
    expect(normalizeDomain('info@stripe.com')).toBe('stripe.com');
    expect(normalizeDomain('mailto:sales@microsoft.com')).toBe('microsoft.com');
  });

  it('handles empty or malformed input safely', () => {
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
    expect(normalizeDomain('localhost:3000')).toBe('localhost');
  });
});

describe('sanitizeNamePart', () => {
  it('strips diacritics and special characters', () => {
    expect(sanitizeNamePart('José')).toBe('jose');
    expect(sanitizeNamePart("O'Connor")).toBe('oconnor');
    expect(sanitizeNamePart('Jean-Luc')).toBe('jeanluc');
  });

  it('strips honorifics and degrees', () => {
    expect(sanitizeNamePart('Dr. John')).toBe('john');
    expect(sanitizeNamePart('Jane PhD')).toBe('jane');
    expect(sanitizeNamePart('Prof. Albert')).toBe('albert');
  });
});

describe('generatePermutations with modes', () => {
  it('near_full mode (default) returns top 8 probability-ordered patterns', () => {
    const list = generatePermutations('Shivani', 'Bajaj', 'marscosmetics.in', undefined, 'near_full');
    expect(list[0]).toBe('shivani@marscosmetics.in'); // first (42%)
    expect(list[1]).toBe('shivani.bajaj@marscosmetics.in'); // first.last (33.7%)
    expect(list[2]).toBe('shivanibajaj@marscosmetics.in'); // firstlast (5.5%)
    expect(list[3]).toBe('sbajaj@marscosmetics.in'); // flast (5.4%)
    expect(list[4]).toBe('bajaj@marscosmetics.in'); // last (3.6%)
    expect(list[5]).toBe('bajaj.shivani@marscosmetics.in'); // last.first (3.0%)
    expect(list[6]).toBe('shivani_bajaj@marscosmetics.in'); // first_last (3.0%)
    expect(list[7]).toBe('bajajshivani@marscosmetics.in'); // lastfirst (2.7%)
    expect(list.length).toBe(8);
  });

  it('lean mode returns exactly top 4 patterns', () => {
    const list = generatePermutations('Shivani', 'Bajaj', 'marscosmetics.in', undefined, 'lean');
    expect(list.length).toBe(4);
    expect(list).toEqual([
      'shivani@marscosmetics.in',
      'shivani.bajaj@marscosmetics.in',
      'shivanibajaj@marscosmetics.in',
      'sbajaj@marscosmetics.in',
    ]);
  });

  it('exhaustive mode returns all 16 permutations', () => {
    const list = generatePermutations('Shivani', 'Bajaj', 'marscosmetics.in', undefined, 'exhaustive');
    expect(list.length).toBeGreaterThan(10);
  });
});

describe('detectPattern & generateEmailByPattern', () => {
  it('handles single-letter last initial with exactly 3 unique patterns and zero duplicates', () => {
    const list = generatePermutations('Maggie', 'W', 'advocatehealth.org', undefined, 'near_full');
    expect(list).toHaveLength(3);
    expect(list).toEqual([
      'maggie.w@advocatehealth.org',
      'maggiew@advocatehealth.org',
      'maggie@advocatehealth.org',
    ]);
  });

  it('generates role permutations hr@ and careers@', () => {
    const roles = generateRolePermutations('advocatehealth.org');
    expect(roles).toEqual(['hr@advocatehealth.org', 'careers@advocatehealth.org']);
  });

  it('detects pattern correctly from verified email', () => {
    expect(detectPattern('shivani.bajaj', 'Shivani', 'Bajaj')).toBe('first.last');
    expect(detectPattern('shivani', 'Shivani', 'Bajaj')).toBe('first');
    expect(detectPattern('sbajaj', 'Shivani', 'Bajaj')).toBe('flast');
    expect(detectPattern('shivanibajaj', 'Shivani', 'Bajaj')).toBe('firstlast');
    expect(detectPattern('bajaj', 'Shivani', 'Bajaj')).toBe('last');
    expect(detectPattern('bajaj.shivani', 'Shivani', 'Bajaj')).toBe('last.first');
    expect(detectPattern('smith', '', 'Smith')).toBe('last');
    expect(detectPattern('jsmith', 'J', 'Smith')).toBe('flast');
  });

  it('handles missing first or last name in generateEmailByPattern safely without leading dots', () => {
    expect(generateEmailByPattern('', 'Smith', 'example.com', 'first.last')).toBe('smith@example.com');
    expect(generateEmailByPattern('John', '', 'example.com', 'first.last')).toBe('john@example.com');
  });

  it('handles honorifics and full name in single name field safely', () => {
    const list = generatePermutations('Dr. John Doe', '', 'example.com', undefined, 'lean');
    expect(list).toContain('john.doe@example.com');
    expect(list).toContain('john@example.com');
  });

  it('generates email string deterministically from pattern', () => {
    expect(generateEmailByPattern('Shivani', 'Bajaj', 'marscosmetics.in', 'first.last')).toBe(
      'shivani.bajaj@marscosmetics.in'
    );
    expect(generateEmailByPattern('Shivani', 'Bajaj', 'marscosmetics.in', 'first')).toBe(
      'shivani@marscosmetics.in'
    );
    expect(generateEmailByPattern('Shivani', 'Bajaj', 'marscosmetics.in', 'flast')).toBe(
      'sbajaj@marscosmetics.in'
    );
  });
});
