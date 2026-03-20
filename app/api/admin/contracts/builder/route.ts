import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { contractBuilderSchema } from '@/lib/validation';
import { query, queryOne } from '@/lib/db';

/**
 * POST /api/admin/contracts/builder
 * Creates a new structured in-app contract (or a new version of an existing one).
 * Stores the contract content as JSONB in supplier_contracts.content.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasPermission = session.permissions.includes('admins.view');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/contracts/builder',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const validationResult = contractBuilderSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/contracts/builder',
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
    const partnerType = data.partnerType || 'supplier';

    // Fetch partner info from the correct table based on partner type
    let partnerName: string;
    let partnerCompany: string;

    if (partnerType === 'vendor') {
      const vendor = await queryOne<{ name: string }>(`
        SELECT name FROM vendors WHERE id = $1
      `, [data.supplierId]);
      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }
      partnerName = vendor.name;
      partnerCompany = vendor.name;
    } else {
      const supplier = await queryOne<{ name: string; company_name: string }>(`
        SELECT name, company_name FROM supplier_users WHERE id = $1
      `, [data.supplierId]);
      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      }
      partnerName = supplier.name;
      partnerCompany = supplier.company_name;
    }

    // Determine version number and parent contract handling
    let version = 1;
    let parentContractId: string | null = null;

    if (data.parentContractId) {
      const parentContract = await queryOne<{ id: string; version: number; supplier_id: string }>(`
        SELECT id, version, supplier_id FROM supplier_contracts WHERE id = $1
      `, [data.parentContractId]);

      if (!parentContract) {
        return NextResponse.json({ error: 'Parent contract not found' }, { status: 404 });
      }

      if (parentContract.supplier_id !== data.supplierId) {
        return NextResponse.json(
          { error: 'Parent contract belongs to a different supplier' },
          { status: 400 }
        );
      }

      version = parentContract.version + 1;
      parentContractId = parentContract.id;
    }

    // Build the structured content JSONB
    const content = {
      template: 'supply_agreement',
      effective_date: data.effectiveDate,
      expiry_date: data.expiryDate || null,
      supplier_name: partnerName,
      supplier_company: partnerCompany,
      supplier_address_street: data.supplierAddressStreet || null,
      supplier_address_city: data.supplierAddressCity || null,
      supplier_address_state: data.supplierAddressState || null,
      supplier_address_zip: data.supplierAddressZip || null,
      partner_type: partnerType,
      terms: data.terms,
      custom_clauses: data.customClauses || [],
      products: data.products,
      version_notes: data.versionNotes || null,
    };

    const result = await query<{ id: string }>(`
      INSERT INTO supplier_contracts (
        supplier_id,
        partner_type,
        contract_type,
        contract_date,
        expiry_date,
        version,
        status,
        content,
        parent_contract_id,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      RETURNING *
    `, [
      data.supplierId,
      partnerType,
      data.contractType,
      data.effectiveDate,
      data.expiryDate || null,
      version,
      data.status || 'draft',
      JSON.stringify(content),
      parentContractId,
      data.versionNotes || null,
    ]);

    const contract = result[0];

    logAdminAction(
      authResult.session!,
      'create_structured_contract',
      contract.id,
      ip,
      {
        supplierId: data.supplierId,
        partnerType,
        contractType: data.contractType,
        version,
        parentContractId,
      }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/admin/contracts/builder',
      method: 'POST',
      details: {
        action: 'structured_contract_created',
        contractId: contract.id,
        supplierId: data.supplierId,
        partnerType,
        version,
        parentContractId,
      },
      severity: 'low',
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error('Error creating structured contract:', error);
    securityLogger.logError('Failed to create structured contract', error, ip);
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
  }
}
