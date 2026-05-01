import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/lib/tenant';
import { tenantCan } from '@/lib/tenant';

export default async function CropPlanningLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || !tenantCan(tenant, 'crop_planning')) {
    notFound();
  }
  return <>{children}</>;
}
