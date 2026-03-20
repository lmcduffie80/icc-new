import { getAdminSession } from '@/lib/admin-auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { queryOne } from '@/lib/db';
import { EditVendorForm } from './edit-vendor-form';

interface Vendor {
  id: number;
  vendor_number: string;
  name: string;
  address_id: number | null;
  tax_exempt: boolean;
  default_payment_terms: string | null;
  folder_path: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  address?: {
    id: number;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;
}

async function getVendor(id: number): Promise<Vendor | null> {
  const vendor = await queryOne<{
    id: number;
    vendor_number: string;
    name: string;
    address_id: number | null;
    tax_exempt: boolean;
    default_payment_terms: string | null;
    folder_path: string;
    is_active: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, vendor_number, name, address_id, tax_exempt, default_payment_terms, 
            folder_path, is_active, notes, created_at, updated_at
     FROM vendors
     WHERE id = $1`,
    [id]
  );

  if (!vendor) {
    return null;
  }

  // Fetch address if it exists
  let address = null;
  if (vendor.address_id) {
    address = await queryOne<{
      id: number;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      zip_code: string;
      country: string;
    }>(
      'SELECT id, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
      [vendor.address_id]
    );
  }

  return { ...vendor, address: address || null };
}

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('admins.view')) {
    redirect('/admin');
  }

  const { id } = await params;
  const vendorId = parseInt(id, 10);

  if (isNaN(vendorId)) {
    notFound();
  }

  const vendor = await getVendor(vendorId);

  if (!vendor) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/vendors"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vendors
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Vendor</h1>
          <p className="mt-1 text-slate-500">Update vendor information and address</p>
        </div>
      </div>

      <EditVendorForm vendor={vendor} />
    </div>
  );
}

