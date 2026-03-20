import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies with vi.hoisted BEFORE imports
const { mockQuery, mockQueryOne, mockVerifyPassword, mockCookies, mockRandomBytes } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockCookies: {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
  mockRandomBytes: vi.fn(() => ({
    toString: () => 'mock-session-token-123',
  })),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock('@/lib/admin-password', () => ({
  verifyAdminPassword: mockVerifyPassword,
  LOCKOUT_CONFIG: {
    maxAttempts: 5,
    lockoutDurationMinutes: 15,
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookies),
}));

// Mock crypto module - include default export
vi.mock('crypto', () => {
  const mock = {
    randomBytes: mockRandomBytes,
  };
  return {
    ...mock,
    default: mock,
  };
});

// Import AFTER mocks
import { POST as loginPOST } from '@/app/api/admin/auth/login/route';
import { POST as logoutPOST } from '@/app/api/admin/auth/logout/route';
import { createPostRequest, parseJsonResponse } from '../helpers/request-helpers';

describe('POST /api/admin/auth/login', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockVerifyPassword.mockReset();
    mockCookies.set.mockReset();
    mockCookies.delete.mockReset();
    mockCookies.get.mockReset();
  });

  describe('successful login', () => {
    it('should login with valid credentials', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 0,
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Super Admin',
      };

      const mockSession = {
        id: 'session-1',
        admin_user_id: 'admin-1',
        token: 'mock-session-token-123',
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        ip_address: null,
        user_agent: null,
      };

      mockQueryOne
        .mockResolvedValueOnce(mockAdmin) // Find admin user
        .mockResolvedValueOnce(mockSession); // Create session

      mockVerifyPassword.mockResolvedValue(true);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'correct-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('user');
      expect(data.user).toEqual({
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'Super Admin',
      });
      expect(mockCookies.set).toHaveBeenCalled();
    });

    it('should reset failed login attempts on successful login', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 3,
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({});

      mockVerifyPassword.mockResolvedValue(true);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'correct-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);

      expect(response.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        expect.arrayContaining(['admin-1'])
      );
    });

    it('should create session cookie with correct attributes', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 0,
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({});

      mockVerifyPassword.mockResolvedValue(true);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'correct-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      await loginPOST(request);

      expect(mockCookies.set).toHaveBeenCalledWith(
        'admin_session',
        'mock-session-token-123',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        })
      );
    });
  });

  describe('validation', () => {
    it('should return 400 when email is missing', async () => {
      const requestBody = {
        password: 'test-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Invalid input');
    });

    it('should return 400 when password is missing', async () => {
      const requestBody = {
        email: 'admin@example.com',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid input');
    });

    it('should return 400 when both are missing', async () => {
      const requestBody = {};

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid input');
    });
  });

  describe('invalid credentials', () => {
    it('should return 401 when user does not exist', async () => {
      mockQueryOne.mockResolvedValue(null);

      const requestBody = {
        email: 'nonexistent@example.com',
        password: 'password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Invalid credentials');
    });

    it('should return 401 when password is incorrect', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 0,
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne.mockResolvedValue(mockAdmin);
      mockVerifyPassword.mockResolvedValue(false);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'wrong-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid credentials');
      expect(data.error).toContain('4 attempt(s) remaining');
    });

    it('should increment failed login attempts', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 2,
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne.mockResolvedValue(mockAdmin);
      mockVerifyPassword.mockResolvedValue(false);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'wrong-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = $1'),
        expect.arrayContaining([3, 'admin-1'])
      );
    });

    it('should lock account after max failed attempts', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 4, // One more will reach max
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne.mockResolvedValue(mockAdmin);
      mockVerifyPassword.mockResolvedValue(false);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'wrong-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(423);
      expect(data.error).toContain('Too many failed attempts');
      expect(data.error).toContain('15 minutes');
    });

    it('should return 401 when password hash is not set', async () => {
      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: null,
        failed_login_attempts: 0,
        locked_until: null,
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne.mockResolvedValue(mockAdmin);

      const requestBody = {
        email: 'admin@example.com',
        password: 'password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toContain('Admin password not set');
    });
  });

  describe('account lockout', () => {
    it('should return 423 when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 5,
        locked_until: lockedUntil.toISOString(),
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne.mockResolvedValue(mockAdmin);

      const requestBody = {
        email: 'admin@example.com',
        password: 'password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(423);
      expect(data.error).toContain('Account locked');
      expect(data.error).toMatch(/Try again in \d+ minute\(s\)/);
    });

    it('should reset lockout when expired', async () => {
      const expiredLock = new Date(Date.now() - 60 * 1000); // 1 minute ago

      const mockAdmin = {
        id: 'admin-1',
        user_id: 'user-1',
        role_id: 'role-1',
        password_hash: 'hashed-password',
        failed_login_attempts: 5,
        locked_until: expiredLock.toISOString(),
        user_email: 'admin@example.com',
        user_name: 'Admin User',
        role_name: 'Admin',
      };

      mockQueryOne
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({});

      mockVerifyPassword.mockResolvedValue(true);
      mockQuery.mockResolvedValue(null);

      const requestBody = {
        email: 'admin@example.com',
        password: 'correct-password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);

      expect(response.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        expect.any(Array)
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockQueryOne.mockRejectedValue(new Error('Database error'));

      const requestBody = {
        email: 'admin@example.com',
        password: 'password',
      };

      const request = createPostRequest('/api/admin/auth/login', requestBody);
      const response = await loginPOST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('An error occurred during login');
    });
  });
});

describe('POST /api/admin/auth/logout', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockCookies.delete.mockReset();
    mockCookies.get.mockReset();
  });

  describe('successful logout', () => {
    it('should delete session and cookie', async () => {
      mockCookies.get.mockReturnValue({ value: 'session-token-123' });
      mockQuery.mockResolvedValue(null);

      // This route doesn't take a request parameter - uses cookies() internally
      const response = await logoutPOST();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(mockCookies.delete).toHaveBeenCalledWith('admin_session');
    });

    it('should work when no session cookie exists', async () => {
      mockCookies.get.mockReturnValue(null);

      // This route doesn't take a request parameter - uses cookies() internally
      const response = await logoutPOST();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // When no cookie exists, delete is not called
      expect(mockCookies.delete).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when cookie deletion fails', async () => {
      mockCookies.get.mockReturnValue({ value: 'session-token' });
      mockCookies.delete.mockImplementation(() => {
        throw new Error('Cookie deletion failed');
      });

      // This route doesn't take a request parameter - uses cookies() internally
      const response = await logoutPOST();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
    });
  });
});

