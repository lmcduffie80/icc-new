'use client';

import { DataTable, Column } from '@/components/admin/data-table';
import { Building2, Mail, Phone, User, CheckCircle, XCircle, Hash, Edit } from 'lucide-react';
import Link from 'next/link';

interface SupplierUser {
  id: string;
  email: string;
  name: string;
  company_name: string;
  phone: string | null;
  supplier_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SuppliersTableProps {
  suppliers: SupplierUser[];
}

export function SuppliersTable({ suppliers }: SuppliersTableProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const columns: Column<SupplierUser>[] = [
    {
      key: 'company_name',
      header: 'Company',
      sortable: true,
      render: (supplier) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{supplier.company_name}</span>
          </div>
          {supplier.supplier_number && (
            <div className="flex items-center gap-1 text-xs text-slate-500 ml-6">
              <Hash className="h-3 w-3" />
              <span>{supplier.supplier_number}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (supplier) => (
        <div className="flex items-center space-x-2">
          <User className="h-4 w-4 text-slate-400" />
          <span className="text-slate-900">{supplier.name}</span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (supplier) => (
        <div className="flex items-center space-x-2">
          <Mail className="h-4 w-4 text-slate-400" />
          <span className="text-slate-600">{supplier.email}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (supplier) => (
        supplier.phone ? (
          <div className="flex items-center space-x-2">
            <Phone className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">{supplier.phone}</span>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (supplier) => (
        <div className="flex items-center space-x-2">
          {supplier.is_active ? (
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
      render: (supplier) => (
        <span className="text-slate-500">
          {formatDate(supplier.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (supplier) => (
        <Link
          href={`/admin/suppliers/${supplier.id}/edit`}
          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Edit Supplier"
        >
          <Edit className="h-3 w-3" />
          Edit
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      data={suppliers}
      columns={columns}
      keyExtractor={(supplier) => supplier.id}
      searchKeys={['name', 'email', 'company_name', 'phone', 'supplier_number']}
      searchPlaceholder="Search suppliers by name, email, or company..."
      emptyMessage="No supplier users found"
    />
  );
}

