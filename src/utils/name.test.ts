import { describe, it, expect } from 'vitest';
import { parseFullName } from './name';

describe('parseFullName', () => {
  it('handles standard two-word names (1 gap)', () => {
    expect(parseFullName('Shivani Bajaj')).toEqual({
      firstName: 'Shivani',
      lastName: 'Bajaj',
    });
    expect(parseFullName('Brian Chesky')).toEqual({
      firstName: 'Brian',
      lastName: 'Chesky',
    });
  });

  it('handles names with multiple gaps (drops middle names and retains first and last word only)', () => {
    expect(parseFullName('Vijaykumar Patiram Yadav')).toEqual({
      firstName: 'Vijaykumar',
      lastName: 'Yadav',
    });
    expect(parseFullName('John Michael Robert Doe')).toEqual({
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(parseFullName('Mary Ann Elizabeth Smith')).toEqual({
      firstName: 'Mary',
      lastName: 'Smith',
    });
  });

  it('handles irregular whitespace and multiple spaces between words', () => {
    expect(parseFullName('  Alex    James    Smith  ')).toEqual({
      firstName: 'Alex',
      lastName: 'Smith',
    });
  });

  it('handles single-word names', () => {
    expect(parseFullName('Cher')).toEqual({
      firstName: 'Cher',
      lastName: '',
    });
    expect(parseFullName('Prince')).toEqual({
      firstName: 'Prince',
      lastName: '',
    });
  });

  it('handles empty or blank inputs', () => {
    expect(parseFullName('')).toEqual({
      firstName: '',
      lastName: '',
    });
    expect(parseFullName('   ')).toEqual({
      firstName: '',
      lastName: '',
    });
  });
});

