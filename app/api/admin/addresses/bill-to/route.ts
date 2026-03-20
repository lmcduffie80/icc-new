import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

interface BillToAddress {
  id: number;
  type: string;
  company_name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
  updated_at: string;
}

// GET /api/admin/addresses/bill-to - Get the default bill-to address
export async function GET() {
  const auth = await requireAdmin('settings.view');
  if (auth.error) return auth.error;

  try {
    const address = await queryOne<BillToAddress>(
      `SELECT id, type, company_name, address1, address2, city, state, zip_code, country,
              is_default, updated_at
       FROM addresses
       WHERE type = 'BILL_TO' AND is_default = true
       LIMIT 1`
    );

    if (!address) {
      return NextResponse.json({ error: 'No default bill-to address found' }, { status: 404 });
    }

    return NextResponse.json(address);
  } catch (error) {
    console.error('Failed to fetch bill-to address:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/addresses/bill-to - Update the default bill-to address
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin('settings.update_store_info');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { company_name, address1, address2, city, state, zip_code, country } = body;

    if (!company_name || !address1 || !city || !state || !zip_code) {
      return NextResponse.json(
        { error: 'company_name, address1, city, state, and zip_code are required' },
        { status: 400 }
      );
    }

    // Fetch existing for audit log
    const existing = await queryOne<BillToAddress>(
      `SELECT * FROM addresses WHERE type = 'BILL_TO' AND is_default = true LIMIT 1`
    );

    if (!existing) {
      return NextResponse.json({ error: 'No default bill-to address found' }, { status: 404 });
    }

    const updated = await queryOne<BillToAddress>(
      `UPDATE addresses
       SET company_name = $1,
           address1     = $2,
           address2     = $3,
           city         = $4,
           state        = $5,
           zip_code     = $6,
           country      = $7,
           updated_at   = NOW()
       WHERE type = 'BILL_TO' AND is_default = true
       RETURNING id, type, company_name, address1, address2, city, state, zip_code, country,
                 is_default, updated_at`,
      [
        company_name,
        address1,
        address2 || null,
        city,
        state,
        zip_code,
        country || 'United States',
      ]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'settings',
      resourceId: `address:bill-to:${existing.id}`,
      before: {
        company_name: existing.company_name,
        address1: existing.address1,
        address2: existing.address2,
        city: existing.city,
        state: existing.state,
        zip_code: existing.zip_code,
        country: existing.country,
      },
      after: {
        company_name,
        address1,
        address2: address2 || null,
        city,
        state,
        zip_code,
        country: country || 'United States',
      },
    });

    return NextResponse.json({ success: true, address: updated });
  } catch (error) {
    console.error('Failed to update bill-to address:', error);
    return NextResponse.json({ error: 'Failed to update bill-to address' }, { status: 500 });
  }
}
