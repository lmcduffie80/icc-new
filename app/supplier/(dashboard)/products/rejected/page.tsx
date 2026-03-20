import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RejectedProductsPage() {
  // Redirect to the unified approvals page
  redirect('/supplier/approvals');
}

