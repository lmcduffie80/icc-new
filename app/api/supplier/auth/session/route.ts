import { NextResponse } from 'next/server';
import { getSupplierSession } from '@/lib/supplier-auth';

// GET /api/supplier/auth/session - Get current supplier session
export async function GET() {
  const session = await getSupplierSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: session.user,
  });
}

