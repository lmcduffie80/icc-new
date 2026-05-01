import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { z } from 'zod';

const createTenantSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
  name: z.string().min(1).max(200),
  country: z.enum(['US', 'CA']).default('US'),
  currency: z.enum(['USD', 'CAD']).default('USD'),
  billingType: z.enum(['stripe', 'manual']).default('manual'),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#16a34a'),
  planId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  try {
    const tenants = await query(
      `SELECT t.id, t.slug, t.name, t.country, t.currency,
              t.subscription_status, t.billing_type, t.is_active, t.created_at,
              p.display_name AS plan_display_name, p.name AS plan_name
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       ORDER BY t.created_at DESC`
    );
    return NextResponse.json({ tenants });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const body = await request.json();
  const result = createTenantSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
  }

  const { slug, name, country, currency, billingType, primaryColor, planId } = result.data;

  const existing = await queryOne(`SELECT id FROM tenants WHERE slug = $1`, [slug]);
  if (existing) {
    return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
  }

  try {
    const tenant = await queryOne<{ id: string }>(
      `INSERT INTO tenants (slug, name, country, currency, billing_type, primary_color, plan_id, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id`,
      [slug, name, country, currency, billingType, primaryColor, planId ?? null]
    );
    return NextResponse.json({ tenant }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
