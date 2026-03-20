/**
 * E2E Test Database Seeding Script
 *
 * This script creates predictable test data for Playwright E2E tests.
 * Run with: pnpm db:seed:test
 *
 * Requires: .env.test with DATABASE_URL pointing to a separate test database
 */

import { Pool } from '@neondatabase/serverless';
import { randomUUID, randomBytes } from 'crypto';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { hashAdminPassword } from '../lib/admin-password';

/**
 * Hash a password using Better Auth's format (scrypt with salt:hash hex format)
 * This uses the same @noble/hashes library and parameters as Better Auth
 * Config: N=16384, r=16, p=1, dkLen=64
 */
async function hashBetterAuthPassword(password: string): Promise<string> {
  const salt = bytesToHex(randomBytes(16));
  // Normalize password the same way Better Auth does (NFKC)
  const normalizedPassword = password.normalize('NFKC');
  const derivedKey = await scryptAsync(normalizedPassword, salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
  });
  return `${salt}:${bytesToHex(derivedKey)}`;
}

// Test credentials
const TEST_CUSTOMER_EMAIL = process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com';
const TEST_CUSTOMER_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD || 'TestPassword123!';
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'AdminTestPassword123!';

// Fixed UUIDs for test data (makes tests more predictable)
const TEST_CUSTOMER_ID = 'test-customer-001';
const TEST_ADMIN_ID = 'test-admin-001';
const TEST_ADDRESS_1_ID = 'test-address-001';
const TEST_ADDRESS_2_ID = 'test-address-002';
const TEST_INVOICE_ID = 'test-invoice-001';
const TEST_ORDER_1_ID = 'test-order-001';
const TEST_ORDER_2_ID = 'test-order-002';

async function seedTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set in .env.test');
    console.error('Make sure you have created .env.test with a valid DATABASE_URL');
    process.exit(1);
  }

  // Mask the password in the URL for logging
  const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
  console.log('');
  console.log('========================================');
  console.log('   E2E Test Database Seeding');
  console.log('========================================');
  console.log('');
  console.log(`Connecting to: ${maskedUrl}`);
  console.log('');

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Test connection first
    console.log('Testing database connection...');
    await pool.query('SELECT 1');
    console.log('Connection successful!');
    console.log('');

    // 1. Clean up existing test data
    console.log('Cleaning up existing test data...');
    await cleanupTestData(pool);

    // 2. Create test customer user
    console.log('Creating test customer...');
    await createTestCustomer(pool);

    // 3. Create test admin user
    console.log('Creating test admin...');
    await createTestAdmin(pool);

    // 4. Create test products (only if not exists)
    console.log('Ensuring test products exist...');
    await ensureTestProducts(pool);

    // 5. Create addresses for test customer
    console.log('Creating test addresses...');
    await createTestAddresses(pool);

    // 6. Create invoice for test customer
    console.log('Creating test invoice...');
    await createTestInvoice(pool);

    // 7. Create tax rates
    console.log('Ensuring tax rates exist...');
    await ensureTaxRates(pool);

    // 8. Create test orders
    console.log('Creating test orders...');
    await createTestOrders(pool);

    console.log('');
    console.log('========================================');
    console.log('   Test Data Seeded Successfully!');
    console.log('========================================');
    console.log('');
    console.log('Test Customer:');
    console.log(`  Email:    ${TEST_CUSTOMER_EMAIL}`);
    console.log(`  Password: ${TEST_CUSTOMER_PASSWORD}`);
    console.log('');
    console.log('Test Admin:');
    console.log(`  Email:    ${TEST_ADMIN_EMAIL}`);
    console.log(`  Password: ${TEST_ADMIN_PASSWORD}`);
    console.log('');
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('   ERROR: Failed to seed test database');
    console.error('========================================');
    console.error('');
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('');
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
    } else {
      console.error('Error:', error);
    }
    console.error('');
    console.error('Common issues:');
    console.error('1. DATABASE_URL in .env.test is invalid or pointing to wrong database');
    console.error('2. Database does not exist or migrations have not been run');
    console.error('3. Network connectivity issues to Neon');
    console.error('');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function cleanupTestData(pool: Pool) {
  // Delete in order of dependencies
  await pool.query(`DELETE FROM order_items WHERE order_id IN ($1, $2)`, [TEST_ORDER_1_ID, TEST_ORDER_2_ID]);
  await pool.query(`DELETE FROM orders WHERE id IN ($1, $2)`, [TEST_ORDER_1_ID, TEST_ORDER_2_ID]);
  await pool.query(`DELETE FROM user_invoices WHERE id = $1`, [TEST_INVOICE_ID]);
  await pool.query(`DELETE FROM user_addresses WHERE id IN ($1, $2)`, [TEST_ADDRESS_1_ID, TEST_ADDRESS_2_ID]);
  await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [TEST_CUSTOMER_ID]);
  await pool.query(`DELETE FROM admin_sessions WHERE admin_user_id = $1`, [TEST_ADMIN_ID]);
  await pool.query(`DELETE FROM admin_users WHERE id = $1`, [TEST_ADMIN_ID]);

  // Delete customer user (cascade will clean up related data)
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [TEST_CUSTOMER_ID]);

  // Also clean up by email in case IDs changed
  await pool.query(`DELETE FROM admin_users WHERE email = $1`, [TEST_ADMIN_EMAIL]);
  await pool.query(`DELETE FROM "user" WHERE email = $1`, [TEST_CUSTOMER_EMAIL]);
}

async function createTestCustomer(pool: Pool) {
  // Better Auth stores password in the 'account' table using scrypt with salt:hash format
  const now = new Date().toISOString();

  // Create user in Better Auth's user table with email verified
  await pool.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, $4, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       "emailVerified" = EXCLUDED."emailVerified",
       "updatedAt" = EXCLUDED."updatedAt"`,
    [TEST_CUSTOMER_ID, TEST_CUSTOMER_EMAIL, 'Test Customer', now]
  );

  // Create password credential in Better Auth's account table
  // Better Auth uses scrypt with salt:hash format (not bcrypt)
  // accountId should be the email for credential provider
  const hashedPassword = await hashBetterAuthPassword(TEST_CUSTOMER_PASSWORD);
  await pool.query(
    `INSERT INTO "account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential', $3, $4, $5, $5)
     ON CONFLICT (id) DO UPDATE SET
       password = EXCLUDED.password,
       "updatedAt" = EXCLUDED."updatedAt"`,
    [`${TEST_CUSTOMER_ID}-credential`, TEST_CUSTOMER_ID, TEST_CUSTOMER_EMAIL, hashedPassword, now]
  );

  // Create user profile
  await pool.query(
    `INSERT INTO user_profiles (id, user_id, phone, is_banned, created_at, updated_at)
     VALUES ($1, $2, $3, false, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       phone = EXCLUDED.phone,
       updated_at = NOW()`,
    [`${TEST_CUSTOMER_ID}-profile`, TEST_CUSTOMER_ID, '+1-555-123-4567']
  );
}

async function createTestAdmin(pool: Pool) {
  const passwordHash = await hashAdminPassword(TEST_ADMIN_PASSWORD);

  await pool.query(
    `INSERT INTO admin_users (id, email, name, password_hash, password_set_at, role_id, custom_permissions)
     VALUES ($1, $2, $3, $4, NOW(), 'super-admin', '{"grant": [], "revoke": []}')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       password_set_at = NOW()`,
    [TEST_ADMIN_ID, TEST_ADMIN_EMAIL, 'Test Admin', passwordHash]
  );
}

async function ensureTestProducts(pool: Pool) {
  // Check if products already exist (from migrations)
  const result = await pool.query('SELECT COUNT(*) as count FROM products');
  const count = parseInt(result.rows[0].count, 10);

  if (count >= 8) {
    console.log(`  Found ${count} products, skipping product seeding`);
    return;
  }

  // Seed test products
  const products = [
    {
      id: 'test-product-001',
      name: 'Test Herbicide Pro',
      category: 'Herbicides',
      description: 'Professional-grade herbicide for testing.',
      price: 149.99,
      in_stock: true,
      inventory_count: 100,
      approved_states: ['TX', 'CA', 'FL', 'NY'],
      restricted_use: false,
    },
    {
      id: 'test-product-002',
      name: 'Premium Fertilizer Blend',
      category: 'Fertilizers',
      description: 'High-quality NPK fertilizer blend.',
      price: 89.99,
      in_stock: true,
      inventory_count: 200,
      approved_states: ['TX', 'CA', 'FL', 'NY', 'IL', 'OH'],
      restricted_use: false,
    },
    {
      id: 'test-product-003',
      name: 'Fungicide Treatment',
      category: 'Fungicides',
      description: 'Broad-spectrum fungicide treatment.',
      price: 199.99,
      in_stock: true,
      inventory_count: 50,
      approved_states: ['TX', 'CA'],
      restricted_use: true,
    },
    {
      id: 'test-product-004',
      name: 'Organic Pest Control',
      category: 'Insecticides',
      description: 'OMRI-listed organic pest control solution.',
      price: 59.99,
      in_stock: true,
      inventory_count: 150,
      approved_states: null, // Available in all states
      restricted_use: false,
    },
    {
      id: 'test-product-005',
      name: 'Soil Amendment Plus',
      category: 'Fertilizers',
      description: 'Premium soil amendment for improved crop yield.',
      price: 45.00,
      in_stock: true,
      inventory_count: 300,
      approved_states: null,
      restricted_use: false,
    },
    {
      id: 'test-product-006',
      name: 'Out of Stock Item',
      category: 'Herbicides',
      description: 'This item is currently out of stock.',
      price: 129.99,
      in_stock: false,
      inventory_count: 0,
      approved_states: ['TX'],
      restricted_use: false,
    },
    {
      id: 'test-product-007',
      name: 'California Only Product',
      category: 'Specialty',
      description: 'Only approved for use in California.',
      price: 299.99,
      in_stock: true,
      inventory_count: 25,
      approved_states: ['CA'],
      restricted_use: true,
    },
    {
      id: 'test-product-008',
      name: 'Budget Fertilizer',
      category: 'Fertilizers',
      description: 'Affordable fertilizer option.',
      price: 19.99,
      in_stock: true,
      inventory_count: 500,
      approved_states: null,
      restricted_use: false,
    },
  ];

  for (const product of products) {
    await pool.query(
      `INSERT INTO products (id, name, category, description, price, in_stock, inventory_count, approved_states, restricted_use, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         price = EXCLUDED.price,
         in_stock = EXCLUDED.in_stock,
         inventory_count = EXCLUDED.inventory_count`,
      [
        product.id,
        product.name,
        product.category,
        product.description,
        product.price,
        product.in_stock,
        product.inventory_count,
        product.approved_states,
        product.restricted_use,
      ]
    );
  }
}

async function createTestAddresses(pool: Pool) {
  const addresses = [
    {
      id: TEST_ADDRESS_1_ID,
      user_id: TEST_CUSTOMER_ID,
      label: 'Farm HQ',
      full_name: 'Test Customer',
      street: '123 Farm Road',
      city: 'Austin',
      state: 'TX',
      zip_code: '78701',
      country: 'United States',
      is_primary: true,
    },
    {
      id: TEST_ADDRESS_2_ID,
      user_id: TEST_CUSTOMER_ID,
      label: 'Warehouse',
      full_name: 'Test Customer',
      street: '456 Industrial Blvd',
      city: 'Houston',
      state: 'TX',
      zip_code: '77001',
      country: 'United States',
      is_primary: false,
    },
  ];

  for (const addr of addresses) {
    await pool.query(
      `INSERT INTO user_addresses (id, user_id, label, full_name, street, city, state, zip_code, country, is_primary, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         full_name = EXCLUDED.full_name,
         street = EXCLUDED.street,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         zip_code = EXCLUDED.zip_code,
         is_primary = EXCLUDED.is_primary`,
      [
        addr.id,
        addr.user_id,
        addr.label,
        addr.full_name,
        addr.street,
        addr.city,
        addr.state,
        addr.zip_code,
        addr.country,
        addr.is_primary,
      ]
    );
  }
}

async function createTestInvoice(pool: Pool) {
  await pool.query(
    `INSERT INTO user_invoices (id, user_id, state, file_url, filename, file_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       state = EXCLUDED.state,
       file_url = EXCLUDED.file_url,
       filename = EXCLUDED.filename,
       file_type = EXCLUDED.file_type`,
    [
      TEST_INVOICE_ID,
      TEST_CUSTOMER_ID,
      'TX',
      'https://test-bucket.s3.amazonaws.com/test-invoice.pdf',
      'farm_invoice_2024.pdf',
      'application/pdf',
    ]
  );
}

async function ensureTaxRates(pool: Pool) {
  const taxRates = [
    { state_code: 'TX', rate: 0.0625 },
    { state_code: 'CA', rate: 0.0725 },
    { state_code: 'FL', rate: 0.06 },
    { state_code: 'NY', rate: 0.08 },
  ];

  for (const rate of taxRates) {
    await pool.query(
      `INSERT INTO tax_rates (id, state_code, rate, effective_date, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), true, 'test-seed', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), rate.state_code, rate.rate]
    );
  }
}

async function createTestOrders(pool: Pool) {
  const shippingAddress = {
    label: 'Farm HQ',
    fullName: 'Test Customer',
    street: '123 Farm Road',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    country: 'United States',
  };

  const orders = [
    {
      id: TEST_ORDER_1_ID,
      order_number: 'ORD-TEST-001',
      status: 'delivered',
      subtotal: 239.98,
      tax: 15.00,
      delivery_fee: 9.99,
      total: 264.97,
      items: [
        { product_id: 'test-product-001', name: 'Test Herbicide Pro', price: 149.99, quantity: 1 },
        { product_id: 'test-product-002', name: 'Premium Fertilizer Blend', price: 89.99, quantity: 1 },
      ],
    },
    {
      id: TEST_ORDER_2_ID,
      order_number: 'ORD-TEST-002',
      status: 'processing',
      subtotal: 59.99,
      tax: 3.75,
      delivery_fee: 0,
      total: 63.74,
      items: [
        { product_id: 'test-product-004', name: 'Organic Pest Control', price: 59.99, quantity: 1 },
      ],
    },
  ];

  for (const order of orders) {
    // Create order
    await pool.query(
      `INSERT INTO orders (id, user_id, order_number, status, shipping_address, billing_address, delivery_method, delivery_fee, subtotal, tax, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, 'standard', $6, $7, $8, $9, NOW() - interval '${order.id === TEST_ORDER_1_ID ? '30' : '7'} days', NOW())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        order.id,
        TEST_CUSTOMER_ID,
        order.order_number,
        order.status,
        JSON.stringify(shippingAddress),
        order.delivery_fee,
        order.subtotal,
        order.tax,
        order.total,
      ]
    );

    // Create order items
    for (const item of order.items) {
      await pool.query(
        `INSERT INTO order_items (id, order_id, product_id, name, price, quantity, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [randomUUID(), order.id, item.product_id, item.name, item.price, item.quantity]
      );
    }
  }
}

// Run the seed script
seedTestDatabase();
