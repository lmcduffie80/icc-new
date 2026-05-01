import { getAdminSession } from '@/lib/admin-auth';
import { redirect, notFound } from 'next/navigation';
import { getTenantById } from '@/lib/tenant';
import { getPlans } from '@/lib/billing';
import TenantBillingForm from './tenant-billing-form';

export default async function TenantBillingPage({
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
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{tenant.name} — Billing</h1>
        <p className="mt-1 text-slate-500">
          Override plan and subscription status for manual / enterprise tenants
        </p>
      </div>

      {/* Current status card */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Plan</p>
          <p className="mt-1 font-semibold text-slate-900">
            {tenant.plan?.displayName ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Status</p>
          <p className="mt-1 font-semibold capitalize text-slate-900">
            {tenant.subscriptionStatus.replace('_', ' ')}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Billing Type</p>
          <p className="mt-1 font-semibold capitalize text-slate-900">{tenant.billingType}</p>
        </div>
      </div>

      <TenantBillingForm tenant={tenant} plans={plans} />
    </div>
  );
}
