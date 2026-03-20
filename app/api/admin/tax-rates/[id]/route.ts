import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logAction } from '@/lib/audit';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { taxRateUpdateSchema } from '@/lib/validation';
import { getTaxRateById, updateTaxRate, deleteTaxRate } from '@/lib/tax';
import { securityLogger } from '@/lib/security-logger';

/**
 * PUT /api/admin/tax-rates/[id] - Update a tax rate
 * Requires: settings.update_tax permission
 * 
 * Only allows updating future-effective rates
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('settings.update_tax');
  if (auth.error) return auth.error;

  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const body = await request.json();
    
    // Validate input
    const result = taxRateUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const updates = result.data;

    // Get existing tax rate for audit
    const before = await getTaxRateById(id);
    if (!before) {
      return NextResponse.json(
        { error: 'Tax rate not found' },
        { status: 404 }
      );
    }

    // Validate rate if provided
    if (updates.rate !== undefined && updates.rate > 0.2) {
      return NextResponse.json(
        { error: 'Tax rate exceeds maximum allowed (20%)' },
        { status: 400 }
      );
    }

    // Convert effective date string to Date object if provided
    const updatePayload: {
      rate?: number;
      effectiveDate?: Date;
      isActive?: boolean;
    } = {};

    if (updates.rate !== undefined) {
      updatePayload.rate = updates.rate;
    }

    if (updates.effectiveDate !== undefined) {
      updatePayload.effectiveDate = new Date(updates.effectiveDate);
    }

    if (updates.isActive !== undefined) {
      updatePayload.isActive = updates.isActive;
    }

    // Update the tax rate (will return null if not updatable)
    const taxRate = await updateTaxRate(id, updatePayload);

    if (!taxRate) {
      return NextResponse.json(
        { error: 'Cannot update tax rate. Only future-effective rates can be modified.' },
        { status: 400 }
      );
    }

    // Log the action
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'tax_rate',
      resourceId: taxRate.id,
      before: before as unknown as Record<string, unknown>,
      after: taxRate as unknown as Record<string, unknown>,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/tax-rates/${id}`,
      method: 'PUT',
      details: {
        action: 'update_tax_rate',
        taxRateId: id,
        updates,
      },
      userId: auth.session.adminUser.id,
      severity: 'medium',
    });

    return NextResponse.json(taxRate);
  } catch (error) {
    console.error('Error updating tax rate:', error);
    
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    securityLogger.logError('update_tax_rate_failed', error, ip);
    
    return NextResponse.json(
      { error: 'Failed to update tax rate' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tax-rates/[id] - Delete a tax rate
 * Requires: settings.update_tax permission
 * 
 * Only allows deleting future-effective rates
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('settings.update_tax');
  if (auth.error) return auth.error;

  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    // Get existing tax rate for audit
    const before = await getTaxRateById(id);
    if (!before) {
      return NextResponse.json(
        { error: 'Tax rate not found' },
        { status: 404 }
      );
    }

    // Delete the tax rate (will return false if not deletable)
    const success = await deleteTaxRate(id);

    if (!success) {
      return NextResponse.json(
        { error: 'Tax rate not found or could not be deleted.' },
        { status: 400 }
      );
    }

    // Log the action
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'tax_rate',
      resourceId: id,
      before: before as unknown as Record<string, unknown>,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/tax-rates/${id}`,
      method: 'DELETE',
      details: {
        action: 'delete_tax_rate',
        taxRateId: id,
        stateCode: before.stateCode,
      },
      userId: auth.session.adminUser.id,
      severity: 'high',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tax rate:', error);
    
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    securityLogger.logError('delete_tax_rate_failed', error, ip);
    
    return NextResponse.json(
      { error: 'Failed to delete tax rate' },
      { status: 500 }
    );
  }
}
