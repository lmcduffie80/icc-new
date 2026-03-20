import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/admin-middleware';

/**
 * GET /api/admin/suppliers/list
 * Returns a list of all active suppliers for admin dropdowns
 */
export async function GET(request: NextRequest) {
  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    // Fetch all active suppliers
    const suppliers = await query<{
      id: string;
      company_name: string;
      email: string;
      supplier_number: string;
      is_active: boolean;
      created_at: string;
    }>(
      `SELECT 
        id,
        company_name,
        email,
        supplier_number,
        is_active,
        created_at
      FROM supplier_users
      WHERE is_active = true
      ORDER BY company_name ASC`,
      []
    );

    return NextResponse.json({
      suppliers,
      count: suppliers.length,
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suppliers' },
      { status: 500 }
    );
  }
}
