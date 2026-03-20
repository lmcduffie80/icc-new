import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/supplier/auth/login/route';
import { createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

// Mock dependencies
const { mockQuery, mockQueryOne, mockGetSupplierUserByEmail, mockVerifySupplierPassword, mockCheckRateLimit, mockSecurityLogger } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockGetSupplierUserByEmail: vi.fn(),
  mockVerifySupplierPassword: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockSecurityLogger: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock('@/lib/supplier-auth', () => ({
  getSupplierUserByEmail: mockGetSupplierUserByEmail,
  verifySupplierPassword: mockVerifySupplierPassword,
  LOCKOUT_CONFIG: {
    maxAttempts: 5,
    lockoutDurationMinutes: 15,
  },
}));

const { mockGetClientIp } = vi.hoisted(() => ({
  mockGetClientIp: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
  rateLimiters: {
    auth: {},
  },
  createRateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 })
  ),
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logRateLimitExceeded: mockSecurityLogger,
    logValidationFailure: mockSecurityLogger,
    logAuthFailure: mockSecurityLogger,
    logAuthSuccess: mockSecurityLogger,
    logError: mockSecurityLogger,
  },
}));

const { mockCookies } = vi.hoisted(() => ({
  mockCookies: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookies),
}));

vi.mock('crypto', () => {
  const mockRandomBytes = vi.fn(() => Buffer.from('test-token-32-bytes-long-string-hex'));
  return {
    randomBytes: mockRandomBytes,
    default: {
      randomBytes: mockRandomBytes,
    },
  };
});

describe('POST /api/supplier/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue('127.0.0.1');
    mockCheckRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 });
    mockCookies.set.mockReset();
  });

  it('should return 400 for invalid input', async () => {
    const request = createPostRequest('/api/supplier/auth/login', {});
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('should return 401 for invalid credentials', async () => {
    mockGetSupplierUserByEmail.mockResolvedValue(null);

    const request = createPostRequest('/api/supplier/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword',
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(401);
    expect(data.error).toBeDefined();
  });

  it('should return 403 for inactive account', async () => {
    mockGetSupplierUserByEmail.mockResolvedValue({
      id: 'supplier-1',
      email: 'test@example.com',
      name: 'Test Supplier',
      company_name: 'Test Company',
      is_active: false,
      password_hash: 'hashed_password',
      failed_login_attempts: 0,
      locked_until: null,
    });

    const request = createPostRequest('/api/supplier/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(403);
    expect(data.error).toContain('inactive');
  });

  it('should return 423 for locked account', async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    mockGetSupplierUserByEmail.mockResolvedValue({
      id: 'supplier-1',
      email: 'test@example.com',
      name: 'Test Supplier',
      company_name: 'Test Company',
      is_active: true,
      password_hash: 'hashed_password',
      failed_login_attempts: 5,
      locked_until: futureDate.toISOString(),
    });

    const request = createPostRequest('/api/supplier/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(423);
    expect(data.error).toContain('locked');
  });

  it('should successfully login with valid credentials', async () => {
    mockGetSupplierUserByEmail.mockResolvedValue({
      id: 'supplier-1',
      email: 'test@example.com',
      name: 'Test Supplier',
      company_name: 'Test Company',
      is_active: true,
      password_hash: 'hashed_password',
      failed_login_attempts: 0,
      locked_until: null,
    });

    mockVerifySupplierPassword.mockResolvedValue(true);
    
    // Mock the session creation (queryOne for INSERT)
    mockQueryOne.mockResolvedValue({
      id: 'session-1',
      supplier_user_id: 'supplier-1',
      token: 'test-token-32-bytes-long-string-hex',
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      ip_address: '127.0.0.1',
      user_agent: 'test-agent',
    });
      
    mockQuery.mockResolvedValue([]); // For failed attempts reset

    const request = createPostRequest('/api/supplier/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('test@example.com');
  });

  it('should increment failed attempts on wrong password', async () => {
    mockGetSupplierUserByEmail.mockResolvedValue({
      id: 'supplier-1',
      email: 'test@example.com',
      name: 'Test Supplier',
      company_name: 'Test Company',
      is_active: true,
      password_hash: 'hashed_password',
      failed_login_attempts: 2,
      locked_until: null,
    });

    mockVerifySupplierPassword.mockResolvedValue(false);
    mockQuery.mockResolvedValue([]); // For updating failed attempts

    const request = createPostRequest('/api/supplier/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword',
    });
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(401);
    expect(data.error).toBeDefined();
    expect(mockQuery).toHaveBeenCalled(); // Should update failed attempts
  });

  it('should return 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60000,
    });

    const request = createPostRequest('/api/supplier/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    const response = await POST(request);

    expect(response.status).toBe(429);
  });
});

