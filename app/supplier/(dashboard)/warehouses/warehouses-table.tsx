'use client';

import Link from 'next/link';
import { DataTable, Column } from '@/components/admin/data-table';
import { Edit } from 'lucide-react';

interface Warehouse {
  id: string;
  name: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_primary: boolean;
}

interface WarehousesTableProps {
  warehouses: Warehouse[];
}

export function WarehousesTable({ warehouses }: WarehousesTableProps) {
  const columns: Column<Warehouse>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (warehouse) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{warehouse.name}</span>
          {warehouse.is_primary && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Primary
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      sortable: true,
      render: (warehouse) => (
        <span className="text-sm text-slate-600">
          {warehouse.address_street}, {warehouse.address_city}, {warehouse.address_state} {warehouse.address_zip}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (warehouse) => (
        <span className="text-sm text-slate-600">
          {warehouse.phone || '—'}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (warehouse) => (
        <span className="text-sm text-slate-600">
          {warehouse.email || '—'}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (warehouse) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            warehouse.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-slate-100 text-slate-800'
          }`}
        >
          {warehouse.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  const actions = (warehouse: Warehouse) => (
    <Link
      href={`/supplier/warehouses/${warehouse.id}`}
      className="inline-flex items-center gap-1.5 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      title="Manage warehouse"
    >
      <Edit className="h-4 w-4" />
    </Link>
  );

  return (
    <DataTable
      data={warehouses}
      columns={columns}
      keyExtractor={(warehouse) => warehouse.id}
      searchKeys={['name', 'address_city', 'address_state', 'email']}
      searchPlaceholder="Search warehouses..."
      emptyMessage="No warehouses found"
      actions={actions}
    />
  );
}
