import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getClientIp,
  checkRateLimit,
  createRateLimitResponse,
  rateLimiters,
  checkEmailBasedRateLimit,
} from '@/lib/rate-limit';

// Mock Upstash modules
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn().mockImplementation(() => ({
    limit: vi.fn().mockResolvedValue({
      success: true,
      remaining: 5,
      reset: Date.now() + 60000,
    }),
  })),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

// Set up environment for testing
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token-12345';

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClientIp', () => {
    it('should return IP from cf-connecting-ip header (Cloudflare)', () => {
      const request = new Request('http://localhost', {
        headers: {
          'cf-connecting-ip': '1.2.3.4',
          'x-forwarded-for': '5.6.7.8',
          'x-real-ip': '9.10.11.12',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('1.2.3.4');
    });

    it('should return IP from x-real-ip header', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-real-ip': '10.20.30.40',
          'x-forwarded-for': '50.60.70.80',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('10.20.30.40');
    });

    it('should return first IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '100.100.100.1, 200.200.200.2, 300.300.300.3',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('100.100.100.1');
    });

    it('should trim whitespace from x-forwarded-for IP', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '  192.168.1.1  , 10.0.0.1',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('192.168.1.1');
    });

    it('should return unknown when no IP headers present', () => {
      const request = new Request('http://localhost');

      const ip = getClientIp(request);

      expect(ip).toBe('unknown');
    });

    it('should handle IPv6 addresses', () => {
      const request = new Request('http://localhost', {
        headers: {
          'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });

    it('should handle localhost IPv6', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-real-ip': '::1',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('::1');
    });
  });

  describe('checkRateLimit', () => {
    it('should return success when rate limit not exceeded', async () => {
      const request = new Request('http://localhost');
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: true,
          remaining: 10,
          reset: Date.now() + 60000,
        }),
      };

      const result = await checkRateLimit(request, mockLimiter);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it('should return failure when rate limit exceeded', async () => {
      const request = new Request('http://localhost');
      const resetTime = Date.now() + 30000;
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: false,
          remaining: 0,
          reset: resetTime,
        }),
      };

      const result = await checkRateLimit(request, mockLimiter);

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reset).toBe(resetTime);
    });

    it('should use custom identifier when provided', async () => {
      const request = new Request('http://localhost');
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: true,
          remaining: 5,
          reset: Date.now() + 60000,
        }),
      };

      await checkRateLimit(request, mockLimiter, 'custom-user-id');

      expect(mockLimiter.limit).toHaveBeenCalledWith('custom-user-id');
    });

    it('should use client IP when no custom identifier provided', async () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-real-ip': '123.123.123.123',
        },
      });
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: true,
          remaining: 5,
          reset: Date.now() + 60000,
        }),
      };

      await checkRateLimit(request, mockLimiter);

      expect(mockLimiter.limit).toHaveBeenCalledWith('123.123.123.123');
    });

    it('should allow request when Redis fails (fail open)', async () => {
      const request = new Request('http://localhost');
      const mockLimiter = {
        limit: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await checkRateLimit(request, mockLimiter);

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should allow request when limiter is null', async () => {
      const request = new Request('http://localhost');

      const result = await checkRateLimit(request, null as never);

      expect(result.success).toBe(true);
    });
  });

  describe('createRateLimitResponse', () => {
    it('should create 429 response', () => {
      const response = createRateLimitResponse();

      expect(response.status).toBe(429);
    });

    it('should include Retry-After header', () => {
      const response = createRateLimitResponse();

      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should calculate correct retry time from reset timestamp', () => {
      const futureReset = Date.now() + 30000; // 30 seconds from now
      const response = createRateLimitResponse(futureReset);

      const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
      // Should be approximately 30 seconds (allow some variance)
      expect(retryAfter).toBeGreaterThan(25);
      expect(retryAfter).toBeLessThanOrEqual(31);
    });

    it('should default to 60 seconds when no reset provided', () => {
      const response = createRateLimitResponse();

      const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
      expect(retryAfter).toBe(60);
    });

    it('should include JSON error body', async () => {
      const response = createRateLimitResponse();
      const body = await response.json();

      expect(body.error).toBe('Too many requests');
      expect(body.message).toContain('rate limit');
      expect(body.retryAfter).toBeDefined();
    });

    it('should set Content-Type to application/json', () => {
      const response = createRateLimitResponse();

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('rateLimiters', () => {
    it('should have critical rate limiter', () => {
      expect(rateLimiters.critical).toBeDefined();
      expect(rateLimiters.critical.limit).toBeDefined();
    });

    it('should have auth rate limiter', () => {
      expect(rateLimiters.auth).toBeDefined();
      expect(rateLimiters.auth.limit).toBeDefined();
    });

    it('should have upload rate limiter', () => {
      expect(rateLimiters.upload).toBeDefined();
      expect(rateLimiters.upload.limit).toBeDefined();
    });

    it('should have moderate rate limiter', () => {
      expect(rateLimiters.moderate).toBeDefined();
      expect(rateLimiters.moderate.limit).toBeDefined();
    });

    it('should have relaxed rate limiter', () => {
      expect(rateLimiters.relaxed).toBeDefined();
      expect(rateLimiters.relaxed.limit).toBeDefined();
    });

    it('should have admin rate limiter', () => {
      expect(rateLimiters.admin).toBeDefined();
      expect(rateLimiters.admin.limit).toBeDefined();
    });
  });

  describe('checkEmailBasedRateLimit', () => {
    it('should allow request when under limit', async () => {
      const result = await checkEmailBasedRateLimit('test@example.com', 3, 3600);

      expect(result.success).toBe(true);
    });

    it('should include remaining count', async () => {
      const result = await checkEmailBasedRateLimit('user@example.com', 5, 300);

      expect(result.remaining).toBeDefined();
    });

    it('should include reset timestamp', async () => {
      const result = await checkEmailBasedRateLimit('another@example.com', 2, 60);

      expect(result.reset).toBeDefined();
    });

    it('should handle different window sizes', async () => {
      // Small window (60 seconds)
      const result1 = await checkEmailBasedRateLimit('small@example.com', 3, 60);
      expect(result1.success).toBe(true);

      // Large window (1 hour)
      const result2 = await checkEmailBasedRateLimit('large@example.com', 5, 3600);
      expect(result2.success).toBe(true);
    });

    it('should use email as rate limit key', async () => {
      const email1Result = await checkEmailBasedRateLimit('first@example.com', 1, 60);
      const email2Result = await checkEmailBasedRateLimit('second@example.com', 1, 60);

      // Both should succeed as they are different keys
      expect(email1Result.success).toBe(true);
      expect(email2Result.success).toBe(true);
    });
  });

  describe('Rate Limit Integration Scenarios', () => {
    it('should handle multiple requests from same IP', async () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });

      let remaining = 10;
      const mockLimiter = {
        limit: vi.fn().mockImplementation(async () => {
          remaining--;
          return {
            success: remaining >= 0,
            remaining: Math.max(0, remaining),
            reset: Date.now() + 60000,
          };
        }),
      };

      // Simulate multiple requests
      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(request, mockLimiter);
        expect(result.success).toBe(true);
      }

      expect(mockLimiter.limit).toHaveBeenCalledTimes(5);
    });

    it('should block after exceeding limit', async () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '10.0.0.1' },
      });

      let callCount = 0;
      const mockLimiter = {
        limit: vi.fn().mockImplementation(async () => {
          callCount++;
          const success = callCount <= 3;
          return {
            success,
            remaining: success ? 3 - callCount : 0,
            reset: Date.now() + 60000,
          };
        }),
      };

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const result = await checkRateLimit(request, mockLimiter);
        expect(result.success).toBe(true);
      }

      // 4th request should fail
      const result = await checkRateLimit(request, mockLimiter);
      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis timeout gracefully', async () => {
      const request = new Request('http://localhost');
      const mockLimiter = {
        limit: vi.fn().mockImplementation(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        ),
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await checkRateLimit(request, mockLimiter);

      expect(result.success).toBe(true); // Fail open
      consoleSpy.mockRestore();
    });

    it('should handle network errors gracefully', async () => {
      const request = new Request('http://localhost');
      const mockLimiter = {
        limit: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await checkRateLimit(request, mockLimiter);

      expect(result.success).toBe(true); // Fail open
      consoleSpy.mockRestore();
    });
  });
});
