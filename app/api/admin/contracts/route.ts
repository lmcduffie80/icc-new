import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { contractCreateSchema } from '@/lib/validation';
import { query } from '@/lib/db';

// GET: List all contracts with optional filters
export async function GET(request: NextRequest) {
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
      '/api/admin/contracts',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const status = searchParams.get('status');
    const contractType = searchParams.get('contractType');
    const search = searchParams.get('search');

    // Build query with filters
    let queryText = `
      SELECT 
        sc.*,
        su.name as supplier_name,
        su.company_name as supplier_company_name,
        au.name as admin_signed_by_name,
        su2.name as supplier_signed_by_name
      FROM supplier_contracts sc
      LEFT JOIN supplier_users su ON sc.supplier_id = su.id
      LEFT JOIN admin_users au ON sc.admin_signed_by = au.id
      LEFT JOIN supplier_users su2 ON sc.supplier_signed_by = su2.id
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let paramIndex = 1;

    if (supplierId) {
      queryText += ` AND sc.supplier_id = $${paramIndex}`;
      params.push(supplierId);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND sc.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (contractType) {
      queryText += ` AND sc.contract_type = $${paramIndex}`;
      params.push(contractType);
      paramIndex++;
    }

    if (search) {
      queryText += ` AND (su.name ILIKE $${paramIndex} OR su.company_name ILIKE $${paramIndex} OR sc.filename ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY sc.created_at DESC`;

    const result = await query(queryText, params);

    return NextResponse.json({ contracts: result });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    securityLogger.logError('Failed to fetch contracts', error, ip);
    return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
  }
}

// POST: Create new contract
export async function POST(request: NextRequest) {
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
      '/api/admin/contracts',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Validate input
    const validationResult = contractCreateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/contracts',
        ip,
        validationResult.error.issues,
        'POST'
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

    const data = validationResult.data;

    // Create contract in database
    const result = await query<{ id: string }>(`
      INSERT INTO supplier_contracts (
        supplier_id,
        file_url,
        filename,
        file_size,
        contract_type,
        contract_date,
        expiry_date,
        notes,
        version,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
      RETURNING *
    `, [
      data.supplierId,
      data.fileUrl,
      data.filename,
      data.fileSize,
      data.contractType,
      data.contractDate,
      data.expiryDate || null,
      data.notes || null,
      data.version
    ]);

    const contract = result[0];

    // Log the action
    logAdminAction(
      authResult.session!,
      'create_contract',
      contract.id,
      ip,
      { supplierId: data.supplierId, contractType: data.contractType }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/admin/contracts',
      method: 'POST',
      details: { action: 'contract_created', contractId: contract.id, supplierId: data.supplierId },
      severity: 'low',
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error('Error creating contract:', error);
    securityLogger.logError('Failed to create contract', error, ip);
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
  }
}
