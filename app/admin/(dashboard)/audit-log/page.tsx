import { getAdminSession, getAdminUsers } from '@/lib/admin-auth';
import { getAuditLog } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { AuditLogTable } from './audit-log-table';

interface SearchParams {
  action?: string;
  resource_type?: string;
  admin_user_id?: string;
  page?: string;
}

async function getAuditLogData(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1', 10);
  const limit = 25;
  const offset = (page - 1) * limit;

  const filter: {
    action?: 'create' | 'update' | 'delete';
    resourceType?: 'product' | 'order' | 'user' | 'admin_user' | 'admin_role' | 'content' | 'settings';
    adminUserId?: string;
    limit: number;
    offset: number;
  } = {
    limit,
    offset,
  };

  if (searchParams.action) {
    filter.action = searchParams.action as typeof filter.action;
  }
  if (searchParams.resource_type) {
    filter.resourceType = searchParams.resource_type as typeof filter.resourceType;
  }
  if (searchParams.admin_user_id) {
    filter.adminUserId = searchParams.admin_user_id;
  }

  return getAuditLog(filter);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.view')) {
    redirect('/admin');
  }

  const params = await searchParams;
  const [auditData, admins] = await Promise.all([
    getAuditLogData(params),
    getAdminUsers(),
  ]);

  const currentPage = parseInt(params.page || '1', 10);
  const totalPages = Math.ceil(auditData.total / 25);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="mt-1 text-slate-500">Track all administrative actions</p>
      </div>

      <AuditLogTable
        entries={auditData.entries}
        admins={admins}
        currentPage={currentPage}
        totalPages={totalPages}
        totalEntries={auditData.total}
        filters={params}
      />
    </div>
  );
}

