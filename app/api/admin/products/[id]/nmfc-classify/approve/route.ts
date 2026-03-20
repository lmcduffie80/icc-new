import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { queryOne } from '@/lib/db';

const approveSchema = z.object({
  action: z.enum(['accept', 'reject']),
  // Optional inline suggestion — when provided, these are used directly without reading from DB.
  // This makes Accept work even if the fire-and-forget DB save hasn't completed yet.
  nmfc_number: z.string().optional(),
  reasoning: z.string().optional(),
  freight_class: z.string().nullable().optional(),
});

interface ProductSuggestion {
  id: string;
  nmfc_ai_suggestion: string | null;
  nmfc_ai_status: string | null;
  freight_class_ai_suggestion: string | null;
}

// POST /api/admin/products/[id]/nmfc-classify/approve
// Admin accepts or rejects the pending AI NMFC suggestion.
// On accept: copies nmfc_ai_suggestion → nmfc_number and marks status 'accepted'.
// On reject: marks status 'rejected', nmfc_number is unchanged.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { action } = parsed.data;

  let product: ProductSuggestion | null;
  try {
    product = await queryOne<ProductSuggestion>(
      `SELECT id, nmfc_ai_suggestion, nmfc_ai_status, freight_class_ai_suggestion
       FROM products
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
  } catch (error) {
    console.error('[nmfc-approve] DB error fetching product:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  if (action === 'accept') {
    // Use inline suggestion from request body if provided (avoids dependency on fire-and-forget DB save).
    // Fall back to what's already stored in the DB.
    const nmfcNumber = parsed.data.nmfc_number ?? product.nmfc_ai_suggestion;
    const freightClass = parsed.data.freight_class !== undefined
      ? parsed.data.freight_class
      : product.freight_class_ai_suggestion;
    const reasoning = parsed.data.reasoning ?? null;

    if (!nmfcNumber) {
      return NextResponse.json({ error: 'No AI suggestion available to accept' }, { status: 400 });
    }

    try {
      await queryOne(
        `UPDATE products
         SET nmfc_number = $2,
             nmfc_ai_status = 'accepted',
             freight_class = $3,
             nmfc_ai_suggestion = COALESCE(nmfc_ai_suggestion, $4),
             nmfc_ai_reasoning = COALESCE(nmfc_ai_reasoning, $5),
             freight_class_ai_suggestion = COALESCE(freight_class_ai_suggestion, $6),
             updated_at = NOW()
         WHERE id = $1`,
        [id, nmfcNumber, freightClass, nmfcNumber, reasoning, freightClass]
      );
    } catch (error) {
      console.error('[nmfc-approve] DB error accepting suggestion:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({
      nmfc_number: nmfcNumber,
      nmfc_ai_status: 'accepted',
      freight_class: freightClass,
    });
  }

  // action === 'reject'
  try {
    await queryOne(
      `UPDATE products
       SET nmfc_ai_status = 'rejected',
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  } catch (error) {
    console.error('[nmfc-approve] DB error rejecting suggestion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ nmfc_ai_status: 'rejected' });
}
