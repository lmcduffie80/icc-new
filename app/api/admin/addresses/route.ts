import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

// GET /api/admin/addresses - List all addresses
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const ip = getClientIp(request);

  try {
    const addresses = await query<{
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
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, type, company_name, address1, address2, city, state, zip_code, country, 
              is_default, created_at, updated_at
       FROM addresses
       ORDER BY type, company_name`
    );

    return NextResponse.json(addresses);
  } catch (error) {
    securityLogger.logError('Failed to fetch addresses', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

