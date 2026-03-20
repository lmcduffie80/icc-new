import { describe, it, expect } from 'vitest';
import { zipToState } from '@/lib/zip-to-state';

describe('zipToState', () => {
  it('returns GA for Georgia ZIP 31794', () => {
    expect(zipToState('31794')).toBe('GA');
  });

  it('returns IL for Illinois ZIP 60001', () => {
    expect(zipToState('60001')).toBe('IL');
  });

  it('returns IA for Iowa ZIP 50001', () => {
    expect(zipToState('50001')).toBe('IA');
  });

  it('returns TX for Texas ZIP 75001', () => {
    expect(zipToState('75001')).toBe('TX');
  });

  it('handles ZIP+4 format', () => {
    expect(zipToState('31794-1234')).toBe('GA');
  });

  it('returns null for too-short input', () => {
    expect(zipToState('31')).toBe(null);
  });

  it('strips non-digits and uses first 3 chars', () => {
    expect(zipToState('31794')).toBe('GA');
    expect(zipToState('317 94')).toBe('GA');
  });
});
