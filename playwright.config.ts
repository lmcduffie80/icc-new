import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Run: pnpm test:e2e
 * UI Mode: pnpm test:e2e:ui
 * Debug: pnpm test:e2e:debug
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  projects: [
    // Setup project for customer authentication
    {
      name: 'customer-setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Setup project for admin authentication
    {
      name: 'admin-setup',
      testMatch: /admin-auth\.setup\.ts/,
    },
    // Tests that require customer authentication
    {
      name: 'customer-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './e2e/.auth/customer.json',
      },
      dependencies: ['customer-setup'],
      testMatch: /\/(account|cart|checkout)\/.*\.spec\.ts/,
    },
    // Tests that require admin authentication
    {
      name: 'admin-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './e2e/.auth/admin.json',
      },
      dependencies: ['admin-setup'],
      testMatch: /\/admin\/.*\.spec\.ts/,
    },
    // Tests that don't require authentication
    {
      name: 'public-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\/(auth|shop)\/.*\.spec\.ts/,
    },
  ],

  webServer: {
    // Use dotenv to load .env.test so the server connects to the test database
    command: 'pnpm exec dotenv -e .env.test -- pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
