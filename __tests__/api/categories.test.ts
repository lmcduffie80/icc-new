import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/categories/route';
import { parseJsonResponse } from './helpers/request-helpers';

// Mock the database with vi.hoisted
const { mockQueryOne } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: mockQueryOne,
  pool: {},
}));

const DEFAULT_CATEGORIES = [
  'Herbicides',
  'Fungicides',
  'Insecticides',
  'Plant-Growth Regulators',
  'Adjuvants',
];

describe('GET /api/categories', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
  });

  describe('success cases', () => {
    it('should return categories from database when available', async () => {
      const customCategories = ['Custom Cat 1', 'Custom Cat 2', 'Custom Cat 3'];

      mockQueryOne.mockResolvedValue({
        key: 'categories',
        value: { categories: customCategories },
      });

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('categories');
      expect(data.categories).toEqual(customCategories);
    });

    it('should return default categories when setting not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('categories');
      expect(data.categories).toEqual(DEFAULT_CATEGORIES);
    });

    it('should return default categories when value is empty', async () => {
      mockQueryOne.mockResolvedValue({
        key: 'categories',
        value: {},
      });

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.categories).toEqual(DEFAULT_CATEGORIES);
    });

    it('should return default categories when value.categories is null', async () => {
      mockQueryOne.mockResolvedValue({
        key: 'categories',
        value: { categories: null },
      });

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.categories).toEqual(DEFAULT_CATEGORIES);
    });

    it('should return empty array when value.categories is empty array', async () => {
      mockQueryOne.mockResolvedValue({
        key: 'categories',
        value: { categories: [] },
      });

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      // Empty array is truthy in JS, so it's returned as-is
      expect(data.categories).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return default categories when database query fails', async () => {
      mockQueryOne.mockRejectedValue(new Error('Database error'));

      const response = await GET();
      const data = await parseJsonResponse(response);

      // Should gracefully fall back to defaults instead of returning an error
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('categories');
      expect(data.categories).toEqual(DEFAULT_CATEGORIES);
    });

    it('should return default categories when database connection times out', async () => {
      mockQueryOne.mockRejectedValue(new Error('Connection timeout'));

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.categories).toEqual(DEFAULT_CATEGORIES);
    });
  });

  describe('default categories', () => {
    it('should have the correct default categories', async () => {
      mockQueryOne.mockResolvedValue(null);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(data.categories).toContain('Herbicides');
      expect(data.categories).toContain('Fungicides');
      expect(data.categories).toContain('Insecticides');
      expect(data.categories).toContain('Plant-Growth Regulators');
      expect(data.categories).toContain('Adjuvants');
      expect(data.categories).toHaveLength(5);
    });
  });

  describe('public access', () => {
    it('should not require authentication', async () => {
      mockQueryOne.mockResolvedValue(null);

      // The endpoint doesn't check for authentication
      const response = await GET();

      expect(response.status).toBe(200);
    });
  });
});
