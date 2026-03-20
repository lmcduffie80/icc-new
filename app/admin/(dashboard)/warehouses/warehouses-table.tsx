'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit, Trash2, MapPin, Phone, Mail, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditWarehouseModal } from './edit-warehouse-modal';
import { DeleteWarehouseModal } from './delete-warehouse-modal';

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
  created_at: string;
  updated_at: string;
}

interface WarehousesTableProps {
  warehouses: Warehouse[];
  permissions: string[];
}

export function WarehousesTable({ warehouses, permissions }: WarehousesTableProps) {
  const router = useRouter();
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null);

  const canUpdate = permissions.includes('products.update');
  const canDelete = permissions.includes('products.delete');

  const formatAddress = (warehouse: Warehouse) => {
    return `${warehouse.address_street}, ${warehouse.address_zip}`;
  };

  if (warehouses.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-slate-500">No warehouses found. Create your first warehouse to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                City
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                State
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {warehouses.map((warehouse) => (
              <tr key={warehouse.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-slate-900">{warehouse.name}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 mt-0.5 text-slate-400 flex-shrink-0" />
                    <span>{formatAddress(warehouse)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-900">{warehouse.address_city}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-900">{warehouse.address_state}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1 text-sm text-slate-600">
                    {warehouse.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 text-slate-400" />
                        <span>{warehouse.phone}</span>
                      </div>
                    )}
                    {warehouse.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-slate-400" />
                        <span>{warehouse.email}</span>
                      </div>
                    )}
                    {!warehouse.phone && !warehouse.email && (
                      <span className="text-slate-400">No contact info</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {warehouse.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      <XCircle className="h-3 w-3" />
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {canUpdate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingWarehouse(warehouse)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingWarehouse(warehouse)}
                        className="text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingWarehouse && (
        <EditWarehouseModal
          warehouse={editingWarehouse}
          isOpen={!!editingWarehouse}
          onClose={() => {
            setEditingWarehouse(null);
            router.refresh();
          }}
        />
      )}

      {deletingWarehouse && (
        <DeleteWarehouseModal
          warehouse={deletingWarehouse}
          isOpen={!!deletingWarehouse}
          onClose={() => {
            setDeletingWarehouse(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

