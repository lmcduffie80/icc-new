import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

/**
 * Internal-only route used by middleware for lightweight tenant resolution.
 * Protected by a shared secret so it cannot be called by external clients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const secret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { slug } = await params;

  try {
    const tenant = await queryOne<{
      id: string;
      slug: string;
      name: string;
      currency: string;
      country: string;
      subscription_status: string;
      trial_ends_at: string | null;
      is_active: boolean;
      mfa_required: boolean;
    }>(
      `SELECT id, slug, name, currency, country, subscription_status, trial_ends_at, is_active, mfa_required
       FROM tenants
       WHERE slug = $1 AND is_active = true
       LIMIT 1`,
      [slug.toLowerCase()]
    );

    if (!tenant) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(tenant);
  } catch {
    return NextResponse.json(null, { status: 404 });
  }
}
