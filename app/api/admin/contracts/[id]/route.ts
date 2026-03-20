import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { contractUpdateSchema } from '@/lib/validation';
import { query, queryOne } from '@/lib/db';
import { deleteFromS3, getKeyFromUrl } from '@/lib/s3';

// GET: Get contract details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  
  // Verify admin auth
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check permission
  const hasPermission = session.permissions.includes('admins.view');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/contracts/[id]',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const contract = await queryOne(`
      SELECT 
        sc.*,
        su.name as supplier_name,
        su.company_name as supplier_company_name,
        au.name as admin_signed_by_name
      FROM supplier_contracts sc
      LEFT JOIN supplier_users su ON sc.supplier_id = su.id
      LEFT JOIN admin_users au ON sc.admin_signed_by = au.id
      WHERE sc.id = $1
    `, [id]);

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Include supplier_id in the response for the contract builder "new version" mode
    return NextResponse.json({ contract });
  } catch (error) {
    console.error('Error fetching contract:', error);
    securityLogger.logError('Failed to fetch contract', error, ip);
    return NextResponse.json({ error: 'Failed to fetch contract' }, { status: 500 });
  }
}

// PUT: Update contract metadata (not file)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  
  // Verify admin auth
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check permission
  const hasPermission = session.permissions.includes('admins.view');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/contracts/[id]',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = contractUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/contracts/[id]',
        ip,
        validationResult.error.issues,
        'PUT'
      );
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Check if contract exists and get its status
    const existingContract = await queryOne<{ status: string }>(`
      SELECT status FROM supplier_contracts WHERE id = $1
    `, [id]);

    if (!existingContract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const currentStatus = existingContract.status;

    // Cannot update if contract is active or superseded
    if (currentStatus === 'active' || currentStatus === 'superseded') {
      return NextResponse.json(
        { error: `Cannot update contract with status: ${currentStatus}` },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.contractType !== undefined) {
      updates.push(`contract_type = $${paramIndex}`);
      values.push(data.contractType);
      paramIndex++;
    }

    if (data.contractDate !== undefined) {
      updates.push(`contract_date = $${paramIndex}`);
      values.push(data.contractDate);
      paramIndex++;
    }

    if (data.expiryDate !== undefined) {
      updates.push(`expiry_date = $${paramIndex}`);
      values.push(data.expiryDate);
      paramIndex++;
    }

    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      values.push(data.notes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);

    const queryText = `
      UPDATE supplier_contracts 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    values.push(id);

    const result = await query(queryText, values);
    const contract = result[0];

    // Log the action
    logAdminAction(
      authResult.session!,
      'update_contract',
      id,
      ip,
      { updates: Object.keys(body) }
    );

    return NextResponse.json({ contract });
  } catch (error) {
    console.error('Error updating contract:', error);
    securityLogger.logError('Failed to update contract', error, ip);
    return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 });
  }
}

// DELETE: Delete contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  
  // Verify admin auth
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check permission
  const hasPermission = session.permissions.includes('contracts.delete');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/contracts/[id]',
      'contracts.delete',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Get contract to check status and get file URL
    const contract = await queryOne<{ status: string; file_url: string | null }>(`
      SELECT status, file_url FROM supplier_contracts WHERE id = $1
    `, [id]);

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const { status, file_url } = contract;

    // Delete from database
    await query(`DELETE FROM supplier_contracts WHERE id = $1`, [id]);

    // Delete file from S3 (only for PDF-based contracts)
    if (file_url) {
      try {
        const s3Key = getKeyFromUrl(file_url);
        if (s3Key) {
          await deleteFromS3(s3Key);
        }
      } catch (s3Error) {
        console.error('Error deleting contract file from S3:', s3Error);
      }
    }

    // Log the action
    logAdminAction(
      authResult.session!,
      'delete_contract',
      id,
      ip,
      { status }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/admin/contracts/[id]',
      method: 'DELETE',
      details: { action: 'contract_deleted', contractId: id },
      severity: 'medium',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    securityLogger.logError('Failed to delete contract', error, ip);
    return NextResponse.json({ error: 'Failed to delete contract' }, { status: 500 });
  }
}
