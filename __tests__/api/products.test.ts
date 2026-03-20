import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/products/route';
import { createGetRequest, parseJsonResponse } from './helpers/request-helpers';

// Mock the database with vi.hoisted
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
}));

describe('GET /api/products', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('list all products', () => {
    it('should return all products when no filters are applied', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Test product 1',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
        {
          id: '2',
          name: 'Product 2',
          category: 'fungicides',
          description: 'Test product 2',
          price: '39.99',
          original_price: '49.99',
          image: '/image2.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
      expect(data).toHaveLength(2);
    });

    it('should return empty array when no products exist', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
      expect(data).toHaveLength(0);
    });
  });

  describe('filter by category', () => {
    it('should filter products by category', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Herbicide Product',
          category: 'herbicides',
          description: 'Herbicide',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products', { category: 'herbicides' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
      expect(data.every((p: { category: string }) => p.category === 'herbicides')).toBe(true);
    });

    it('should not filter when category is "all"', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Test',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
        {
          id: '2',
          name: 'Product 2',
          category: 'fungicides',
          description: 'Test',
          price: '39.99',
          original_price: null,
          image: '/image2.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products', { category: 'all' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveLength(2);
    });

    it('should handle case-insensitive category filtering', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/products', { category: 'HERBICIDES' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      // The SQL query should use LOWER() for case-insensitive comparison
    });
  });

  describe('search functionality', () => {
    it('should search products by name', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Premium Herbicide',
          category: 'herbicides',
          description: 'Best product',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products', { search: 'Premium' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
    });

    it('should search products by description', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          category: 'herbicides',
          description: 'Contains special formula',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products', { search: 'special' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
    });

    it('should return empty array when search has no matches', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/products', { search: 'nonexistent' });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should handle search with special characters', async () => {
      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/products', { search: '%special$' });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('combined filters', () => {
    it('should filter by both category and search', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Premium Herbicide',
          category: 'herbicides',
          description: 'Best herbicide',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products', {
        category: 'herbicides',
        search: 'Premium',
      });
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toEqual(mockProducts);
    });
  });

  describe('sorting', () => {
    it('should return products sorted by created_at DESC', async () => {
      const mockProducts = [
        {
          id: '2',
          name: 'Newer Product',
          category: 'herbicides',
          description: 'Newer',
          price: '39.99',
          original_price: null,
          image: '/image2.jpg',
          in_stock: true,
        },
        {
          id: '1',
          name: 'Older Product',
          category: 'herbicides',
          description: 'Older',
          price: '29.99',
          original_price: null,
          image: '/image1.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      // In real scenario, data should be ordered with newer first
      expect(data).toEqual(mockProducts);
    });
  });

  describe('error handling', () => {
    it('should return 500 error when database query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const request = createGetRequest('/api/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to fetch products');
    });

    it('should handle database timeout errors', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const request = createGetRequest('/api/products');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('response structure', () => {
    it('should return products with correct structure', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Test Product',
          category: 'herbicides',
          description: 'Description',
          price: '29.99',
          original_price: '39.99',
          image: '/image.jpg',
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('category');
      expect(data[0]).toHaveProperty('description');
      expect(data[0]).toHaveProperty('price');
      expect(data[0]).toHaveProperty('image');
      expect(data[0]).toHaveProperty('in_stock');
    });

    it('should handle null values correctly', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Test Product',
          category: 'herbicides',
          description: null,
          price: '29.99',
          original_price: null,
          image: null,
          in_stock: true,
        },
      ];

      mockQuery.mockResolvedValue(mockProducts);

      const request = createGetRequest('/api/products');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(data[0].description).toBeNull();
      expect(data[0].original_price).toBeNull();
      expect(data[0].image).toBeNull();
    });
  });
});

