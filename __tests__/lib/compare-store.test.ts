import { describe, it, expect, beforeEach } from 'vitest';
import { useCompareStore, CompareProduct } from '@/lib/compare-store';

describe('compare store', () => {
  // Reset the store before each test
  beforeEach(() => {
    useCompareStore.getState().clearCompare();
  });

  const mockProduct1: CompareProduct = {
    id: '1',
    name: 'Product 1',
    price: '29.99',
    image: '/image1.jpg',
    category: 'herbicides',
  };

  const mockProduct2: CompareProduct = {
    id: '2',
    name: 'Product 2',
    price: '39.99',
    image: '/image2.jpg',
    category: 'herbicides',
  };

  const mockProduct3: CompareProduct = {
    id: '3',
    name: 'Product 3',
    price: '49.99',
    image: '/image3.jpg',
    category: 'fungicides',
  };

  const mockProduct4: CompareProduct = {
    id: '4',
    name: 'Product 4',
    price: '59.99',
    image: '/image4.jpg',
    category: 'insecticides',
  };

  describe('addProduct', () => {
    it('should add a product to compare list', () => {
      const { addProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(1);
      expect(products[0]).toEqual(mockProduct1);
    });

    it('should not add duplicate products', () => {
      const { addProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct1);
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(1);
    });

    it('should allow adding up to 3 products', () => {
      const { addProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(3);
    });

    it('should not allow adding more than 3 products', () => {
      const { addProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      addProduct(mockProduct4);
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(3);
      expect(products.find(p => p.id === '4')).toBeUndefined();
    });

    it('should maintain order of added products', () => {
      const { addProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      
      const products = useCompareStore.getState().products;
      expect(products[0].id).toBe('1');
      expect(products[1].id).toBe('2');
      expect(products[2].id).toBe('3');
    });
  });

  describe('removeProduct', () => {
    it('should remove a product from compare list', () => {
      const { addProduct, removeProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      removeProduct('1');
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe('2');
    });

    it('should not affect list if product does not exist', () => {
      const { addProduct, removeProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      removeProduct('nonexistent-id');
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(1);
    });

    it('should allow adding after removal', () => {
      const { addProduct, removeProduct } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      removeProduct('2');
      addProduct(mockProduct4);
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(3);
      expect(products.find(p => p.id === '4')).toBeDefined();
      expect(products.find(p => p.id === '2')).toBeUndefined();
    });
  });

  describe('clearCompare', () => {
    it('should remove all products from compare list', () => {
      const { addProduct, clearCompare } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      clearCompare();
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(0);
    });

    it('should work on empty compare list', () => {
      const { clearCompare } = useCompareStore.getState();
      
      clearCompare();
      
      const products = useCompareStore.getState().products;
      expect(products).toHaveLength(0);
    });
  });

  describe('isInCompare', () => {
    it('should return true if product is in compare list', () => {
      const { addProduct, isInCompare } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      
      expect(isInCompare('1')).toBe(true);
    });

    it('should return false if product is not in compare list', () => {
      const { addProduct, isInCompare } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      
      expect(isInCompare('2')).toBe(false);
    });

    it('should return false for empty compare list', () => {
      const { isInCompare } = useCompareStore.getState();
      
      expect(isInCompare('1')).toBe(false);
    });
  });

  describe('getCount', () => {
    it('should return 0 for empty compare list', () => {
      const { getCount } = useCompareStore.getState();
      
      expect(getCount()).toBe(0);
    });

    it('should return correct count', () => {
      const { addProduct, getCount } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      expect(getCount()).toBe(1);
      
      addProduct(mockProduct2);
      expect(getCount()).toBe(2);
      
      addProduct(mockProduct3);
      expect(getCount()).toBe(3);
    });

    it('should update count after removal', () => {
      const { addProduct, removeProduct, getCount } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      expect(getCount()).toBe(3);
      
      removeProduct('2');
      expect(getCount()).toBe(2);
    });
  });

  describe('canAddMore', () => {
    it('should return true when less than 3 products', () => {
      const { addProduct, canAddMore } = useCompareStore.getState();
      
      expect(canAddMore()).toBe(true);
      
      addProduct(mockProduct1);
      expect(canAddMore()).toBe(true);
      
      addProduct(mockProduct2);
      expect(canAddMore()).toBe(true);
    });

    it('should return false when 3 products are added', () => {
      const { addProduct, canAddMore } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      
      expect(canAddMore()).toBe(false);
    });

    it('should return true after removing from full list', () => {
      const { addProduct, removeProduct, canAddMore } = useCompareStore.getState();
      
      addProduct(mockProduct1);
      addProduct(mockProduct2);
      addProduct(mockProduct3);
      expect(canAddMore()).toBe(false);
      
      removeProduct('1');
      expect(canAddMore()).toBe(true);
    });
  });
});

