import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { classifyNmfc } from '@/lib/nmfc-classifier';
import { z } from 'zod';

const classifySchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
  carton_length: z.number().nullable().optional(),
  carton_width: z.number().nullable().optional(),
  carton_height: z.number().nullable().optional(),
  carton_weight_lbs: z.number().nullable().optional(),
});

// POST /api/admin/products/nmfc-classify
// Stateless — accepts product details in body, returns AI suggestion without saving to DB.
// Used for new products (no ID yet) and for re-running classification on existing products.
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = classifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  const result = await classifyNmfc({
    name: data.name,
    description: data.description ?? null,
    category: data.category ?? null,
    unit_of_measure: data.unit_of_measure ?? null,
    carton_length: data.carton_length ?? null,
    carton_width: data.carton_width ?? null,
    carton_height: data.carton_height ?? null,
    carton_weight_lbs: data.carton_weight_lbs ?? null,
  });

  if (!result) {
    return NextResponse.json(
      { error: 'Classification unavailable — ANTHROPIC_API_KEY may not be configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    nmfc_number: result.nmfc_number,
    freight_class: result.freight_class,
    reasoning: result.reasoning,
  });
}
