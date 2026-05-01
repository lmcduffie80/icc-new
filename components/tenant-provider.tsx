'use client';

import { createContext, useContext } from 'react';
import type { Tenant } from '@/lib/tenant';

const TenantContext = createContext<Tenant | null>(null);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: Tenant;
  children: React.ReactNode;
}) {
  return (
    <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): Tenant {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

/** Returns null when not inside a TenantProvider (e.g. admin pages). */
export function useTenantOrNull(): Tenant | null {
  return useContext(TenantContext);
}
