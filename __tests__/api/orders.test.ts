import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/orders/route';
import { createGetRequest, createPostRequest, parseJsonResponse } from './helpers/request-helpers';
import { createMockSession } from './helpers/auth-mock';

// Mock Stripe to avoid initialization error
const { mockGetPaymentIntent } = vi.hoisted(() => ({
  mockGetPaymentIntent: vi.fn().mockResolvedValue({
    id: 'pi_test_123',
    status: 'succeeded',
    amount: 11500,
    currency: 'usd',
    customer: 'cus_test_123',
    payment_method: 'pm_test_123',
    metadata: {
      userId: 'test-user-id',
      deliveryFee: '5.00',
      tax: '10.00',
      deliveryMethod: 'standard',
    },
  }),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      retrieve: vi.fn(),
    },
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  getPaymentIntent: mockGetPaymentIntent,
  createOrGetStripeCustomer: vi.fn(),
  createPaymentIntent: vi.fn(),
  attachPaymentMethod: vi.fn().mockResolvedValue(undefined),
  detachPaymentMethod: vi.fn(),
  setDefaultPaymentMethod: vi.fn(),
  listPaymentMethods: vi.fn(),
  createSetupIntent: vi.fn(),
}));

// Mock the database and auth with vi.hoisted
const { mockQuery, mockQueryOne, mockGetSession, mockValidateOrder, mockReserveInventory } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockGetSession: vi.fn(),
  mockValidateOrder: vi.fn(),
  mockReserveInventory: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  pool: {},
}));

vi.mock('@/lib/order-validation', () => ({
  validateOrder: mockValidateOrder,
  reserveInventory: mockReserveInventory,
  detectSuspiciousPatterns: vi.fn().mockReturnValue({ suspicious: false, reasons: [] }),
}));

vi.mock('@/lib/shipping-calculation', () => ({
  calculateShippingFee: vi.fn().mockReturnValue(9.99), // Match the test's delivery fee
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mockGetSession(),
    },
  },
}));

describe('GET /api/orders', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return user orders with items', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockOrders = [
        {
          id: 'order-1',
          user_id: 'user-123',
          order_number: 'ORD-123',
          status: 'pending',
          shipping_address: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            address2: '',
            city: 'Portland',
            state: 'OR',
            zipCode: '97201',
            phone: '555-1234',
            email: 'john@example.com',
          },
          billing_address: {},
          delivery_method: 'standard',
          delivery_fee: '5.00',
          subtotal: '100.00',
          tax: '10.00',
          total: '115.00',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      const mockOrderItems = [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_id: 'prod-1',
          name: 'Product 1',
          price: '50.00',
          quantity: 2,
          image: '/image1.jpg',
        },
      ];

      mockQuery
        .mockResolvedValueOnce(mockOrders) // First call for orders
        .mockResolvedValueOnce(mockOrderItems); // Second call for order items

      const request = createGetRequest('/api/orders');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('orders');
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0]).toHaveProperty('orderNumber', 'ORD-123');
      expect(data.orders[0]).toHaveProperty('items');
      expect(data.orders[0].items).toHaveLength(1);
    });

    it('should return empty orders array when user has no orders', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValue([]);

      const request = createGetRequest('/api/orders');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.orders).toEqual([]);
    });

    it('should sort orders by created_at DESC', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      const mockOrders = [
        {
          id: 'order-2',
          user_id: 'user-123',
          order_number: 'ORD-456',
          status: 'pending',
          shipping_address: {},
          billing_address: {},
          delivery_method: 'standard',
          delivery_fee: '5.00',
          subtotal: '50.00',
          tax: '5.00',
          total: '60.00',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'order-1',
          user_id: 'user-123',
          order_number: 'ORD-123',
          status: 'completed',
          shipping_address: {},
          billing_address: {},
          delivery_method: 'express',
          delivery_fee: '10.00',
          subtotal: '100.00',
          tax: '10.00',
          total: '120.00',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockQuery
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const request = createGetRequest('/api/orders');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.orders[0].orderNumber).toBe('ORD-456');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createGetRequest('/api/orders');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ session: {}, user: null });

      const request = createGetRequest('/api/orders');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockRejectedValue(new Error('Database error'));

      const request = createGetRequest('/api/orders');
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to fetch orders');
    });
  });
});

describe('POST /api/orders', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
    mockValidateOrder.mockReset();
    mockReserveInventory.mockReset();
    mockGetPaymentIntent.mockReset();
    
    // Default mock for getPaymentIntent (9.99 matches standard shipping price)
    // userId 'test-user-id' matches createMockSession() default
    mockGetPaymentIntent.mockResolvedValue({
      id: 'pi_test_123',
      status: 'succeeded',
      amount: 11999, // 100.00 (subtotal) + 9.99 (delivery) + 10.00 (tax)
      currency: 'usd',
      customer: 'cus_test_123',
      payment_method: 'pm_test_123',
      metadata: {
        userId: 'test-user-id',
        deliveryFee: '9.99',
        tax: '10.00',
        deliveryMethod: 'standard',
      },
    });
    
    // Default mock for validateOrder to return valid
    // Note: items will be populated based on the actual request
    mockValidateOrder.mockImplementation(async (pool, items, clientTotal) => ({
      valid: true,
      items: items.map((item: { productId: string; quantity: number; price: number }) => ({
        ...item,
        actualPrice: item.price,
        priceMatch: true,
        inventory: 100,
        inventoryAvailable: true,
      })),
      clientTotal,
      serverTotal: clientTotal,
      priceMismatch: false,
      inventoryIssues: false,
      hasRestrictedProducts: false,
      errors: [],
      warnings: [],
    }));
    
    // Default mock for reserveInventory
    mockReserveInventory.mockResolvedValue({ success: true, errors: [] });
  });

  describe('successful order creation', () => {
    it('should create order with valid data', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // Override payment intent mock to match this user
      mockGetPaymentIntent.mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
        amount: 11999, // 100.00 (subtotal) + 9.99 (delivery) + 10.00 (tax)
        currency: 'usd',
        customer: 'cus_test_123',
        payment_method: 'pm_test_123',
        metadata: {
          userId: 'user-123',
          deliveryFee: '9.99',
          tax: '10.00',
          deliveryMethod: 'standard',
        },
      });

      const mockOrder = {
        id: 'order-1',
        user_id: 'user-123',
        order_number: 'ORD-ABC123',
        status: 'pending',
        shipping_address: {},
        billing_address: {},
        delivery_method: 'standard',
        delivery_fee: '9.99',
        subtotal: '100.00',
        tax: '10.00',
        total: '119.99',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock product unit_of_measure lookup and order creation
      const mockProduct = { unit_of_measure: 'case', name: 'Product 1' };
      mockQueryOne
        .mockResolvedValueOnce(mockProduct)   // Product unit_of_measure lookup
        .mockResolvedValueOnce(mockOrder);     // Order creation
      mockQuery.mockResolvedValue([]);  // Warehouse inventory query

      const requestBody = {
        items: [
          {
            productId: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Product 1',
            price: 50.00,
            image: 'https://example.com/image.jpg',
            quantity: 2,
          },
        ],
        shippingAddress: {
          line1: '123 Main St',
          line2: '',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
          country: 'US',
        },
        billingAddress: {
          line1: '123 Main St',
          line2: '',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
          country: 'US',
        },
        email: 'john@example.com',
        phone: '+15551234567',
        paymentIntentId: 'pi_test_123',
        savePaymentMethod: false,
        invoiceMetadata: {
          invoice_url: 'https://example.com/invoice.pdf',
          invoice_state: 'OR',
          invoice_uploaded_at: '2024-01-01T00:00:00Z',
          invoice_filename: 'test-invoice.pdf',
          invoice_file_type: 'application/pdf',
        },
        notes: '',
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('order');
      expect(data.order).toHaveProperty('id');
      expect(data.order).toHaveProperty('orderNumber');
    });

    it('should generate unique order number', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      const mockOrder = {
        id: 'order-1',
        user_id: 'user-123',
        order_number: 'ORD-UNIQUE',
        status: 'pending',
        shipping_address: {},
        billing_address: {},
        delivery_method: 'standard',
        delivery_fee: '9.99',
        subtotal: '100.00',
        tax: '10.00',
        total: '119.99',
        metadata: {
          invoice_url: 'https://example.com/invoice.pdf',
          invoice_state: 'ST',
          invoice_uploaded_at: '2024-01-01T00:00:00Z',
          invoice_filename: 'test-invoice.pdf',
          invoice_file_type: 'application/pdf',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock product unit_of_measure lookup and order creation
      const mockProduct = { unit_of_measure: 'case', name: 'Test Product' };
      mockQueryOne
        .mockResolvedValueOnce(mockProduct)  // Product unit_of_measure lookup
        .mockResolvedValueOnce(mockOrder);    // Order creation
      mockQuery.mockResolvedValue([]);  // Warehouse inventory query

      const requestBody = {
        items: [{ productId: '550e8400-e29b-41d4-a716-446655440000', name: 'Test', price: 50.00, image: 'https://example.com/img.jpg', quantity: 1 }],
        shippingAddress: {
          line1: '123 St',
          line2: '',
          city: 'City',
          state: 'ST',
          zipCode: '12345',
          country: 'US',
        },
        billingAddress: {
          line1: '123 St',
          line2: '',
          city: 'City',
          state: 'ST',
          zipCode: '12345',
          country: 'US',
        },
        email: 'test@test.com',
        phone: '+15555555555',
        paymentIntentId: 'pi_test_123',
        savePaymentMethod: false,
        invoiceMetadata: {
          invoice_url: 'https://example.com/invoice.pdf',
          invoice_state: 'ST',
          invoice_uploaded_at: '2024-01-01T00:00:00Z',
          invoice_filename: 'test-invoice.pdf',
          invoice_file_type: 'application/pdf',
        },
        notes: '',
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.order.orderNumber).toMatch(/^ORD-/);
    });
  });

  describe('validation', () => {
    it('should return 400 when items are missing', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      const requestBody = {
        shippingAddress: {},
        deliveryMethod: 'standard',
        deliveryFee: 5.0,
        subtotal: 100.0,
        tax: 10.0,
        total: 115.0,
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when items array is empty', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      const requestBody = {
        items: [],
        shippingAddress: {},
        deliveryMethod: 'standard',
        deliveryFee: 5.0,
        subtotal: 0,
        tax: 0,
        total: 0,
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when shippingAddress is missing', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      const requestBody = {
        items: [{ id: '1', name: 'Test', price: '50.00', image: 'https://example.com/img.jpg', quantity: 1 }],
        deliveryMethod: 'standard',
        deliveryFee: 5.0,
        subtotal: 50.0,
        tax: 5.0,
        total: 60.0,
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should return 400 when deliveryMethod is missing', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      const requestBody = {
        items: [{ id: '1', name: 'Test', price: '50.00', image: 'https://example.com/img.jpg', quantity: 1 }],
        shippingAddress: {},
        deliveryFee: 5.0,
        subtotal: 50.0,
        tax: 5.0,
        total: 60.0,
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const requestBody = {
        items: [{ id: '1', name: 'Test', price: '50.00', image: 'https://example.com/img.jpg', quantity: 1 }],
        shippingAddress: {},
        billingAddress: {},
        deliveryMethod: 'standard',
        deliveryFee: 5.0,
        subtotal: 50.0,
        tax: 5.0,
        total: 60.0,
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when order creation fails', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      // First call: product unit_of_measure lookup
      // Second call: order creation throws
      const mockProduct = { unit_of_measure: 'case', name: 'Test Product' };
      mockQueryOne
        .mockResolvedValueOnce(mockProduct)  // Product lookup
        .mockRejectedValueOnce(new Error('Database error'));  // Order creation fails
      mockQuery.mockResolvedValue([]);  // Warehouse inventory query

      const requestBody = {
        items: [{ productId: '550e8400-e29b-41d4-a716-446655440000', name: 'Test', price: 50.00, image: 'https://example.com/img.jpg', quantity: 1 }],
        shippingAddress: {
          line1: '123 St',
          line2: '',
          city: 'City',
          state: 'ST',
          zipCode: '12345',
          country: 'US',
        },
        billingAddress: {
          line1: '123 St',
          line2: '',
          city: 'City',
          state: 'ST',
          zipCode: '12345',
          country: 'US',
        },
        email: 'test@test.com',
        phone: '+15555555555',
        paymentIntentId: 'pi_test_123',
        savePaymentMethod: false,
        invoiceMetadata: {
          invoice_url: 'https://example.com/invoice.pdf',
          invoice_state: 'ST',
          invoice_uploaded_at: '2024-01-01T00:00:00Z',
          invoice_filename: 'test-invoice.pdf',
          invoice_file_type: 'application/pdf',
        },
        notes: '',
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Failed to create order');
    });

    it('should return 500 when queryOne returns null', async () => {
      const mockSession = createMockSession();
      mockGetSession.mockResolvedValue(mockSession);

      // First call: product unit_of_measure lookup
      // Second call: order creation returns null
      const mockProduct = { unit_of_measure: 'case', name: 'Test Product' };
      mockQueryOne
        .mockResolvedValueOnce(mockProduct)  // Product lookup
        .mockResolvedValueOnce(null);  // Order creation returns null
      mockQuery.mockResolvedValue([]);  // Warehouse inventory query

      const requestBody = {
        items: [{ productId: '550e8400-e29b-41d4-a716-446655440000', name: 'Test', price: 50.00, image: 'https://example.com/img.jpg', quantity: 1 }],
        shippingAddress: {
          line1: '123 St',
          line2: '',
          city: 'City',
          state: 'ST',
          zipCode: '12345',
          country: 'US',
        },
        billingAddress: {
          line1: '123 St',
          line2: '',
          city: 'City',
          state: 'ST',
          zipCode: '12345',
          country: 'US',
        },
        email: 'test@test.com',
        phone: '+15555555555',
        paymentIntentId: 'pi_test_123',
        savePaymentMethod: false,
        invoiceMetadata: {
          invoice_url: 'https://example.com/invoice.pdf',
          invoice_state: 'ST',
          invoice_uploaded_at: '2024-01-01T00:00:00Z',
          invoice_filename: 'test-invoice.pdf',
          invoice_file_type: 'application/pdf',
        },
        notes: '',
      };

      const request = createPostRequest('/api/orders', requestBody);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create order');
    });
  });
});

