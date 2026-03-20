import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { checkRateLimit, rateLimiters, getClientIp, createRateLimitResponse } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query, queryOne } from '@/lib/db';

// POST: Supplier signs contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/supplier/contracts/[id]/sign', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Check supplier auth
  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Get contract to validate
    const existingContract = await queryOne<{ 
      status: string; 
      supplier_id: string; 
      admin_signed_at: string | null; 
      supplier_signed_at: string | null;
      parent_contract_id: string | null;
      content: object | null;
    }>(`
      SELECT status, supplier_id, admin_signed_at, supplier_signed_at, parent_contract_id, content 
      FROM supplier_contracts 
      WHERE id = $1
    `, [id]);

    if (!existingContract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const { status, supplier_id, admin_signed_at, supplier_signed_at, parent_contract_id, content } = existingContract;

    // Validate contract belongs to this supplier
    if (supplier_id !== session.user.id) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        userId: session.user.id,
        ip,
        path: '/api/supplier/contracts/[id]/sign',
        method: 'POST',
        details: { contractId: id, reason: 'Unauthorized - contract belongs to different supplier' },
        severity: 'high',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if already signed by supplier
    if (supplier_signed_at) {
      return NextResponse.json(
        { error: 'Contract already signed by supplier' },
        { status: 400 }
      );
    }

    // Validate status is pending_supplier_signature
    if (status !== 'pending_supplier_signature') {
      return NextResponse.json(
        { error: `Cannot sign contract with status: ${status}` },
        { status: 400 }
      );
    }

    // Validate admin has already signed (in-app contracts don't require admin_signed_at)
    const isInAppContract = !!content;
    if (!admin_signed_at && !isInAppContract) {
      return NextResponse.json(
        { error: 'Contract must be signed by admin first' },
        { status: 400 }
      );
    }

    // Update contract with supplier signature
    const result = await query(`
      UPDATE supplier_contracts
      SET 
        supplier_signed_at = NOW(),
        supplier_signed_by = $1,
        status = 'active',
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [session.user.id, id]);

    const contract = result[0];

    // Auto-supersede the parent contract if this is a new version
    if (parent_contract_id) {
      await query(`
        UPDATE supplier_contracts
        SET status = 'superseded', updated_at = NOW()
        WHERE id = $1 AND status = 'active'
      `, [parent_contract_id]);

      securityLogger.logEvent({
        type: 'admin_action',
        userId: session.user.id,
        ip,
        path: '/api/supplier/contracts/[id]/sign',
        method: 'POST',
        details: {
          action: 'contract_auto_superseded',
          supersededContractId: parent_contract_id,
          newActiveContractId: id,
        },
        severity: 'low',
      });
    }

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/supplier/contracts/[id]/sign',
      method: 'POST',
      details: { action: 'contract_signed', contractId: id, signedBy: 'supplier' },
      severity: 'low',
    });

    return NextResponse.json({ contract });
  } catch (error) {
    console.error('Error signing contract:', error);
    securityLogger.logError('Failed to sign contract', error, ip);
    return NextResponse.json({ error: 'Failed to sign contract' }, { status: 500 });
  }
}
