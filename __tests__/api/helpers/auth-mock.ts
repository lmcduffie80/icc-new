import { vi } from 'vitest';

/**
 * Mock authentication helpers for testing API routes
 */

export interface MockUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  image?: string | null;
}

export interface MockAdminUser {
  id: string;
  user_id: string;
  role_id: string;
  is_active: boolean;
  permissions: string[];
}

export interface MockSessionData {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MockSession {
  user: MockUser;
  session: MockSessionData;
}

export interface MockAdminSession {
  session: {
    userId: string;
  };
  adminUser: MockAdminUser;
}

/**
 * Create a mock user session for testing authenticated routes
 * Includes all required Better Auth properties
 */
export function createMockSession(overrides?: Partial<MockUser>): MockSession {
  const now = new Date();
  const userId = overrides?.id || 'test-user-id';
  return {
    user: {
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      createdAt: now,
      updatedAt: now,
      emailVerified: true,
      image: null,
      ...overrides,
    },
    session: {
      id: 'test-session-id',
      userId: userId,
      expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
      createdAt: now,
      updatedAt: now,
      token: 'test-session-token',
      ipAddress: null,
      userAgent: null,
    },
  };
}

/**
 * Create a mock admin session for testing admin routes
 */
export function createMockAdminSession(
  permissions: string[] = [],
  overrides?: Partial<MockAdminUser>
): MockAdminSession {
  return {
    session: {
      userId: 'test-admin-user-id',
    },
    adminUser: {
      id: 'test-admin-id',
      user_id: 'test-admin-user-id',
      role_id: 'test-role-id',
      is_active: true,
      permissions,
      ...overrides,
    },
  };
}

/**
 * Mock the auth.api.getSession function to return a user session
 */
export function mockAuthSession(session: MockSession | null) {
  return vi.fn().mockResolvedValue(session);
}

/**
 * Mock the auth.api.getSession function to return no session (unauthorized)
 */
export function mockNoSession() {
  return vi.fn().mockResolvedValue(null);
}

/**
 * Mock requireAdmin for testing admin routes
 */
export function mockRequireAdmin(
  session: MockAdminSession | null = null,
  hasPermission: boolean = true
) {
  if (!session) {
    return {
      error: { json: vi.fn(), status: 401 },
      session: null,
    };
  }

  if (!hasPermission) {
    return {
      error: { json: vi.fn(), status: 403 },
      session: null,
    };
  }

  return {
    error: null,
    session,
  };
}

