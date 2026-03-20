import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
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

// GET /api/admin/content/[id] - Get single content
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('content.view');
  if (auth.error) return auth.error;

  const { id } = await params;
  const content = await queryOne<Content>('SELECT * FROM site_content WHERE id = $1', [id]);

  if (!content) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  return NextResponse.json(content);
}

// PUT /api/admin/content/[id] - Update content
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('content.update');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const existingContent = await queryOne<Content>(
      'SELECT * FROM site_content WHERE id = $1',
      [id]
    );

    if (!existingContent) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, slug, content, is_active, display_order, starts_at, ends_at } = body;

    // Check slug uniqueness if changed
    if (slug && slug !== existingContent.slug) {
      const existing = await queryOne(
        'SELECT id FROM site_content WHERE slug = $1 AND id != $2',
        [slug, id]
      );
      if (existing) {
        return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
      }
    }

    const updatedContent = await queryOne<Content>(
      `UPDATE site_content
       SET title = COALESCE($2, title),
           slug = $3,
           content = COALESCE($4, content),
           is_active = COALESCE($5, is_active),
           display_order = COALESCE($6, display_order),
           starts_at = $7,
           ends_at = $8,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        title,
        slug,
        content ? JSON.stringify(content) : null,
        is_active,
        display_order,
        starts_at,
        ends_at,
      ]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'content',
      resourceId: id,
      before: existingContent as unknown as Record<string, unknown>,
      after: updatedContent as unknown as Record<string, unknown>,
    });

    return NextResponse.json(updatedContent);
  } catch (error) {
    console.error('Error updating content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

// POST /api/admin/content/[id]/publish - Publish/unpublish content
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('content.publish');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const existingContent = await queryOne<Content>(
      'SELECT * FROM site_content WHERE id = $1',
      [id]
    );

    if (!existingContent) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const newActiveState = !existingContent.is_active;

    const updatedContent = await queryOne<Content>(
      `UPDATE site_content SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, newActiveState]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: newActiveState ? 'publish' : 'unpublish',
      resourceType: 'content',
      resourceId: id,
      before: { is_active: existingContent.is_active },
      after: { is_active: newActiveState },
    });

    return NextResponse.json(updatedContent);
  } catch (error) {
    console.error('Error publishing content:', error);
    return NextResponse.json({ error: 'Failed to publish content' }, { status: 500 });
  }
}

// DELETE /api/admin/content/[id] - Delete content
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('content.delete');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const existingContent = await queryOne<Content>(
      'SELECT * FROM site_content WHERE id = $1',
      [id]
    );

    if (!existingContent) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    await queryOne('DELETE FROM site_content WHERE id = $1 RETURNING id', [id]);

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'content',
      resourceId: id,
      before: existingContent as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content:', error);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}

