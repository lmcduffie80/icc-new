import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn utility function', () => {
  it('should merge class names correctly', () => {
    const result = cn('text-red-500', 'bg-blue-500');
    expect(result).toBe('text-red-500 bg-blue-500');
  });

  it('should handle conditional class names', () => {
    const result = cn('base-class', false && 'not-included', 'included');
    expect(result).toBe('base-class included');
  });

  it('should handle Tailwind class conflicts by preferring later classes', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('should handle empty inputs', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('should handle undefined and null values', () => {
    const result = cn('text-red-500', undefined, null, 'bg-blue-500');
    expect(result).toBe('text-red-500 bg-blue-500');
  });

  it('should handle arrays of class names', () => {
    const result = cn(['text-red-500', 'bg-blue-500'], 'p-4');
    expect(result).toBe('text-red-500 bg-blue-500 p-4');
  });

  it('should handle objects with boolean values', () => {
    const result = cn({
      'text-red-500': true,
      'bg-blue-500': false,
      'p-4': true,
    });
    expect(result).toBe('text-red-500 p-4');
  });
});

