import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/db';

/**
 * GET /api/health - Production health check endpoint
 * Reports database connectivity, environment variable presence, and runtime info.
 * Does NOT expose secret values - only reports whether variables are set.
 *
 * Query params:
 *   ?skip-db=true  - Skip database test (fast response for env var checks)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const skipDb = request.nextUrl.searchParams.get('skip-db') === 'true';

  // Check required environment variables (presence only, never values)
  const requiredEnvVars = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'NEXT_PUBLIC_APP_URL',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET_NAME',
    'ADMIN_SECRET',
  ];

  const envStatus: Record<string, boolean> = {};
  const missingVars: string[] = [];

  for (const varName of requiredEnvVars) {
    const isSet = !!process.env[varName];
    envStatus[varName] = isSet;
    if (!isSet) {
      missingVars.push(varName);
    }
  }

  // Safe preview of URL-type vars (show domain only, not secrets)
  const urlPreviews: Record<string, string> = {};
  const urlVars = ['BETTER_AUTH_URL', 'NEXT_PUBLIC_APP_URL', 'UPSTASH_REDIS_REST_URL'];
  for (const varName of urlVars) {
    const val = process.env[varName];
    if (val) {
      try {
        const url = new URL(val);
        urlPreviews[varName] = `${url.protocol}//${url.hostname}`;
      } catch {
        urlPreviews[varName] = '(invalid URL)';
      }
    }
  }

  // Test database connectivity (unless skipped)
  let dbStatus: { connected: boolean; responseTime?: number; error?: string };
  if (skipDb) {
    dbStatus = { connected: false, error: 'Skipped (skip-db=true)' };
  } else {
    try {
      const dbPromise = testConnection();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timed out after 8s')), 8000)
      );
      dbStatus = await Promise.race([dbPromise, timeoutPromise]);
    } catch (error) {
      dbStatus = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Runtime info
  const runtime = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    env: process.env.NODE_ENV || 'unknown',
    vercel: !!process.env.VERCEL,
    region: process.env.VERCEL_REGION || 'unknown',
  };

  const responseTime = Date.now() - startTime;
  const envHealthy = missingVars.length === 0;
  const healthy = dbStatus.connected && envHealthy;

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      database: dbStatus,
      environment: {
        allSet: envHealthy,
        missing: missingVars,
        vars: envStatus,
        urlPreviews,
      },
      runtime,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
