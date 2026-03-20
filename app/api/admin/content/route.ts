import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { logAction } from '@/lib/audit';

interface Content {
  id: string;
  type: string;
  title: string | null;
  slug: string | null;
  content: object;
  is_active: boolean;
  display_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/admin/content - List all content
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('content.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const active = searchParams.get('active');

  let sql = 'SELECT * FROM site_content WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (type) {
    sql += ` AND type = $${paramIndex++}`;
    params.push(type);
  }

  if (active !== null) {
    sql += ` AND is_active = $${paramIndex++}`;
    params.push(active === 'true');
  }

  sql += ' ORDER BY display_order ASC, created_at DESC';

  const content = await query<Content>(sql, params);
  return NextResponse.json(content);
}

// POST /api/admin/content - Create new content
export async function POST(request: NextRequest) {
  const auth = await requireAdmin('content.create');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { type, title, slug, content, is_active, display_order, starts_at, ends_at } = body;

    if (!type || !['banner', 'announcement', 'page'].includes(type)) {
      return NextResponse.json(
        { error: 'Valid type is required (banner, announcement, or page)' },
        { status: 400 }
      );
    }

    // Check slug uniqueness if provided
    if (slug) {
      const existing = await queryOne('SELECT id FROM site_content WHERE slug = $1', [slug]);
      if (existing) {
        return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
      }
    }

    const newContent = await queryOne<Content>(
      `INSERT INTO site_content (type, title, slug, content, is_active, display_order, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        type,
        title || null,
        slug || null,
        JSON.stringify(content || {}),
        is_active ?? false,
        display_order ?? 0,
        starts_at || null,
        ends_at || null,
      ]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'create',
      resourceType: 'content',
      resourceId: newContent!.id,
      after: newContent as unknown as Record<string, unknown>,
    });

    return NextResponse.json(newContent, { status: 201 });
  } catch (error) {
    console.error('Error creating content:', error);
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 });
  }
}

