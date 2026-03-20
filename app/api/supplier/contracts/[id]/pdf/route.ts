import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { queryOne } from '@/lib/db';
import { generateContractPDF } from '@/lib/contract-pdf';

interface ContractRow {
  id: string;
  supplier_id: string;
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
 * GET /api/supplier/contracts/[id]/pdf
 * Generate and download a PDF for a supplier's contract.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSupplierSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    const contract = await queryOne<ContractRow>(`
      SELECT
        sc.id,
        sc.supplier_id,
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

    if (contract.supplier_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!contract.content) {
      return NextResponse.json(
        { error: 'PDF generation is only available for in-app contracts' },
        { status: 400 }
      );
    }

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
    const filename = `Contract_${supplierCompany}_v${contract.version}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error generating supplier contract PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
