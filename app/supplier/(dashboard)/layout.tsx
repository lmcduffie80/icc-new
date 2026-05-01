import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSupplierSession } from '@/lib/supplier-auth';
import { SupplierLayoutWrapper } from '@/components/supplier/supplier-layout-wrapper';
import { queryOne } from '@/lib/db';
import { tenantCan } from '@/lib/tenant';
import type { Tenant } from '@/lib/tenant';

export const metadata = {
  title: 'Supplier Portal',
  description: 'Manage your products and inventory',
};

export default async function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if DATABASE_URL is configured first
  if (!process.env.DATABASE_URL) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-white p-8 max-w-md">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Database Not Configured</h2>
          <p className="text-red-700 mb-4">
            The DATABASE_URL environment variable is not set. Please configure your database connection in your .env.local file.
          </p>
        </div>
      </div>
    );
  }

  let session;
  try {
    session = await getSupplierSession();
  } catch (error) {
    console.error('Error loading supplier session:', error);
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-white p-8 max-w-md">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Database Connection Error</h2>
          <p className="text-red-700 mb-4">
            Failed to connect to the database. Please check your DATABASE_URL configuration.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect('/supplier/login');
  }

  // Feature flag: check that the supplier's tenant has supplier_portal enabled
  try {
    const tenantRow = await queryOne<Tenant & {
      plan_name: string | null;
      plan_features: Record<string, boolean | number> | null;
      plan_id: string | null;
    }>(
      `SELECT t.*, p.name AS plan_name, p.features AS plan_features, p.id AS plan_id
       FROM supplier_users su
       JOIN tenants t ON t.id = su.tenant_id
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE su.id = $1`,
      [session.supplierUser.id]
    );

    if (tenantRow) {
      const tenantForCheck = {
        ...tenantRow,
        plan: tenantRow.plan_name
          ? {
              id: tenantRow.plan_id!,
              name: tenantRow.plan_name,
              displayName: tenantRow.plan_name,
              priceMonthlyUsd: null,
              priceAnnualUsd: null,
              features: tenantRow.plan_features ?? {},
            }
          : null,
      };

      if (!tenantCan(tenantForCheck as unknown as Tenant, 'supplier_portal')) {
        return (
          <div className="min-h-screen bg-slate-100 flex items-center justify-center">
            <div className="rounded-lg border border-amber-200 bg-white p-8 max-w-md text-center">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Upgrade Required</h2>
              <p className="text-slate-500 mb-4">
                The Supplier Portal is not included in your current plan.
                Contact your administrator to upgrade.
              </p>
            </div>
          </div>
        );
      }
    }
  } catch {
    // If feature-flag check fails, allow through to avoid blocking legitimate users
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <SupplierLayoutWrapper user={session.user}>
        <Suspense fallback={<div className="min-h-screen">Loading...</div>}>
          {children}
        </Suspense>
      </SupplierLayoutWrapper>
    </div>
  );
}

