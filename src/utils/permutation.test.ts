import { describe, it, expect } from 'vitest';
import { normalizeDomain, sanitizeNamePart, generatePermutations } from './permutation';

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

describe('generatePermutations', () => {
  it('generates standard business email formats for first and last name', () => {
    const list = generatePermutations('Rohan', 'Patel', 'https://veriflow.io');
    expect(list).toContain('rohan@veriflow.io');
    expect(list).toContain('rohan.patel@veriflow.io');
    expect(list).toContain('rohanpatel@veriflow.io');
    expect(list).toContain('rpatel@veriflow.io');
    expect(list).toContain('r.patel@veriflow.io');
    expect(list).toContain('patel.rohan@veriflow.io');
    expect(list).toContain('rohan_patel@veriflow.io');
  });

  it('splits full name when passed entirely in firstName', () => {
    const list = generatePermutations('Satya Nadella', '', 'microsoft.com');
    expect(list).toContain('satya@microsoft.com');
    expect(list).toContain('satya.nadella@microsoft.com');
    expect(list).toContain('snadella@microsoft.com');
  });

  it('places existing valid email at the top of the test list', () => {
    const list = generatePermutations('Tim', 'Cook', 'apple.com', 'tcook@apple.com');
    expect(list[0]).toBe('tcook@apple.com');
  });

  it('does not produce duplicate or malformed addresses', () => {
    const list = generatePermutations('Dr. José', "O'Neil", 'acme.org');
    for (const email of list) {
      expect(email).not.toContain('..');
      expect(email).not.toContain("'");
      expect(email).toMatch(/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });
});
