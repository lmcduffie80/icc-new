import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { getAdminSession } from '@/lib/admin-auth';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { contractSendEmailSchema } from '@/lib/validation';
import { queryOne } from '@/lib/db';
import { generateContractPDF } from '@/lib/contract-pdf';
import { sendContractEmail } from '@/lib/email';

interface ContractRow {
  id: string;
  contract_type: string;
  version: number;
  status: string;
  content: {
    template: string;
    effective_date: string;
    expiry_date?: string | null;
    supplier_name: string;
    supplier_company: string;
    supplier_address_street?: string | null;
    supplier_address_city?: string | null;
    supplier_address_state?: string | null;
    supplier_address_zip?: string | null;
    terms: string;
    custom_clauses?: string[];
    products: Array<{
      product_id: string;
      name: string;
      sku?: string | null;
      supplier_price: string;
      store_price: string;
      margin_split_icc_percent: string;
      margin_split_supplier_percent: string;
      icc_margin_amount: string;
      supplier_margin_amount: string;
      unit_of_measure?: string | null;
    }>;
    version_notes?: string | null;
  };
  admin_signed_at: string | null;
  admin_signed_by_name: string | null;
  supplier_signed_at: string | null;
  supplier_signed_by_name: string | null;
}

/**
 * POST /api/admin/contracts/[id]/send-email
 * Send a contract via email with an attached PDF.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);

  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const validationResult = contractSendEmailSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/contracts/[id]/send-email',
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

    const { recipientEmail, recipientName, message, ccAdmin } = validationResult.data;
    const { id } = await params;

    const contract = await queryOne<ContractRow>(`
      SELECT
        sc.id,
        sc.contract_type,
        sc.version,
        sc.status,
        sc.content,
        sc.admin_signed_at,
        au.name as admin_signed_by_name,
        sc.supplier_signed_at,
        su.name as supplier_signed_by_name
      FROM supplier_contracts sc
      LEFT JOIN admin_users au ON sc.admin_signed_by = au.id
      LEFT JOIN supplier_users su ON sc.supplier_signed_by = su.id
      WHERE sc.id = $1
    `, [id]);

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    if (!contract.content) {
      return NextResponse.json(
        { error: 'Email is only available for in-app contracts' },
        { status: 400 }
      );
    }

    // Generate PDF attachment
    const pdfBytes = await generateContractPDF({
      content: contract.content,
      contractType: contract.contract_type,
      version: contract.version,
      status: contract.status,
      adminSignedAt: contract.admin_signed_at,
      adminSignedByName: contract.admin_signed_by_name,
      supplierSignedAt: contract.supplier_signed_at,
      supplierSignedByName: contract.supplier_signed_by_name,
    });

    const supplierCompany = contract.content.supplier_company.replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFilename = `Contract_${supplierCompany}_v${contract.version}.pdf`;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const portalUrl = `${baseUrl}/supplier/contracts`;

    const emailResult = await sendContractEmail({
      to: recipientEmail,
      recipientName,
      contractType: contract.contract_type,
      supplierCompany: contract.content.supplier_company,
      effectiveDate: contract.content.effective_date,
      version: contract.version,
      portalUrl,
      customMessage: message || undefined,
      cc: ccAdmin ? session.user.email : undefined,
      pdfBuffer: pdfBytes,
      pdfFilename,
      ip,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: `Failed to send email: ${emailResult.error}` },
        { status: 500 }
      );
    }

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: `/api/admin/contracts/${id}/send-email`,
      method: 'POST',
      details: {
        action: 'contract_email_sent',
        contractId: id,
        recipientEmail,
        recipientName,
        ccAdmin: !!ccAdmin,
        messageId: emailResult.messageId,
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      messageId: emailResult.messageId,
    });
  } catch (error) {
    console.error('Error sending contract email:', error);
    securityLogger.logError('Failed to send contract email', error, ip);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
