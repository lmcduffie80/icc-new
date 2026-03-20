import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminSession, type AdminSession } from '@/lib/admin-auth';
import { AdminLayoutWrapper } from '@/components/admin/admin-layout-wrapper';
import { PermissionsProvider } from '@/components/admin/permission-gate';

export const metadata = {
  title: 'Admin Dashboard',
  description: 'Manage your e-commerce store',
};

export default async function AdminLayout({
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
          <p className="text-sm text-slate-600">
            Add <code className="bg-slate-100 px-1 rounded">DATABASE_URL=your_connection_string</code> to your .env.local file.
          </p>
        </div>
      </div>
    );
  }
  
  let session;
  try {
    // Add timeout to prevent hanging
    const sessionPromise = getAdminSession();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Session check timed out after 5 seconds')), 5000)
    );
    
    session = await Promise.race([sessionPromise, timeoutPromise]) as AdminSession | null;
  } catch (error) {
    console.error('Error loading admin session:', error);
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-white p-8 max-w-md">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Session Error</h2>
          <p className="text-red-700 mb-4">
            Failed to load admin session. This could be a database connection issue.
          </p>
          <p className="text-sm text-red-600 mb-4">
            Error: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <a 
            href="/admin/login" 
            className="inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect('/admin/login');
  }

  return (
    <PermissionsProvider permissions={session.permissions}>
      <div className="min-h-screen bg-slate-100">
        <AdminLayoutWrapper
          permissions={session.permissions}
          user={session.user}
          roleName={session.role.name}
        >
          <Suspense fallback={<div className="min-h-screen">Loading...</div>}>
            {children}
          </Suspense>
        </AdminLayoutWrapper>
      </div>
    </PermissionsProvider>
  );
}

