import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, CartItem } from '@/lib/cart-store';

describe('cart store', () => {
  // Reset the store before each test
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  const mockProduct: Omit<CartItem, 'quantity'> = {
    id: '1',
    name: 'Test Product',
    price: '29.99',
    image: '/test-image.jpg',
    inStock: true,
  };

  const mockProduct2: Omit<CartItem, 'quantity'> = {
    id: '2',
    name: 'Test Product 2',
    price: '49.99',
    image: '/test-image-2.jpg',
    inStock: true,
  };

  describe('addItem', () => {
    it('should add a new item to the cart', () => {
      const { addItem } = useCartStore.getState();
      
      addItem(mockProduct);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0]).toEqual({ ...mockProduct, quantity: 1 });
    });

    it('should add item with custom quantity', () => {
      const { addItem } = useCartStore.getState();
      
      addItem({ ...mockProduct, quantity: 3 });
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems[0].quantity).toBe(3);
    });

    it('should increment quantity if item already exists', () => {
      const { addItem } = useCartStore.getState();
      
      addItem(mockProduct);
      addItem(mockProduct);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0].quantity).toBe(2);
    });

    it('should add custom quantity to existing item', () => {
      const { addItem } = useCartStore.getState();
      
      addItem({ ...mockProduct, quantity: 2 });
      addItem({ ...mockProduct, quantity: 3 });
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0].quantity).toBe(5);
    });

    it('should add multiple different items', () => {
      const { addItem } = useCartStore.getState();
      
      addItem(mockProduct);
      addItem(mockProduct2);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(2);
    });
  });

  describe('removeItem', () => {
    it('should remove an item from the cart', () => {
      const { addItem, removeItem } = useCartStore.getState();
      
      addItem(mockProduct);
      addItem(mockProduct2);
      removeItem('1');
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0].id).toBe('2');
    });

    it('should not affect cart if item does not exist', () => {
      const { addItem, removeItem } = useCartStore.getState();
      
      addItem(mockProduct);
      removeItem('nonexistent-id');
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(1);
    });
  });

  describe('updateQuantity', () => {
    it('should update item quantity', () => {
      const { addItem, updateQuantity } = useCartStore.getState();
      
      addItem(mockProduct);
      updateQuantity('1', 5);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems[0].quantity).toBe(5);
    });

    it('should remove item if quantity is set to 0', () => {
      const { addItem, updateQuantity } = useCartStore.getState();
      
      addItem(mockProduct);
      updateQuantity('1', 0);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(0);
    });

    it('should remove item if quantity is negative', () => {
      const { addItem, updateQuantity } = useCartStore.getState();
      
      addItem(mockProduct);
      updateQuantity('1', -1);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(0);
    });

    it('should not affect other items', () => {
      const { addItem, updateQuantity } = useCartStore.getState();
      
      addItem(mockProduct);
      addItem(mockProduct2);
      updateQuantity('1', 3);
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems[0].quantity).toBe(3);
      expect(currentItems[1].quantity).toBe(1);
    });
  });

  describe('clearCart', () => {
    it('should remove all items from cart', () => {
      const { addItem, clearCart } = useCartStore.getState();
      
      addItem(mockProduct);
      addItem(mockProduct2);
      clearCart();
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(0);
    });

    it('should work on empty cart', () => {
      const { clearCart } = useCartStore.getState();
      
      clearCart();
      
      const currentItems = useCartStore.getState().items;
      expect(currentItems).toHaveLength(0);
    });
  });

  describe('getTotalItems', () => {
    it('should return 0 for empty cart', () => {
      const { getTotalItems } = useCartStore.getState();
      
      const total = getTotalItems();
      
      expect(total).toBe(0);
    });

    it('should return correct total for single item', () => {
      const { addItem, getTotalItems } = useCartStore.getState();
      
      addItem({ ...mockProduct, quantity: 3 });
      const total = getTotalItems();
      
      expect(total).toBe(3);
    });

    it('should return sum of all item quantities', () => {
      const { addItem, getTotalItems } = useCartStore.getState();
      
      addItem({ ...mockProduct, quantity: 2 });
      addItem({ ...mockProduct2, quantity: 3 });
      const total = getTotalItems();
      
      expect(total).toBe(5);
    });
  });

  describe('getSubtotal', () => {
    it('should return 0 for empty cart', () => {
      const { getSubtotal } = useCartStore.getState();
      
      const subtotal = getSubtotal();
      
      expect(subtotal).toBe(0);
    });

    it('should calculate subtotal for single item', () => {
      const { addItem, getSubtotal } = useCartStore.getState();
      
      addItem({ ...mockProduct, quantity: 2 });
      const subtotal = getSubtotal();
      
      expect(subtotal).toBe(59.98); // 29.99 * 2
    });

    it('should calculate subtotal for multiple items', () => {
      const { addItem, getSubtotal } = useCartStore.getState();
      
      addItem({ ...mockProduct, quantity: 2 }); // 29.99 * 2 = 59.98
      addItem({ ...mockProduct2, quantity: 1 }); // 49.99 * 1 = 49.99
      const subtotal = getSubtotal();
      
      expect(subtotal).toBeCloseTo(109.97, 2);
    });

    it('should handle decimal prices correctly', () => {
      const { addItem, getSubtotal } = useCartStore.getState();
      
      const decimalProduct = { ...mockProduct, price: '9.99' };
      addItem({ ...decimalProduct, quantity: 3 });
      const subtotal = getSubtotal();
      
      expect(subtotal).toBeCloseTo(29.97, 2);
    });
  });
});

