import { vi } from 'vitest';

/**
 * Mock implementation of database query functions
 * Use this for unit-style tests that don't need a real database
 */

export const mockQuery = vi.fn();
export const mockQueryOne = vi.fn();

/**
 * Reset all database mocks
 * Call this in beforeEach to ensure clean state
 */
export function resetDbMocks() {
  mockQuery.mockReset();
  mockQueryOne.mockReset();
}

/**
 * Setup mock for query that returns multiple rows
 */
export function mockQueryResult<T>(data: T[]) {
  mockQuery.mockResolvedValue(data);
}

/**
 * Setup mock for queryOne that returns a single row
 */
export function mockQueryOneResult<T>(data: T | null) {
  mockQueryOne.mockResolvedValue(data);
}

/**
 * Setup mock for query/queryOne to throw an error
 */
export function mockQueryError(error: Error) {
  mockQuery.mockRejectedValue(error);
  mockQueryOne.mockRejectedValue(error);
}

/**
 * Get the SQL query that was executed
 */
export function getLastQuery(): string | undefined {
  const calls = mockQuery.mock.calls.length > 0 
    ? mockQuery.mock.calls 
    : mockQueryOne.mock.calls;
  
  return calls.length > 0 ? calls[calls.length - 1][0] : undefined;
}

/**
 * Get the parameters passed to the last query
 */
export function getLastQueryParams(): unknown[] | undefined {
  const calls = mockQuery.mock.calls.length > 0 
    ? mockQuery.mock.calls 
    : mockQueryOne.mock.calls;
  
  return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

