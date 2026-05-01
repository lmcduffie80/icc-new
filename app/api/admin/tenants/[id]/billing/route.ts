import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { z } from 'zod';

const billingUpdateSchema = z.object({
  planId: z.string().optional().nullable(),
  subscriptionStatus: z
    .enum(['active', 'trialing', 'past_due', 'unpaid', 'canceled'])
    .optional(),
  billingType: z.enum(['stripe', 'manual']).optional(),
  stripeCustomerId: z.string().optional().nullable(),
  stripeSubscriptionId: z.string().optional().nullable(),
  trialEndsAt: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const { id } = await params;
  const body = await request.json();
  const result = billingUpdateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', issues: result.error.issues }, { status: 400 });
  }

  const existing = await queryOne(`SELECT id FROM tenants WHERE id = $1`, [id]);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const {
    planId,
    subscriptionStatus,
    billingType,
    stripeCustomerId,
    stripeSubscriptionId,
    trialEndsAt,
  } = result.data;

  try {
    await query(
      `UPDATE tenants SET
         plan_id                = COALESCE($1, plan_id),
         subscription_status    = COALESCE($2, subscription_status),
         billing_type           = COALESCE($3, billing_type),
         stripe_customer_id     = COALESCE($4, stripe_customer_id),
         stripe_subscription_id = COALESCE($5, stripe_subscription_id),
         trial_ends_at          = COALESCE($6::timestamptz, trial_ends_at),
         updated_at             = NOW()
       WHERE id = $7`,
      [
        planId ?? null,
        subscriptionStatus ?? null,
        billingType ?? null,
        stripeCustomerId ?? null,
        stripeSubscriptionId ?? null,
        trialEndsAt ?? null,
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
