import { NextRequest } from 'next/server';
import type { RequestInit as NextRequestInit } from 'next/dist/server/web/spec-extension/request';

/**
 * Helper functions for creating Next.js requests in tests
 */

/**
 * Create a mock NextRequest for testing
 */
export function createMockRequest(
  url: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    searchParams?: Record<string, string>;
  }
): NextRequest {
  const { method = 'GET', body, headers = {}, searchParams } = options || {};

  // Build URL with search params
  const urlWithParams = new URL(url, 'http://localhost:3000');
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      urlWithParams.searchParams.set(key, value);
    });
  }

  // Create Request init options
  const init: NextRequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  // Add body if present
  if (body) {
    init.body = JSON.stringify(body);
  }

  return new NextRequest(urlWithParams, init);
}

/**
 * Create a GET request
 */
export function createGetRequest(
  url: string,
  searchParams?: Record<string, string>
): NextRequest {
  return createMockRequest(url, { method: 'GET', searchParams });
}

/**
 * Create a POST request
 */
export function createPostRequest(
  url: string,
  body: Record<string, unknown>
): NextRequest {
  return createMockRequest(url, { method: 'POST', body });
}

/**
 * Create a PATCH request
 */
export function createPatchRequest(
  url: string,
  body: Record<string, unknown>
): NextRequest {
  return createMockRequest(url, { method: 'PATCH', body });
}

/**
 * Create a DELETE request
 */
export function createDeleteRequest(url: string): NextRequest {
  return createMockRequest(url, { method: 'DELETE' });
}

/**
 * Parse JSON response from NextResponse
 */
export async function parseJsonResponse(response: Response) {
  return await response.json();
}

/**
 * Get response status
 */
export function getResponseStatus(response: Response): number {
  return response.status;
}

/**
 * Assert response status
 */
export function assertResponseStatus(response: Response, expectedStatus: number) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}`
    );
  }
}

/**
 * Create mock headers for authenticated requests
 */
export async function createAuthHeaders() {
  // In real tests, we would mock the headers() function from 'next/headers'
  return new Headers({
    'Content-Type': 'application/json',
  });
}

