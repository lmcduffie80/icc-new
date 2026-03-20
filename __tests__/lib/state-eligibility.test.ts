import { describe, it, expect } from 'vitest';
import {
  isProductEligibleForState,
  checkCartEligibility,
  getIneligibilityMessage,
} from '@/lib/state-eligibility';

describe('isProductEligibleForState', () => {
  it('should return true for eligible state', () => {
    expect(isProductEligibleForState(['CA', 'NY', 'TX'], 'CA')).toBe(true);
  });

  it('should return false for ineligible state', () => {
    expect(isProductEligibleForState(['CA', 'NY'], 'TX')).toBe(false);
  });

  it('should return true for products with no restrictions (empty array)', () => {
    expect(isProductEligibleForState([], 'TX')).toBe(true);
  });

  it('should return true for products with undefined approvedStates', () => {
    expect(isProductEligibleForState(undefined, 'TX')).toBe(true);
  });

  it('should return true for products with null approvedStates', () => {
    expect(isProductEligibleForState(null, 'TX')).toBe(true);
  });

  it('should handle case insensitivity for user state', () => {
    expect(isProductEligibleForState(['CA', 'NY'], 'ca')).toBe(true);
    expect(isProductEligibleForState(['CA', 'NY'], 'Ca')).toBe(true);
  });

  it('should handle case insensitivity for approved states', () => {
    expect(isProductEligibleForState(['ca', 'ny'], 'CA')).toBe(true);
  });
});

describe('checkCartEligibility', () => {
  const eligibleProduct = {
    id: '1',
    name: 'Eligible Product',
    approvedStates: ['CA', 'NY', 'TX'],
  };

  const ineligibleProduct = {
    id: '2',
    name: 'Ineligible Product',
    approvedStates: ['FL', 'GA'],
  };

  const noRestrictionsProduct = {
    id: '3',
    name: 'No Restrictions Product',
    approvedStates: [],
  };

  it('should return allEligible=true when all products are eligible', () => {
    const result = checkCartEligibility([eligibleProduct], 'CA');
    expect(result.allEligible).toBe(true);
    expect(result.eligibleProducts).toHaveLength(1);
    expect(result.ineligibleProducts).toHaveLength(0);
  });

  it('should return allEligible=false when some products are ineligible', () => {
    const result = checkCartEligibility(
      [eligibleProduct, ineligibleProduct],
      'CA'
    );
    expect(result.allEligible).toBe(false);
    expect(result.eligibleProducts).toHaveLength(1);
    expect(result.ineligibleProducts).toHaveLength(1);
    expect(result.ineligibleProducts[0].productName).toBe('Ineligible Product');
  });

  it('should return allEligible=false when all products are ineligible', () => {
    const result = checkCartEligibility(
      [eligibleProduct, ineligibleProduct],
      'WA'
    );
    expect(result.allEligible).toBe(false);
    expect(result.eligibleProducts).toHaveLength(0);
    expect(result.ineligibleProducts).toHaveLength(2);
  });

  it('should treat products with no restrictions as eligible', () => {
    const result = checkCartEligibility(
      [noRestrictionsProduct],
      'AnyState'
    );
    expect(result.allEligible).toBe(true);
    expect(result.eligibleProducts).toHaveLength(1);
  });

  it('should handle empty cart', () => {
    const result = checkCartEligibility([], 'CA');
    expect(result.allEligible).toBe(true);
    expect(result.eligibleProducts).toHaveLength(0);
    expect(result.ineligibleProducts).toHaveLength(0);
  });

  it('should correctly identify multiple ineligible products', () => {
    const anotherIneligible = {
      id: '4',
      name: 'Another Ineligible',
      approvedStates: ['WA', 'OR'],
    };
    const result = checkCartEligibility(
      [ineligibleProduct, anotherIneligible],
      'CA'
    );
    expect(result.allEligible).toBe(false);
    expect(result.ineligibleProducts).toHaveLength(2);
  });
});

describe('getIneligibilityMessage', () => {
  it('should return empty string when no ineligible products', () => {
    expect(getIneligibilityMessage([], 'CA')).toBe('');
  });

  it('should return singular message for one ineligible product', () => {
    const ineligible = [
      {
        productId: '1',
        productName: 'Test Product',
        approvedStates: ['NY'],
        isEligible: false,
      },
    ];
    const message = getIneligibilityMessage(ineligible, 'CA');
    expect(message).toContain('Test Product');
    expect(message).toContain('California');
    expect(message).toContain('is not approved for sale');
    expect(message).toContain('remove it from your cart');
  });

  it('should return plural message for multiple ineligible products', () => {
    const ineligible = [
      {
        productId: '1',
        productName: 'Product A',
        approvedStates: ['NY'],
        isEligible: false,
      },
      {
        productId: '2',
        productName: 'Product B',
        approvedStates: ['NY'],
        isEligible: false,
      },
    ];
    const message = getIneligibilityMessage(ineligible, 'TX');
    expect(message).toContain('Product A');
    expect(message).toContain('Product B');
    expect(message).toContain('Texas');
    expect(message).toContain('are not approved for sale');
    expect(message).toContain('remove them from your cart');
  });

  it('should convert state abbreviation to full name', () => {
    const ineligible = [
      {
        productId: '1',
        productName: 'Test Product',
        approvedStates: ['NY'],
        isEligible: false,
      },
    ];
    expect(getIneligibilityMessage(ineligible, 'CA')).toContain('California');
    expect(getIneligibilityMessage(ineligible, 'NY')).toContain('New York');
    expect(getIneligibilityMessage(ineligible, 'TX')).toContain('Texas');
  });

  it('should use abbreviation when state name not found', () => {
    const ineligible = [
      {
        productId: '1',
        productName: 'Test Product',
        approvedStates: ['NY'],
        isEligible: false,
      },
    ];
    // Invalid state abbreviation - should use it as-is
    expect(getIneligibilityMessage(ineligible, 'XX')).toContain('XX');
  });
});
