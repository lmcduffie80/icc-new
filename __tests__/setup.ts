import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Set up test environment variables
process.env.RESEND_API_KEY = 'test_api_key';
process.env.EMAIL_FROM = 'test@example.com';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_stripe_key';

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock Vercel Analytics
vi.mock('@vercel/analytics/next', () => ({
  Analytics: () => null,
}));

// Mock Vercel Speed Insights
vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => null,
}));

// Mock Upstash Redis
vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      constructor() {}
      get = vi.fn().mockResolvedValue(null);
      set = vi.fn().mockResolvedValue('OK');
      del = vi.fn().mockResolvedValue(1);
      incr = vi.fn().mockResolvedValue(1);
      expire = vi.fn().mockResolvedValue(1);
    },
  };
});

// Mock Upstash Ratelimit
vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class MockRatelimit {
      constructor() {}
      limit = vi.fn().mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60000,
        pending: Promise.resolve(),
      });
      static slidingWindow = vi.fn((requests: number, window: string) => ({
        requests,
        window,
      }));
    },
  };
});

// Mock Resend
vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({
          data: { id: 'mock-email-id-123' },
        }),
      };
    },
  };
});

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      constructor() {}
      paymentIntents = {
        retrieve: vi.fn().mockResolvedValue({
          id: 'pi_mock_123',
          status: 'succeeded',
          amount: 10000,
          payment_method: 'pm_mock_123',
          metadata: {},
        }),
      };
      paymentMethods = {
        retrieve: vi.fn().mockResolvedValue({
          id: 'pm_mock_123',
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2025,
          },
        }),
      };
    },
  };
});

// Mock Database (Neon SQL)
vi.mock('@/lib/db', () => {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
    pool: {},
    withTransaction: vi.fn().mockResolvedValue(undefined),
    getPoolInstance: vi.fn(),
    closePool: vi.fn().mockResolvedValue(undefined),
    getPoolStats: vi.fn().mockReturnValue({ configured: false }),
    testConnection: vi.fn().mockResolvedValue({ connected: false }),
  };
});

// Mock pg (used directly by lib/auth.ts) to prevent real database connections
vi.mock('pg', () => {
  class MockPool {
    constructor() {}
    connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    });
    query = vi.fn().mockResolvedValue({ rows: [] });
    end = vi.fn().mockResolvedValue(undefined);
    on = vi.fn().mockReturnThis();
    totalCount = 0;
    idleCount = 0;
    waitingCount = 0;
  }
  class MockClient {
    query = vi.fn().mockResolvedValue({ rows: [] });
    release = vi.fn();
  }
  return { Pool: MockPool, Client: MockClient };
});

// Mock @neondatabase/serverless to prevent real database connections
vi.mock('@neondatabase/serverless', () => {
  const mockNeon = vi.fn().mockReturnValue(
    vi.fn().mockResolvedValue([])
  );
  return { neon: mockNeon, Pool: class MockNeonPool {
    constructor() {}
    connect = vi.fn().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() });
    query = vi.fn().mockResolvedValue({ rows: [] });
    end = vi.fn().mockResolvedValue(undefined);
    on = vi.fn().mockReturnThis();
  }};
});

// Mock Admin Auth (partial mock to preserve actual functions)
vi.mock('@/lib/admin-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-auth')>();
  return {
    ...actual,
    getAdminSession: vi.fn().mockResolvedValue(null),
    hashAdminPassword: vi.fn().mockResolvedValue('hashed_password'),
    verifyAdminPassword: vi.fn().mockResolvedValue(true),
  };
});

// Mock Next.js fonts to prevent hanging
vi.mock('next/font/google', () => ({
  Geist: vi.fn(() => ({
    className: 'geist-sans',
    variable: '--font-geist-sans',
    style: { fontFamily: 'sans-serif' },
  })),
  Geist_Mono: vi.fn(() => ({
    className: 'geist-mono',
    variable: '--font-geist-mono',
    style: { fontFamily: 'monospace' },
  })),
}));

// Mock Next.js headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: vi.fn(() => ({ value: 'mock-cookie' })),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(() => false),
  })),
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  usePathname: () => '/test-path',
  redirect: vi.fn(),
}));

// Mock AWS SDK to prevent connection attempts
vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = vi.fn().mockResolvedValue({});
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-signed-url.com'),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

global.localStorage = localStorageMock as unknown as Storage;

// Reset localStorage mock before each test
afterEach(() => {
  localStorageMock.getItem.mockReset();
  localStorageMock.setItem.mockReset();
  localStorageMock.removeItem.mockReset();
  localStorageMock.clear.mockReset();
  localStorageMock.key.mockReset();
});

