import { NextRequest, NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface RejectedProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  supplier_price: string | null;
  sku: string | null;
  unit_of_measure: string | null;
  image: string | null;
  approval_status: string;
  approval_notes: string | null;
  icc_available_quantity: number;
  label_url: string | null;
  sds_url: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/supplier/products/rejected - Get rejected products
export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const session = await getSupplierSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const products = await query<RejectedProduct>(
      `SELECT 
        id, name, category, description, price, supplier_price, sku, unit_of_measure, image,
        approval_status, approval_notes, icc_available_quantity,
        label_url, sds_url, created_at, updated_at
      FROM products
      WHERE supplier_id = $1
        AND deleted_at IS NULL
        AND approval_status = 'rejected'
      ORDER BY updated_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Error fetching rejected products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rejected products' },
      { status: 500 }
    );
  }
}

