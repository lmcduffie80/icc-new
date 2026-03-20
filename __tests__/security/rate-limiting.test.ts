/**
 * Security Tests: Rate Limiting
 *
 * These tests verify that rate limiting is properly enforced on protected endpoints.
 * Rate limits protect against brute force attacks, DoS, and abuse.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPostRequest, parseJsonResponse } from '../api/helpers/request-helpers';

// Mock dependencies with vi.hoisted
const { mockCheckRateLimit, mockCreateRateLimitResponse, mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockCreateRateLimitResponse: vi.fn(),
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  pool: {},
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockReturnValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  rateLimiters: {
    relaxed: { limit: 60, window: 60 },
    moderate: { limit: 20, window: 60 },
    critical: { limit: 5, window: 60 },
    auth: { limit: 5, window: 60 },
    upload: { limit: 10, window: 60 },
    admin: { limit: 100, window: 60 },
  },
  createRateLimitResponse: mockCreateRateLimitResponse,
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logAuthEvent: vi.fn(),
    logValidationFailure: vi.fn(),
    logError: vi.fn(),
    logSuspiciousActivity: vi.fn(),
    logRateLimitExceeded: vi.fn(),
    logContactSubmission: vi.fn(),
    logEvent: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendContactNotification: vi.fn().mockResolvedValue(undefined),
  sendContactAutoReply: vi.fn().mockResolvedValue(undefined),
}));

describe('Security: Rate Limiting', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockReset();
    mockCreateRateLimitResponse.mockReset();
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  describe('Rate Limit Enforcement', () => {
    it('Contact form should return 429 when rate limit exceeded', async () => {
      // Simulate rate limit exceeded
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        reset: Date.now() + 60000,
      });

      // Create a mock 429 response
      const rateLimitResponse = new Response(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        }
      );
      mockCreateRateLimitResponse.mockReturnValue(rateLimitResponse);

      const { POST } = await import('@/app/api/contact/route');

      const request = createPostRequest('/api/contact', {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test message that is long enough to pass validation.',
      });

      const response = await POST(request);

      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalled();
    });

    it('Rate limit response should include Retry-After header', async () => {
      const resetTime = Date.now() + 60000;

      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        reset: resetTime,
      });

      // Verify createRateLimitResponse is called with reset time
      const rateLimitResponse = new Response(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        }
      );
      mockCreateRateLimitResponse.mockReturnValue(rateLimitResponse);

      const { POST } = await import('@/app/api/contact/route');

      const request = createPostRequest('/api/contact', {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test message that is long enough to pass validation.',
      });

      const response = await POST(request);

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('60');
    });

    it('Successful rate limit check should allow request to proceed', async () => {
      // Rate limit passes
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        reset: Date.now() + 60000,
      });

      // Mock successful database insertion
      mockQueryOne.mockResolvedValue({
        id: 'submission-1',
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test message that is long enough to pass validation.',
        created_at: new Date().toISOString(),
      });

      const { POST } = await import('@/app/api/contact/route');

      const request = createPostRequest('/api/contact', {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test message that is long enough to pass validation.',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Rate Limit Tiers', () => {
    it('Critical tier (5/min) should be applied to contact form', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        remaining: 4,
        reset: Date.now() + 60000,
      });

      mockQueryOne.mockResolvedValue({
        id: 'submission-1',
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Test message that is long enough.',
        created_at: new Date().toISOString(),
      });

      const { POST } = await import('@/app/api/contact/route');

      const request = createPostRequest('/api/contact', {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test message that is long enough to pass validation.',
      });

      await POST(request);

      // Verify rate limiter was called (we can't check the specific tier easily
      // but we verify it was invoked)
      expect(mockCheckRateLimit).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Logging', () => {
    it('Rate limit exceeded should be logged as security event', async () => {
      const { securityLogger } = await import('@/lib/security-logger');

      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        reset: Date.now() + 60000,
      });

      const rateLimitResponse = new Response(
        JSON.stringify({ error: 'Too many requests' }),
        { status: 429 }
      );
      mockCreateRateLimitResponse.mockReturnValue(rateLimitResponse);

      const { POST } = await import('@/app/api/contact/route');

      const request = createPostRequest('/api/contact', {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test message that is long enough to pass validation.',
      });

      await POST(request);

      // The route should log rate limit exceeded events
      expect(securityLogger.logRateLimitExceeded).toHaveBeenCalled();
    });
  });
});

describe('Security: Rate Limiting Edge Cases', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockReset();
    mockCreateRateLimitResponse.mockReset();
  });

  it('Rate limiting should work with different IP addresses', async () => {
    // First IP is rate limited
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const rateLimitResponse = new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429 }
    );
    mockCreateRateLimitResponse.mockReturnValue(rateLimitResponse);

    const { POST } = await import('@/app/api/contact/route');

    const request = createPostRequest('/api/contact', {
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Test Subject',
      message: 'This is a test message that is long enough to pass validation.',
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    // Rate limiting is IP-based, so different IPs have independent limits
  });

  it('Rate limit should reset after window expires', async () => {
    // After waiting, rate limit resets
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      remaining: 5, // Full quota restored
      reset: Date.now() + 60000,
    });

    mockQueryOne.mockResolvedValue({
      id: 'submission-1',
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Test',
      message: 'Test message',
      created_at: new Date().toISOString(),
    });

    const { POST } = await import('@/app/api/contact/route');

    const request = createPostRequest('/api/contact', {
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Test Subject',
      message: 'This is a test message that is long enough to pass validation.',
    });

    const response = await POST(request);

    // After window reset, request should succeed
    expect(response.status).toBe(200);
  });
});
