import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface UserInvoiceRow {
  id: string;
  user_id: string;
  state: string;
  file_url: string;
  filename: string;
  file_type: string;
  created_at: string;
  updated_at: string;
}

// GET /api/admin/users/[id]/invoices - Get all invoices for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('users.view');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    // Verify user exists
    const user = await query('SELECT id FROM "user" WHERE id = $1', [id]);
    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch invoices
    const invoices = await query<UserInvoiceRow>(
      `SELECT id, user_id, state, file_url, filename, file_type, created_at, updated_at
       FROM user_invoices
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        state: inv.state,
        fileUrl: inv.file_url,
        filename: inv.filename,
        fileType: inv.file_type,
        createdAt: inv.created_at,
        updatedAt: inv.updated_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching user invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

