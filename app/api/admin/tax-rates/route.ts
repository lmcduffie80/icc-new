import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logAction } from '@/lib/audit';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { taxRateCreateSchema } from '@/lib/validation';
import { getAllTaxRates, createTaxRate } from '@/lib/tax';
import { securityLogger } from '@/lib/security-logger';

/**
 * GET /api/admin/tax-rates - List all tax rates (active and historical)
 * Requires: settings.view_tax permission
 */
export async function GET() {
  const auth = await requireAdmin('settings.view_tax');
  if (auth.error) return auth.error;

  try {
    const taxRates = await getAllTaxRates();
    return NextResponse.json(taxRates);
  } catch (error) {
    console.error('Error fetching tax rates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tax rates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tax-rates - Create a new tax rate
 * Requires: settings.update_tax permission
 * 
 * When creating a new rate for a state, automatically deactivates old rates for that state
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('settings.update_tax');
  if (auth.error) return auth.error;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const body = await request.json();
    
    // Validate input
    const result = taxRateCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const { stateCode, rate, effectiveDate } = result.data;
    
    // Convert effective date string to Date object if provided, otherwise use now
    const effectiveDateObj = effectiveDate ? new Date(effectiveDate) : new Date();
    
    // Validate rate is reasonable (0-20%)
    if (rate > 0.2) {
      return NextResponse.json(
        { error: 'Tax rate exceeds maximum allowed (20%)' },
        { status: 400 }
      );
    }

    // Create the tax rate (this will automatically deactivate old rates)
    const taxRate = await createTaxRate(
      stateCode,
      rate,
      effectiveDateObj,
      auth.session.adminUser.id
    );

    // Log the action
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'tax_rate',
      resourceId: taxRate.id,
      after: taxRate as unknown as Record<string, unknown>,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/tax-rates',
      method: 'POST',
      details: {
        action: 'create_tax_rate',
        taxRateId: taxRate.id,
        stateCode,
        rate,
        effectiveDate: effectiveDateObj.toISOString(),
      },
      userId: auth.session.adminUser.id,
      severity: 'medium',
    });

    return NextResponse.json(taxRate, { status: 201 });
  } catch (error) {
    console.error('Error creating tax rate:', error);
    
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    securityLogger.logError('create_tax_rate_failed', error, ip);
    
    return NextResponse.json(
      { error: 'Failed to create tax rate' },
      { status: 500 }
    );
  }
}
