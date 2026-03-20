import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getAuditLog } from '@/lib/audit';

// GET /api/admin/audit-log - Get audit log entries
export async function GET(request: NextRequest) {
  const auth = await requireAdmin('admins.view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  
  const filter = {
    adminUserId: searchParams.get('admin_user_id') || undefined,
    action: searchParams.get('action') as 'create' | 'update' | 'delete' | undefined,
    resourceType: searchParams.get('resource_type') as 'product' | 'order' | 'user' | undefined,
    resourceId: searchParams.get('resource_id') || undefined,
    startDate: searchParams.get('start_date') ? new Date(searchParams.get('start_date')!) : undefined,
    endDate: searchParams.get('end_date') ? new Date(searchParams.get('end_date')!) : undefined,
    limit: parseInt(searchParams.get('limit') || '50', 10),
    offset: parseInt(searchParams.get('offset') || '0', 10),
  };

  try {
    const result = await getAuditLog(filter);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
  }
}

