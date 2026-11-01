import { describe, it, expect } from 'vitest';
import { computePreFlightEstimate } from '../Store';
import { Contact, ApiKey } from '../types';

describe('computePreFlightEstimate', () => {
  const mockKeys: ApiKey[] = [
    {
      token: 'key1',
      label: 'Key 1',
      creditsRemaining: 1.82,
      status: 'active',
    },
    {
      token: 'key2',
      label: 'Key 2',
      creditsRemaining: 4.43,
      status: 'active',
    },
  ];

  const makeMockContacts = (count: number): Contact[] => {
    return Array.from({ length: count }, (_, idx) => ({
      id: idx + 1,
      firstName: `User${idx}`,
      lastName: `Test${idx}`,
      website: `company${idx}.com`,
      email: '',
      status: 'pending',
      originalData: {},
    }));
  };

  it('calculates expected and worst case costs accurately for 100 leads', () => {
    const contacts = makeMockContacts(100);
    const estimate = computePreFlightEstimate(contacts, mockKeys, 'near_full');

    expect(estimate.totalContacts).toBe(100);
    // 100 leads * 2.0 avg calls = 200 calls
    expect(estimate.expectedCalls).toBe(200);
    // 200 * $0.00089 = $0.178 USD
    expect(estimate.expectedCostUsd).toBeCloseTo(0.178, 3);
    // Total available credits: 1.82 + 4.43 = 6.25
    expect(estimate.availableCreditsUsd).toBe(6.25);
    expect(estimate.isSufficient).toBe(true);
    expect(estimate.shortageUsd).toBe(0);
    expect(estimate.recommendedKeysToAdd).toBe(0);
  });

  it('correctly detects balance shortage and recommends adding keys', () => {
    const lowCreditsKeys: ApiKey[] = [
      {
        token: 'key1',
        label: 'Low Key',
        creditsRemaining: 0.5,
        status: 'active',
      },
    ];

    // 5000 contacts: expected calls = 10,000 * 0.00089 = $8.90 USD
    const contacts = makeMockContacts(5000);
    const estimate = computePreFlightEstimate(contacts, lowCreditsKeys, 'near_full');

    expect(estimate.totalContacts).toBe(5000);
    expect(estimate.expectedCostUsd).toBeCloseTo(8.9, 1);
    expect(estimate.isSufficient).toBe(false);
    expect(estimate.shortageUsd).toBeGreaterThan(8.0);
    // Deficit of ~$8.40 requires 2 additional free keys ($5.00 each)
    expect(estimate.recommendedKeysToAdd).toBe(2);
  });

  it('ignores exhausted and invalid keys when computing available budget', () => {
    const mixedKeys: ApiKey[] = [
      {
        token: 'key1',
        label: 'Exhausted Key',
        creditsRemaining: 0,
        status: 'exhausted',
      },
      {
        token: 'key2',
        label: 'Active Key',
        creditsRemaining: 2.5,
        status: 'active',
      },
      {
        token: 'key3',
        label: 'Invalid Key',
        creditsRemaining: 0,
        status: 'invalid',
      },
    ];

    const contacts = makeMockContacts(50);
    const estimate = computePreFlightEstimate(contacts, mixedKeys, 'near_full');

    expect(estimate.availableCreditsUsd).toBe(2.5);
  });
});
