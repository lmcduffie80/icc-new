import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { getAllTaxRates } from '@/lib/tax';
import { verifyTaxRates } from '@/lib/tax-rate-verifier';

/**
 * POST /api/admin/tax-rates/verify
 *
 * Uses Claude AI to verify all configured tax rates against its knowledge
 * of current US state tax rates for agricultural inputs.
 *
 * Requires: settings.view_tax permission
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('settings.view_tax');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/tax-rates/verify', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const allRates = await getAllTaxRates();

    if (allRates.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Deduplicate: use the most recent active rate per state
    const latestByState = new Map<string, { stateCode: string; rate: number }>();
    for (const r of allRates) {
      if (!latestByState.has(r.stateCode) && r.isActive) {
        latestByState.set(r.stateCode, { stateCode: r.stateCode, rate: r.rate });
      }
    }

    const ratesToVerify = Array.from(latestByState.values());

    if (ratesToVerify.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await verifyTaxRates(ratesToVerify);

    if (!results) {
      return NextResponse.json(
        { error: 'AI verification is not available. Ensure ANTHROPIC_API_KEY is configured.' },
        { status: 503 }
      );
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/tax-rates/verify',
      method: 'POST',
      details: {
        action: 'verify_tax_rates_ai',
        stateCount: ratesToVerify.length,
      },
      userId: auth.session.adminUser.id,
      severity: 'low',
    });

    return NextResponse.json({ results });
  } catch (error) {
    securityLogger.logError('verify_tax_rates_failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
