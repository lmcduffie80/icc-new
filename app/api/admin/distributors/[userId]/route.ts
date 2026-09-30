import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne, query } from '@/lib/db';
import { z } from 'zod';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';

const updateSchema = z.object({
  is_distributor: z.boolean(),
  distributor_notes: z.string().max(1000).optional().nullable(),
  distributor_company_name: z.string().max(255).optional().nullable(),
  distributor_ein: z
    .string()
    .max(20)
    .regex(/^\d{2}-\d{7}$|^$/, 'EIN must be in XX-XXXXXXX format')
    .optional()
    .nullable(),
});

// PATCH /api/admin/distributors/[userId] — grant or revoke distributor status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin('distributors.manage');
  if (auth.error) return auth.error;

  const { userId } = await params;
  const ip = getClientIp(request);

  const body = await request.json();
  const result = updateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', details: result.error.issues }, { status: 400 });
  }

  const { is_distributor, distributor_notes, distributor_company_name, distributor_ein } = result.data;

  // Ensure user exists
  const user = await queryOne<{ id: string; email: string }>(
    `SELECT id, email FROM "user" WHERE id = $1`,
    [userId]
  );
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Upsert user_profiles row (may not exist for very old accounts)
  // Need tenant_id for INSERT path — fetch from existing profile or fall back to first tenant
  const existingProfile = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  let tenantId = existingProfile?.tenant_id;
  if (!tenantId) {
    const defaultTenant = await queryOne<{ id: string }>(
      `SELECT id FROM tenants ORDER BY created_at LIMIT 1`
    );
    tenantId = defaultTenant?.id ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'Could not determine tenant for user profile' }, { status: 500 });
  }

  try {
    await query(
      `INSERT INTO user_profiles (
         user_id, tenant_id, is_distributor, distributor_notes,
         distributor_company_name, distributor_ein,
         distributor_approved_at, distributor_approved_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         is_distributor = EXCLUDED.is_distributor,
         distributor_notes = EXCLUDED.distributor_notes,
         distributor_company_name = EXCLUDED.distributor_company_name,
         distributor_ein = EXCLUDED.distributor_ein,
         distributor_approved_at = CASE WHEN EXCLUDED.is_distributor THEN NOW() ELSE NULL END,
         distributor_approved_by = CASE WHEN EXCLUDED.is_distributor THEN $8 ELSE NULL END,
         updated_at = NOW()`,
      [
        userId,
        tenantId,
        is_distributor,
        distributor_notes ?? null,
        distributor_company_name ?? null,
        distributor_ein ?? null,
        is_distributor ? new Date().toISOString() : null,
        is_distributor ? auth.session.user.id : null,
      ]
    );
  } catch (err) {
    console.error('[PATCH /api/admin/distributors] DB error:', err);
    return NextResponse.json({ error: 'Database error updating distributor status' }, { status: 500 });
  }

  securityLogger.logAdminAction(
    auth.session.user.id,
    auth.session.user.name,
    is_distributor ? 'grant_distributor' : 'revoke_distributor',
    userId,
    ip,
    { email: user.email }
  );

  return NextResponse.json({ success: true, is_distributor });
}
