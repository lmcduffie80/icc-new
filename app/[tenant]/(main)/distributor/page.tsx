import type { Metadata } from 'next';
import { DistributorPortalClient } from './distributor-client';

export const metadata: Metadata = {
  title: 'Distributor Portal',
  description: 'Exclusive distributor pricing for authorized accounts.',
  robots: { index: false, follow: false }, // keep off search engines
};

export default function DistributorPage() {
  return <DistributorPortalClient />;
}
