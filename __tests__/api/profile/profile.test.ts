import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '@/app/api/profile/route';
import {
  createPatchRequest,
  parseJsonResponse,
} from '../helpers/request-helpers';
import { createMockSession } from '../helpers/auth-mock';

// Mock the database and auth with vi.hoisted
const { mockQuery, mockQueryOne, mockGetSession } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
  pool: {},
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

describe('GET /api/profile', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return profile for authenticated user', async () => {
      const mockSession = createMockSession({ id: 'user-123', name: 'John Doe', email: 'john@example.com' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockProfile = {
        id: 'profile-1',
        user_id: 'user-123',
        phone: '555-1234',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        image: null,
      };

      mockQueryOne.mockResolvedValueOnce(mockProfile); // Profile query
      mockQueryOne.mockResolvedValueOnce(mockUser); // User query

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('profile');
      expect(data.profile).toHaveProperty('id', 'profile-1');
      expect(data.profile).toHaveProperty('userId', 'user-123');
      expect(data.profile).toHaveProperty('phone', '555-1234');
      expect(data.profile).toHaveProperty('name', 'John Doe');
      expect(data.profile).toHaveProperty('email', 'john@example.com');
    });

    it('should create profile if it does not exist', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const newProfile = {
        id: 'profile-new',
        user_id: 'user-123',
        phone: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      };

      // First query returns null (no profile)
      mockQueryOne.mockResolvedValueOnce(null);
      // Second query creates the profile
      mockQueryOne.mockResolvedValueOnce(newProfile);
      // Third query gets user info
      mockQueryOne.mockResolvedValueOnce(mockUser);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.profile).toHaveProperty('id', 'profile-new');

      // Verify profile was created
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        ['user-123']
      );
    });

    it('should return null for missing optional fields', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockProfile = {
        id: 'profile-1',
        user_id: 'user-123',
        phone: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockUser = {
        id: 'user-123',
        name: null,
        email: 'test@example.com',
        image: null,
      };

      mockQueryOne.mockResolvedValueOnce(mockProfile);
      mockQueryOne.mockResolvedValueOnce(mockUser);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.profile).toHaveProperty('phone', null);
      expect(data.profile).toHaveProperty('name', null);
      expect(data.profile).toHaveProperty('image', null);
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });

    it('should return 401 when session has no user', async () => {
      mockGetSession.mockResolvedValue({ session: {}, user: null });

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockRejectedValue(new Error('Database error'));

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to fetch profile');
    });
  });
});

describe('PATCH /api/profile', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should update name in user table', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockProfile = {
        id: 'profile-1',
        user_id: 'user-123',
        phone: '555-1234',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockUser = {
        id: 'user-123',
        name: 'Updated Name',
        email: 'test@example.com',
        image: null,
      };

      mockQuery.mockResolvedValueOnce(null); // Update user name
      mockQueryOne.mockResolvedValueOnce(mockProfile); // Fetch updated profile
      mockQueryOne.mockResolvedValueOnce(mockUser); // Fetch updated user

      const request = createPatchRequest('/api/profile', { name: 'Updated Name' });
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.profile).toHaveProperty('name', 'Updated Name');

      // Verify name update query was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "user" SET name = $1'),
        ['Updated Name', 'user-123']
      );
    });

    it('should update phone in profile table', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingProfile = {
        id: 'profile-1',
        user_id: 'user-123',
        phone: '555-1234',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const updatedProfile = {
        ...existingProfile,
        phone: '555-5678',
      };

      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      };

      mockQueryOne.mockResolvedValueOnce(existingProfile); // Check existing profile
      mockQuery.mockResolvedValueOnce(null); // Update phone
      mockQueryOne.mockResolvedValueOnce(updatedProfile); // Fetch updated profile
      mockQueryOne.mockResolvedValueOnce(mockUser); // Fetch user

      const request = createPatchRequest('/api/profile', { phone: '555-5678' });
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.profile).toHaveProperty('phone', '555-5678');
    });

    it('should create profile if it does not exist when updating phone', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const newProfile = {
        id: 'profile-new',
        user_id: 'user-123',
        phone: '555-5678',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      };

      mockQueryOne.mockResolvedValueOnce(null); // No existing profile
      mockQuery.mockResolvedValueOnce(null); // Insert new profile with phone
      mockQueryOne.mockResolvedValueOnce(newProfile); // Fetch updated profile
      mockQueryOne.mockResolvedValueOnce(mockUser); // Fetch user

      const request = createPatchRequest('/api/profile', { phone: '555-5678' });
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.profile).toHaveProperty('phone', '555-5678');

      // Verify INSERT was called instead of UPDATE
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        ['user-123', '555-5678']
      );
    });

    it('should update both name and phone in single request', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingProfile = {
        id: 'profile-1',
        user_id: 'user-123',
        phone: '555-1234',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const updatedProfile = {
        ...existingProfile,
        phone: '555-5678',
      };

      const mockUser = {
        id: 'user-123',
        name: 'New Name',
        email: 'test@example.com',
        image: null,
      };

      mockQuery.mockResolvedValueOnce(null); // Update name
      mockQueryOne.mockResolvedValueOnce(existingProfile); // Check existing profile
      mockQuery.mockResolvedValueOnce(null); // Update phone
      mockQueryOne.mockResolvedValueOnce(updatedProfile); // Fetch updated profile
      mockQueryOne.mockResolvedValueOnce(mockUser); // Fetch user

      const request = createPatchRequest('/api/profile', {
        name: 'New Name',
        phone: '555-5678',
      });
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.profile).toHaveProperty('name', 'New Name');
      expect(data.profile).toHaveProperty('phone', '555-5678');
    });

    it('should handle empty update request gracefully', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockProfile = {
        id: 'profile-1',
        user_id: 'user-123',
        phone: '555-1234',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      };

      // No update queries should be called, just fetch queries
      mockQueryOne.mockResolvedValueOnce(mockProfile);
      mockQueryOne.mockResolvedValueOnce(mockUser);

      const request = createPatchRequest('/api/profile', {});
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('profile');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createPatchRequest('/api/profile', { name: 'New Name' });
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database update fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockRejectedValue(new Error('Database error'));

      const request = createPatchRequest('/api/profile', { name: 'New Name' });
      const response = await PATCH(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to update profile');
    });
  });
});
