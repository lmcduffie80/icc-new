import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Check if Upstash credentials are valid
const hasValidUpstashCredentials =
  process.env.UPSTASH_REDIS_REST_URL?.startsWith('https://') &&
  process.env.UPSTASH_REDIS_REST_TOKEN &&
  process.env.UPSTASH_REDIS_REST_TOKEN.length > 10;

// Initialize Redis client only if credentials are valid
export const redis = hasValidUpstashCredentials
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Log warning in development if rate limiting is disabled
if (!redis && process.env.NODE_ENV !== 'production') {
  console.warn('[Rate Limit] Upstash Redis credentials not configured. Rate limiting is disabled.');
}

// Type for rate limiter (either real Upstash Ratelimit or mock)
type RateLimiterLike = {
  limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

// Create a rate limiter that uses Redis if available, otherwise always allows
function createRateLimiter(config: { limit: number; window: string; prefix: string }): RateLimiterLike {
  if (!redis) {
    // Return a mock rate limiter that always allows requests
    return {
      limit: async () => ({ success: true, remaining: config.limit, reset: Date.now() + 60000 }),
    };
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window as '1 m'),
    analytics: true,
    prefix: config.prefix,
  });
}

// Rate limit configurations
export const rateLimiters = {
  // Critical routes - 3-5 req/min per IP
  critical: createRateLimiter({ limit: 5, window: '1 m', prefix: '@ecommerce/critical' }),

  // Auth routes - 5 req/min per IP
  auth: createRateLimiter({ limit: 5, window: '1 m', prefix: '@ecommerce/auth' }),

  // Upload routes - 10 req/min per IP
  upload: createRateLimiter({ limit: 10, window: '1 m', prefix: '@ecommerce/upload' }),

  // Moderate routes - 20 req/min per IP
  moderate: createRateLimiter({ limit: 20, window: '1 m', prefix: '@ecommerce/moderate' }),

  // Relaxed routes - 60 req/min per IP
  relaxed: createRateLimiter({ limit: 60, window: '1 m', prefix: '@ecommerce/relaxed' }),

  // Admin routes - 100 req/min per admin user
  admin: createRateLimiter({ limit: 100, window: '1 m', prefix: '@ecommerce/admin' }),
};

// Get client IP address from request
export function getClientIp(request: Request): string {
  // Check common headers for IP address
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  if (cfConnectingIp) return cfConnectingIp;
  if (realIp) return realIp;
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  return 'unknown';
}

// Rate limit middleware helper
export async function checkRateLimit(
  request: Request,
  limiter: RateLimiterLike,
  identifier?: string
): Promise<{ success: boolean; remaining?: number; reset?: number }> {
  // If rate limiting is not configured, allow all requests
  if (!limiter) {
    return { success: true };
  }

  const id = identifier || getClientIp(request);

  try {
    const { success, remaining, reset } = await limiter.limit(id);

    if (!success) {
      return {
        success: false,
        remaining: 0,
        reset: reset,
      };
    }

    return {
      success: true,
      remaining,
      reset,
    };
  } catch (error) {
    // If Redis is down, allow the request but log the error
    console.error('Rate limit check failed:', error);
    return { success: true };
  }
}

// Helper to create rate limit response
export function createRateLimitResponse(reset?: number): Response {
  const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 60;

  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
      },
    }
  );
}

/**
 * Email-based rate limiting for password reset requests
 * Prevents abuse by limiting requests per email address
 */
export async function checkEmailBasedRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ success: boolean; remaining?: number; reset?: number }> {
  // If Redis is not configured, allow all requests
  if (!redis) {
    return { success: true, remaining: maxRequests, reset: Date.now() + windowSeconds * 1000 };
  }

  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
      analytics: true,
      prefix: '@ecommerce/email-reset',
    });

    const { success, remaining, reset } = await limiter.limit(key);

    return {
      success,
      remaining,
      reset,
    };
  } catch (error) {
    console.error('Email rate limit check failed:', error);
    return { success: true }; // Fail open
  }
}
