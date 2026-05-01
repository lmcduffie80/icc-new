import { getAdminSession } from '@/lib/admin-auth';
import { redirect, notFound } from 'next/navigation';
import { getTenantById } from '@/lib/tenant';
import { getPlans } from '@/lib/billing';
import TenantEditForm from './tenant-edit-form';

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');

  const { id } = await params;
  const [tenant, plans] = await Promise.all([getTenantById(id), getPlans()]);

  if (!tenant) notFound();

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
          <p className="mt-1 text-slate-500">/{tenant.slug}</p>
        </div>
        <a
          href={`/admin/tenants/${id}/billing`}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Billing →
        </a>
      </div>

      <TenantEditForm tenant={tenant} plans={plans} canEdit={true} />
    </div>
  );
}
