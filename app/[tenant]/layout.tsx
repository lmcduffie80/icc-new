import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/lib/tenant';
import { TenantProvider } from '@/components/tenant-provider';
import { AgroVusBadge } from '@/components/agrovus-badge';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return {};
  return {
    title: {
      default: tenant.name,
      template: `%s | ${tenant.name}`,
    },
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);

  if (!tenant || !tenant.isActive) {
    notFound();
  }

  return (
    <TenantProvider tenant={tenant}>
      {children}
      <AgroVusBadge plan={tenant.plan} />
    </TenantProvider>
  );
}
