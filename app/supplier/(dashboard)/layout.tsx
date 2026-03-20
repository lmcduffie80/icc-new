import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSupplierSession } from '@/lib/supplier-auth';
import { SupplierLayoutWrapper } from '@/components/supplier/supplier-layout-wrapper';

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

