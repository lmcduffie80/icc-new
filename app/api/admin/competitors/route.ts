import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query } from '@/lib/db';
import { z } from 'zod';

interface CompetitorRow {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  search_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  listing_count: number;
  ok_count: number;
  failed_count: number;
  not_found_count: number;
  last_fetched_at: string | null;
}

/**
 * GET /api/admin/competitors
 *
 * Returns the list of competitors with fetch statistics.
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const rows = await query<CompetitorRow>(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.base_url,
        c.search_template,
        c.is_active,
        c.created_at::text,
        c.updated_at::text,
        COUNT(cp.id)::int AS listing_count,
        COUNT(cp.id) FILTER (WHERE cp.fetch_status = 'ok')::int AS ok_count,
        COUNT(cp.id) FILTER (WHERE cp.fetch_status = 'failed')::int AS failed_count,
        COUNT(cp.id) FILTER (WHERE cp.fetch_status = 'not_found')::int AS not_found_count,
        MAX(cp.last_fetched_at)::text AS last_fetched_at
      FROM competitors c
      LEFT JOIN competitor_products cp ON cp.competitor_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    return NextResponse.json({ competitors: rows });
  } catch (error) {
    console.error('[ADMIN] Failed to load competitors:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  is_active: z.boolean().optional(),
  search_template: z.string().nullable().optional(),
});

/**
 * PATCH /api/admin/competitors
 *
 * Update the is_active flag or search_template for a competitor.
 */
export async function PATCH(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  const { id, is_active, search_template } = parsed.data;
  const updates: string[] = [];
  const params: unknown[] = [];
  if (is_active !== undefined) {
    params.push(is_active);
    updates.push(`is_active = $${params.length}`);
  }
  if (search_template !== undefined) {
    params.push(search_template);
    updates.push(`search_template = $${params.length}`);
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  params.push(id);
  try {
    const rows = await query<{ id: string }>(
      `UPDATE competitors
          SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length}
        RETURNING id`,
      params
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ADMIN] Failed to update competitor:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
