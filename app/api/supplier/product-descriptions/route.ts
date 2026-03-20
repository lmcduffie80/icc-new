import { NextRequest, NextResponse } from 'next/server';
import { verifySupplierAuth } from '@/lib/supplier-middleware';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  
  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  // Verify supplier authentication
  const authResult = await verifySupplierAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { searchParams } = new URL(request.url);
  const productName = searchParams.get('name');

  if (!productName || productName.trim().length < 3) {
    return NextResponse.json({ descriptions: [], fullDescriptions: [] });
  }

  try {
    // Fetch unique short descriptions for this product name
    const descriptions = await query<{ description: string }>(
      `SELECT DISTINCT description 
       FROM products 
       WHERE LOWER(name) = LOWER($1) 
         AND description IS NOT NULL 
         AND description != ''
         AND approval_status IN ('published', 'admin_approved', 'supplier_approved')
       ORDER BY description
       LIMIT 10`,
      [productName.trim()]
    );

    // Fetch unique full descriptions for this product name
    const fullDescriptions = await query<{ full_description: string }>(
      `SELECT DISTINCT full_description 
       FROM products 
       WHERE LOWER(name) = LOWER($1) 
         AND full_description IS NOT NULL 
         AND full_description != ''
         AND approval_status IN ('published', 'admin_approved', 'supplier_approved')
       ORDER BY full_description
       LIMIT 10`,
      [productName.trim()]
    );

    return NextResponse.json({
      descriptions: descriptions.map(d => d.description),
      fullDescriptions: fullDescriptions.map(d => d.full_description),
    });
  } catch (error) {
    console.error('Error fetching product descriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch descriptions' },
      { status: 500 }
    );
  }
}
