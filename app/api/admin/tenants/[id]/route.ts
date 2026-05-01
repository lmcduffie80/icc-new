import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { z } from 'zod';

const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  country: z.enum(['US', 'CA']).optional(),
  currency: z.enum(['USD', 'CAD']).optional(),
  billingType: z.enum(['stripe', 'manual']).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().optional().nullable(),
  planId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const { id } = await params;
  const body = await request.json();
  const result = updateTenantSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
  }

  const existing = await queryOne(`SELECT id FROM tenants WHERE id = $1`, [id]);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, country, currency, billingType, primaryColor, logoUrl, planId, isActive } = result.data;

  try {
    await query(
      `UPDATE tenants SET
         name          = COALESCE($1, name),
         country       = COALESCE($2, country),
         currency      = COALESCE($3, currency),
         billing_type  = COALESCE($4, billing_type),
         primary_color = COALESCE($5, primary_color),
         logo_url      = CASE WHEN $6::text IS DISTINCT FROM 'SKIP' THEN $6::text ELSE logo_url END,
         plan_id       = CASE WHEN $7::text IS DISTINCT FROM 'SKIP' THEN $7::text ELSE plan_id END,
         is_active     = COALESCE($8, is_active),
         updated_at    = NOW()
       WHERE id = $9`,
      [
        name ?? null,
        country ?? null,
        currency ?? null,
        billingType ?? null,
        primaryColor ?? null,
        'logoUrl' in result.data ? (logoUrl ?? null) : 'SKIP',
        'planId' in result.data ? (planId ?? null) : 'SKIP',
        isActive ?? null,
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const { id } = await params;

  try {
    await query(`UPDATE tenants SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
