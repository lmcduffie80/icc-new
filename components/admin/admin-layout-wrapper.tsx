'use client';

import { useState } from 'react';
import { AdminSidebar } from './admin-sidebar';
import { AdminMobileHeader } from './admin-mobile-header';
import { Permission } from '@/lib/permissions';

interface AdminLayoutWrapperProps {
  permissions: Permission[];
  user: {
    name: string;
    email: string;
    image: string | null;
  };
  roleName: string;
  children: React.ReactNode;
}

export function AdminLayoutWrapper({
  permissions,
  user,
  roleName,
  children,
}: AdminLayoutWrapperProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <AdminMobileHeader
        onMenuClick={() => setMobileMenuOpen(true)}
      />
      <AdminSidebar
        permissions={permissions}
        user={user}
        roleName={roleName}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <main className="md:pl-64 transition-all duration-300">
        <div className="min-h-screen p-4 md:p-8">{children}</div>
      </main>
    </>
  );
}
