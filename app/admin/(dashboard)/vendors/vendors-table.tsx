'use client';

import { DataTable, Column } from '@/components/admin/data-table';
import { Building2, CheckCircle, XCircle, Hash, Edit } from 'lucide-react';
import Link from 'next/link';

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
}

interface VendorsTableProps {
  vendors: Vendor[];
}

export function VendorsTable({ vendors }: VendorsTableProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPaymentTerms = (terms: string | null) => {
    if (!terms) return '—';
    return terms.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const columns: Column<Vendor>[] = [
    {
      key: 'vendor_number',
      header: 'Vendor Number',
      sortable: true,
      render: (vendor) => (
        <div className="flex items-center space-x-2">
          <Hash className="h-4 w-4 text-slate-400" />
          <span className="font-medium text-slate-900">{vendor.vendor_number}</span>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (vendor) => (
        <div className="flex items-center space-x-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span className="text-slate-900">{vendor.name}</span>
        </div>
      ),
    },
    {
      key: 'default_payment_terms',
      header: 'Payment Terms',
      render: (vendor) => (
        <span className="text-slate-600">
          {formatPaymentTerms(vendor.default_payment_terms)}
        </span>
      ),
    },
    {
      key: 'tax_exempt',
      header: 'Tax Exempt',
      render: (vendor) => (
        vendor.tax_exempt ? (
          <span className="text-green-700 font-medium">Yes</span>
        ) : (
          <span className="text-slate-500">No</span>
        )
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (vendor) => (
        <div className="flex items-center space-x-2">
          {vendor.is_active ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-green-700 font-medium">Active</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-700 font-medium">Inactive</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (vendor) => (
        <span className="text-slate-500">
          {formatDate(vendor.created_at)}
        </span>
      ),
    },
  ];

  const actions = (vendor: Vendor) => (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/admin/vendors/${vendor.id}`}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Edit vendor"
      >
        <Edit className="h-4 w-4" />
      </Link>
    </div>
  );

  return (
    <DataTable
      data={vendors}
      columns={columns}
      keyExtractor={(vendor) => vendor.id.toString()}
      searchKeys={['name', 'vendor_number']}
      searchPlaceholder="Search vendors by name or vendor number..."
      emptyMessage="No vendors found"
      actions={actions}
    />
  );
}

