import { NextRequest, NextResponse } from 'next/server';
import { securityLogger } from '@/lib/security-logger';
import { refreshCompetitorPricing } from '@/lib/competitor-refresh';

// Refreshing N ingredients x 3 competitors at concurrency 3 can take several
// minutes. Request a longer function timeout (max 800s on Fluid Compute).
export const maxDuration = 600;

/**
 * POST /api/cron/refresh-competitor-pricing
 *
 * Called daily by Vercel Cron. Refreshes competitor pricing for every active
 * competitor across every distinct primary active ingredient currently in
 * the ICC catalog.
 *
 * Authenticated via Authorization: Bearer <CRON_SECRET> header.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[CRON] CRON_SECRET is not configured — skipping authentication check in dev');
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      path: '/api/cron/refresh-competitor-pricing',
      method: 'POST',
      details: { reason: 'Invalid cron secret' },
      severity: 'high',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await refreshCompetitorPricing();

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/api/cron/refresh-competitor-pricing',
      method: 'POST',
      details: {
        action: 'competitor_pricing_refreshed',
        ...summary,
      },
      severity: 'low',
    });

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    console.error('[CRON] Error running competitor pricing refresh:', error);
    securityLogger.logError(
      'Failed to run competitor pricing refresh cron',
      error,
      'system'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
