import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/profile/addresses/route';
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from '@/app/api/profile/addresses/[id]/route';
import {
  createGetRequest,
  createPostRequest,
  createPatchRequest,
  createDeleteRequest,
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

// Helper function for calling route handlers with params
async function callGetById(id: string): Promise<Response> {
  const request = createGetRequest(`/api/profile/addresses/${id}`);
  return GET_BY_ID(request, { params: Promise.resolve({ id }) });
}

async function callPatch(
  id: string,
  body: Record<string, unknown>
): Promise<Response> {
  const request = createPatchRequest(`/api/profile/addresses/${id}`, body);
  return PATCH(request, { params: Promise.resolve({ id }) });
}

async function callDelete(id: string): Promise<Response> {
  const request = createDeleteRequest(`/api/profile/addresses/${id}`);
  return DELETE(request, { params: Promise.resolve({ id }) });
}

describe('GET /api/profile/addresses', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return empty array when user has no addresses', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);
      mockQuery.mockResolvedValue([]);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('addresses');
      expect(data.addresses).toEqual([]);
    });

    it('should return list of addresses for authenticated user', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockAddresses = [
        {
          id: 'addr-1',
          user_id: 'user-123',
          label: 'Home',
          full_name: 'John Doe',
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip_code: '62701',
          country: 'United States',
          is_primary: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'addr-2',
          user_id: 'user-123',
          label: 'Work',
          full_name: 'John Doe',
          street: '456 Office Blvd',
          city: 'Chicago',
          state: 'IL',
          zip_code: '60601',
          country: 'United States',
          is_primary: false,
          created_at: '2025-01-02T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
      ];
      mockQuery.mockResolvedValue(mockAddresses);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.addresses).toHaveLength(2);
      expect(data.addresses[0]).toHaveProperty('id', 'addr-1');
      expect(data.addresses[0]).toHaveProperty('label', 'Home');
      expect(data.addresses[0]).toHaveProperty('fullName', 'John Doe');
      expect(data.addresses[0]).toHaveProperty('isPrimary', true);
    });

    it('should transform database column names to camelCase', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValue([mockAddress]);

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(data.addresses[0]).toHaveProperty('fullName');
      expect(data.addresses[0]).toHaveProperty('zipCode');
      expect(data.addresses[0]).toHaveProperty('isPrimary');
      expect(data.addresses[0]).not.toHaveProperty('full_name');
      expect(data.addresses[0]).not.toHaveProperty('zip_code');
      expect(data.addresses[0]).not.toHaveProperty('is_primary');
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
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);
      mockQuery.mockRejectedValue(new Error('Database error'));

      const response = await GET();
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to fetch addresses');
    });
  });
});

describe('POST /api/profile/addresses', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should create a new address', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // No existing addresses
      mockQuery.mockResolvedValueOnce([]);

      const mockAddress = {
        id: 'addr-new',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      mockQueryOne.mockResolvedValue(mockAddress);

      const request = createPostRequest('/api/profile/addresses', {
        label: 'Home',
        fullName: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('address');
      expect(data.address).toHaveProperty('id', 'addr-new');
      expect(data.address).toHaveProperty('label', 'Home');
    });

    it('should make first address primary by default', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      // No existing addresses
      mockQuery.mockResolvedValueOnce([]);

      mockQueryOne.mockResolvedValue({
        id: 'addr-new',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      });

      const request = createPostRequest('/api/profile/addresses', {
        label: 'Home',
        fullName: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      await POST(request);

      // Check that is_primary was set to true
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_addresses'),
        expect.arrayContaining([true]) // shouldBePrimary = true
      );
    });

    it('should use provided country or default to United States', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValueOnce([]);
      mockQueryOne.mockResolvedValue({
        id: 'addr-new',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      });

      const request = createPostRequest('/api/profile/addresses', {
        label: 'Home',
        fullName: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        // No country specified
      });

      await POST(request);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['United States'])
      );
    });
  });

  describe('validation', () => {
    it('should return 400 when label is missing', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPostRequest('/api/profile/addresses', {
        fullName: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 400 when fullName is missing', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPostRequest('/api/profile/addresses', {
        label: 'Home',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 400 when all required fields are missing', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const request = createPostRequest('/api/profile/addresses', {});

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Missing required fields');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const request = createPostRequest('/api/profile/addresses', {
        label: 'Home',
        fullName: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database insert fails', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQuery.mockResolvedValueOnce([]);
      mockQueryOne.mockResolvedValue(null);

      const request = createPostRequest('/api/profile/addresses', {
        label: 'Home',
        fullName: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to create address');
    });
  });
});

describe('GET /api/profile/addresses/[id]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should return address by ID', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const mockAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      mockQueryOne.mockResolvedValue(mockAddress);

      const response = await callGetById('addr-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('address');
      expect(data.address).toHaveProperty('id', 'addr-1');
      expect(data.address).toHaveProperty('label', 'Home');
    });

    it('should return 404 when address not found', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValue(null);

      const response = await callGetById('nonexistent-id');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error', 'Address not found');
    });

    it('should verify ownership via user_id', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValue(null);

      await callGetById('addr-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND user_id = $2'),
        ['addr-1', 'user-123']
      );
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await callGetById('addr-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });
});

describe('PATCH /api/profile/addresses/[id]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should update address fields', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
      };

      // First query to verify ownership
      mockQueryOne.mockResolvedValueOnce(existingAddress);

      const updatedAddress = {
        ...existingAddress,
        label: 'Updated Home',
      };
      // Second query for the update
      mockQueryOne.mockResolvedValueOnce(updatedAddress);

      const response = await callPatch('addr-1', { label: 'Updated Home' });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.address).toHaveProperty('label', 'Updated Home');
    });

    it('should return 404 when address not found', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValueOnce(null);

      const response = await callPatch('nonexistent-id', { label: 'Updated' });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error', 'Address not found');
    });

    it('should return 400 when no fields to update', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
      };
      mockQueryOne.mockResolvedValueOnce(existingAddress);

      const response = await callPatch('addr-1', {});
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'No fields to update');
    });

    it('should update multiple fields at once', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true,
      };

      mockQueryOne.mockResolvedValueOnce(existingAddress);

      const updatedAddress = {
        ...existingAddress,
        label: 'New Home',
        street: '456 Oak Ave',
        city: 'Chicago',
      };
      mockQueryOne.mockResolvedValueOnce(updatedAddress);

      const response = await callPatch('addr-1', {
        label: 'New Home',
        street: '456 Oak Ave',
        city: 'Chicago',
      });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.address).toHaveProperty('label', 'New Home');
      expect(data.address).toHaveProperty('street', '456 Oak Ave');
      expect(data.address).toHaveProperty('city', 'Chicago');
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await callPatch('addr-1', { label: 'Updated' });
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });
});

describe('DELETE /api/profile/addresses/[id]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    mockGetSession.mockReset();
  });

  describe('authenticated requests', () => {
    it('should delete address', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: false,
      };

      mockQueryOne.mockResolvedValueOnce(existingAddress);
      mockQuery.mockResolvedValueOnce(null); // DELETE query

      const response = await callDelete('addr-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
    });

    it('should return 404 when address not found', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      mockQueryOne.mockResolvedValueOnce(null);

      const response = await callDelete('nonexistent-id');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error', 'Address not found');
    });

    it('should make next address primary when deleting primary address', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: true, // This is the primary address
      };

      mockQueryOne.mockResolvedValueOnce(existingAddress); // Existing address check
      mockQuery.mockResolvedValueOnce(null); // DELETE query
      mockQueryOne.mockResolvedValueOnce({ id: 'addr-2' }); // Next address to make primary
      mockQuery.mockResolvedValueOnce(null); // UPDATE query for new primary

      await callDelete('addr-1');

      // Verify that the next address was queried
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC LIMIT 1'),
        ['user-123']
      );
    });

    it('should not update any address if deleted was not primary', async () => {
      const mockSession = createMockSession({ id: 'user-123' });
      mockGetSession.mockResolvedValue(mockSession);

      const existingAddress = {
        id: 'addr-1',
        user_id: 'user-123',
        label: 'Home',
        full_name: 'John Doe',
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        country: 'United States',
        is_primary: false, // Not primary
      };

      mockQueryOne.mockResolvedValueOnce(existingAddress);
      mockQuery.mockResolvedValueOnce(null); // DELETE query

      await callDelete('addr-1');

      // Should only have 2 calls: ownership check and delete
      expect(mockQueryOne).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('unauthorized requests', () => {
    it('should return 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await callDelete('addr-1');
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

      const response = await callDelete('addr-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error', 'Failed to delete address');
    });
  });
});
