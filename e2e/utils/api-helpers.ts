import { APIRequestContext } from '@playwright/test';

/**
 * API helper functions for E2E tests
 */

/**
 * Create a new user via API
 */
export async function createUser(
  request: APIRequestContext,
  user: { email: string; password: string; name: string }
) {
  const response = await request.post('/api/auth/sign-up', {
    data: user,
  });
  return response.json();
}

/**
 * Login user via API and get session
 */
export async function loginUser(
  request: APIRequestContext,
  credentials: { email: string; password: string }
) {
  const response = await request.post('/api/auth/sign-in/email', {
    data: credentials,
  });
  return response.json();
}

/**
 * Create a product via admin API
 */
export async function createProduct(
  request: APIRequestContext,
  product: {
    name: string;
    category: string;
    price: number;
    description?: string;
    inStock?: boolean;
    inventoryCount?: number;
  }
) {
  const response = await request.post('/api/admin/products', {
    data: product,
  });
  return response.json();
}

/**
 * Delete a product via admin API
 */
export async function deleteProduct(request: APIRequestContext, productId: string) {
  const response = await request.delete(`/api/admin/products/${productId}`);
  return response.json();
}

/**
 * Get products via API
 */
export async function getProducts(request: APIRequestContext) {
  const response = await request.get('/api/products');
  return response.json();
}

/**
 * Add item to cart via API
 */
export async function addToCart(
  request: APIRequestContext,
  item: { productId: string; quantity: number }
) {
  const response = await request.post('/api/cart/add', {
    data: item,
  });
  return response.json();
}

/**
 * Clear cart via API
 */
export async function clearCart(request: APIRequestContext) {
  const response = await request.delete('/api/cart');
  return response.json();
}
