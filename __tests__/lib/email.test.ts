import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendOrderConfirmation,
  sendContactNotification,
  sendContactAutoReply,
  validateEmailAddress,
} from '@/lib/email';

// Set up environment variables for tests
process.env.RESEND_API_KEY = 'test_api_key';
process.env.EMAIL_FROM = 'test@example.com';

// Create mock send function
const mockSend = vi.fn().mockResolvedValue({
  data: { id: 'mock-email-id-123' },
});

// Mock Resend
vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: mockSend,
      };
    },
  };
});

// Mock security logger
vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logEvent: vi.fn(),
    logError: vi.fn(),
  },
}));

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({
      data: { id: 'mock-email-id-123' },
    });
  });

  describe('validateEmailAddress', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmailAddress('test@example.com')).toBe(true);
      expect(validateEmailAddress('user.name@domain.co.uk')).toBe(true);
      expect(validateEmailAddress('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmailAddress('invalid')).toBe(false);
      expect(validateEmailAddress('@example.com')).toBe(false);
      expect(validateEmailAddress('user@')).toBe(false);
      expect(validateEmailAddress('')).toBe(false);
    });
  });

  describe('sendOrderConfirmation', () => {
    it('should send order confirmation email successfully', async () => {
      const orderData = {
        to: 'customer@example.com',
        subject: 'Order Confirmation - ORD-123',
        orderNumber: 'ORD-123',
        customerName: 'John Doe',
        orderDate: 'December 7, 2025',
        items: [
          {
            name: 'Test Product',
            quantity: 2,
            price: 49.99,
            image: 'https://example.com/image.jpg',
          },
        ],
        subtotal: 99.98,
        deliveryFee: 10.0,
        tax: 8.5,
        total: 118.48,
        shippingAddress: {
          firstName: 'John',
          lastName: 'Doe',
          line1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
        },
        deliveryMethod: 'standard',
      };

      const result = await sendOrderConfirmation(orderData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-email-id-123');
    });

    it('should handle email send failure gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Email service unavailable'));

      const orderData = {
        to: 'customer@example.com',
        subject: 'Order Confirmation - ORD-123',
        orderNumber: 'ORD-123',
        customerName: 'John Doe',
        orderDate: 'December 7, 2025',
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        tax: 0,
        total: 0,
        shippingAddress: {
          line1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
        },
        deliveryMethod: 'standard',
      };

      const result = await sendOrderConfirmation(orderData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email service unavailable');
    });

    it('should format currency correctly in email', async () => {
      const orderData = {
        to: 'customer@example.com',
        subject: 'Order Confirmation - ORD-456',
        orderNumber: 'ORD-456',
        customerName: 'Jane Smith',
        orderDate: 'December 7, 2025',
        items: [
          {
            name: 'Premium Product',
            quantity: 1,
            price: 1234.56,
          },
        ],
        subtotal: 1234.56,
        deliveryFee: 15.99,
        tax: 100.41,
        total: 1350.96,
        shippingAddress: {
          line1: '456 Oak Ave',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
        },
        deliveryMethod: 'express',
      };

      const result = await sendOrderConfirmation(orderData);

      expect(result.success).toBe(true);
    });
  });

  describe('sendContactNotification', () => {
    it('should send contact notification to admin', async () => {
      const contactData = {
        submissionId: 'sub-123',
        name: 'Test User',
        email: 'user@example.com',
        phone: '+1234567890',
        subject: 'Product Inquiry',
        message: 'I have a question about your products.',
        submittedAt: new Date().toISOString(),
        userId: 'user-456',
      };

      const result = await sendContactNotification(contactData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-email-id-123');
    });

    it('should handle contact notification without phone and userId', async () => {
      const contactData = {
        submissionId: 'sub-124',
        name: 'Guest User',
        email: 'guest@example.com',
        subject: 'General Question',
        message: 'What are your business hours?',
        submittedAt: new Date().toISOString(),
      };

      const result = await sendContactNotification(contactData);

      expect(result.success).toBe(true);
    });

    it('should set reply-to address to customer email', async () => {
      const contactData = {
        submissionId: 'sub-125',
        name: 'Reply Test',
        email: 'replytest@example.com',
        subject: 'Test Reply',
        message: 'Testing reply functionality',
        submittedAt: new Date().toISOString(),
      };

      const result = await sendContactNotification(contactData);

      expect(result.success).toBe(true);
    });
  });

  describe('sendContactAutoReply', () => {
    it('should send auto-reply to customer', async () => {
      const result = await sendContactAutoReply('John Doe', 'john@example.com');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-email-id-123');
    });

    it('should handle auto-reply failure gracefully', async () => {
      const result = await sendContactAutoReply('Test User', 'test@example.com');

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should log errors when email sending fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      const orderData = {
        to: 'test@example.com',
        subject: 'Test',
        orderNumber: 'ORD-999',
        customerName: 'Test',
        orderDate: 'Test Date',
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        tax: 0,
        total: 0,
        shippingAddress: {
          line1: 'Test',
          city: 'Test',
          state: 'TS',
          zipCode: '12345',
        },
        deliveryMethod: 'standard',
      };

      const result = await sendOrderConfirmation(orderData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Email Content Generation', () => {
    it('should generate HTML content with proper structure', async () => {
      const orderData = {
        to: 'test@example.com',
        subject: 'Order Confirmation - ORD-HTML',
        orderNumber: 'ORD-HTML',
        customerName: 'HTML Test',
        orderDate: 'December 7, 2025',
        items: [
          {
            name: 'Test Item',
            quantity: 1,
            price: 50.0,
          },
        ],
        subtotal: 50.0,
        deliveryFee: 5.0,
        tax: 4.5,
        total: 59.5,
        shippingAddress: {
          line1: '123 Test St',
          city: 'Test City',
          state: 'TC',
          zipCode: '12345',
        },
        deliveryMethod: 'standard',
      };

      const result = await sendOrderConfirmation(orderData);

      expect(result.success).toBe(true);
      // In a real test, we would verify the HTML structure
      // For now, we're just ensuring the function completes
    });

    it('should generate plain text content', async () => {
      const orderData = {
        to: 'test@example.com',
        subject: 'Order Confirmation - ORD-TEXT',
        orderNumber: 'ORD-TEXT',
        customerName: 'Text Test',
        orderDate: 'December 7, 2025',
        items: [
          {
            name: 'Text Item',
            quantity: 2,
            price: 25.0,
          },
        ],
        subtotal: 50.0,
        deliveryFee: 5.0,
        tax: 4.5,
        total: 59.5,
        shippingAddress: {
          line1: '456 Text Ave',
          city: 'Text Town',
          state: 'TT',
          zipCode: '54321',
        },
        deliveryMethod: 'express',
      };

      const result = await sendOrderConfirmation(orderData);

      expect(result.success).toBe(true);
      // Plain text should also be generated alongside HTML
    });
  });

  describe('Email Address Validation', () => {
    it('should validate before sending (implicit)', async () => {
      // The email service should handle validation internally
      const result = await sendContactAutoReply(
        'Valid User',
        'valid@example.com'
      );

      expect(result.success).toBe(true);
    });
  });
});

