import { NextResponse } from 'next/server';

/**
 * GET /api/ping - Minimal zero-dependency health check
 * Tests if Vercel serverless functions are running at all.
 * No database, no lib/ imports, no side effects.
 */
export async function GET() {
  const envVars = [
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

  const status: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const name of envVars) {
    const isSet = !!process.env[name];
    status[name] = isSet;
    if (!isSet) missing.push(name);
  }

  return NextResponse.json({
    pong: true,
    time: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    region: process.env.VERCEL_REGION || 'unknown',
    missing,
    status,
  });
}
