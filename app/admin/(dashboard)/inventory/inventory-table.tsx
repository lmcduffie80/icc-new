'use client';

import { DataTable, Column } from '@/components/admin/data-table';
import { Package, Warehouse, Building2, Hash, User } from 'lucide-react';

interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  supplier_id: string | null;
  supplier_id_number: string;
  supplier_name: string;
  supplier_company: string;
  supplier_number: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_address: string;
  inventory_count: number;
  warehouse_location: string | null;
  updated_at: string;
}

interface InventoryTableProps {
  inventory: InventoryItem[];
}

export function InventoryTable({ inventory }: InventoryTableProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: 'supplier_id_number',
      header: 'Supplier ID Number',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-slate-400" />
          <span className="font-mono font-semibold text-slate-900">{item.supplier_id_number}</span>
        </div>
      ),
    },
    {
      key: 'supplier_company',
      header: 'Supplier / Supplier ID',
      sortable: true,
      render: (item) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{item.supplier_company}</span>
          </div>
          {item.supplier_id && (
            <div className="text-xs text-slate-500 ml-6">ID: {item.supplier_id}</div>
          )}
          {item.supplier_number && (
            <div className="flex items-center gap-1 text-xs text-slate-500 ml-6">
              <Hash className="h-3 w-3" />
              <span>Number: {item.supplier_number}</span>
            </div>
          )}
          <div className="text-xs text-slate-500 ml-6">{item.supplier_name}</div>
        </div>
      ),
    },
    {
      key: 'product_name',
      header: 'Product',
      sortable: true,
      render: (item) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{item.product_name}</span>
          </div>
          {item.product_sku && (
            <div className="text-xs text-slate-500 ml-6">SKU: {item.product_sku}</div>
          )}
        </div>
      ),
    },
    {
      key: 'warehouse_name',
      header: 'Warehouse / Warehouse ID',
      sortable: true,
      render: (item) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{item.warehouse_name}</span>
          </div>
          <div className="text-xs text-slate-500 ml-6">ID: {item.warehouse_id}</div>
          <div className="text-xs text-slate-500 ml-6">{item.warehouse_address}</div>
          {item.warehouse_location && (
            <div className="text-xs text-slate-600 ml-6 font-medium">
              Location: {item.warehouse_location}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'inventory_count',
      header: 'Available Inventory',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${
              item.inventory_count === 0
                ? 'text-red-600'
                : item.inventory_count < 10
                  ? 'text-yellow-600'
                  : 'text-green-600'
            }`}
          >
            {item.inventory_count.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      key: 'updated_at',
      header: 'Last Updated',
      sortable: true,
      render: (item) => (
        <span className="text-sm text-slate-500">{formatDate(item.updated_at)}</span>
      ),
    },
  ];

  if (inventory.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No inventory found</h3>
          <p className="mt-2 text-sm text-slate-500">
            Inventory will appear here once suppliers add products to warehouses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DataTable
      data={inventory}
      columns={columns}
      keyExtractor={(item) => item.id}
      searchKeys={['product_name', 'product_sku', 'supplier_company', 'supplier_name', 'supplier_number', 'supplier_id_number', 'warehouse_name']}
      searchPlaceholder="Search by product, supplier, or warehouse..."
      emptyMessage="No inventory matches your search"
    />
  );
}

