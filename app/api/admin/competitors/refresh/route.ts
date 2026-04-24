import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { refreshCompetitorPricing } from '@/lib/competitor-refresh';
import { securityLogger } from '@/lib/security-logger';

export const maxDuration = 300;

/**
 * POST /api/admin/competitors/refresh
 *
 * Admin manual trigger for the competitor pricing refresh. Accepts optional
 * query parameters to narrow scope:
 *   - productId: refresh only the primary ingredient of this product
 *   - ingredient: refresh only this normalized active ingredient
 *   - competitorId: refresh only this competitor (by id or slug)
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get('productId') ?? undefined;
  const ingredient = url.searchParams.get('ingredient') ?? undefined;
  const competitorId = url.searchParams.get('competitorId') ?? undefined;

  try {
    const summary = await refreshCompetitorPricing({
      productId,
      ingredient,
      competitorId,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/api/admin/competitors/refresh',
      method: 'POST',
      details: {
        action: 'competitor_pricing_manual_refresh',
        scope: { productId, ingredient, competitorId },
        ...summary,
      },
      severity: 'low',
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error('[ADMIN] Error running competitor pricing refresh:', error);
    securityLogger.logError(
      'Failed to run competitor pricing manual refresh',
      error,
      'admin'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
