import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query } from '@/lib/db';

// POST /api/supplier/auth/logout - Supplier logout
export async function POST(request: NextRequest) {
  const authResult = await verifySupplierAuth(request);

  if (!authResult.authorized || !authResult.session) {
    return authResult.response!;
  }

  // Get session token
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('supplier_session')?.value;

  if (sessionToken) {
    // Delete session from database
    await query(
      'DELETE FROM supplier_sessions WHERE token = $1',
      [sessionToken]
    );
  }

  // Clear cookie
  cookieStore.delete('supplier_session');

  return NextResponse.json({ success: true });
}

