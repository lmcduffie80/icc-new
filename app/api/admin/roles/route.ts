import { NextResponse } from 'next/server';
import { requireAdmin, getAdminRoles } from '@/lib/admin-auth';

// GET /api/admin/roles - List all roles
export async function GET() {
  const auth = await requireAdmin('admins.view');
  if (auth.error) return auth.error;

  const roles = await getAdminRoles();
  return NextResponse.json(roles);
}

