'use client';

import { useState } from 'react';
import { SupplierSidebar } from './supplier-sidebar';
import { SupplierMobileHeader } from './supplier-mobile-header';

interface SupplierLayoutWrapperProps {
  user: {
    id: string;
    email: string;
    name: string;
    company_name: string;
  };
  children: React.ReactNode;
}

export function SupplierLayoutWrapper({
  user,
  children,
}: SupplierLayoutWrapperProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <SupplierMobileHeader
        onMenuClick={() => setMobileMenuOpen(true)}
      />
      <SupplierSidebar
        user={user}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <main className="md:pl-64 transition-all duration-300">
        <div className="min-h-screen p-4 md:p-8">{children}</div>
      </main>
    </>
  );
}
