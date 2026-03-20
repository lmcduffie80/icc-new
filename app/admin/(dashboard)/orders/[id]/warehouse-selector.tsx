'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Warehouse, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WarehouseSelectorProps {
  orderId: string;
  currentWarehouseId: string | null;
  warehouseAllocations?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    items?: Array<{
      product_id: string;
      quantity: number;
    }>;
  }> | null;
}

interface Warehouse {
  id: string;
  name: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}


export function WarehouseSelector({ orderId, warehouseAllocations }: WarehouseSelectorProps) {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [assignedWarehouses, setAssignedWarehouses] = useState<Array<{
    warehouse_id: string;
    warehouse_name: string;
  }>>([]);
  const [newWarehouseId, setNewWarehouseId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchWarehouses() {
      try {
        const response = await fetch('/api/admin/warehouses?active_only=true');
        if (response.ok) {
          const data = await response.json();
          setWarehouses(data);
        }
      } catch (err) {
        console.error('Error fetching warehouses:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchWarehouses();
  }, []);

  // Initialize assigned warehouses from allocations
  useEffect(() => {
      if (warehouseAllocations && Array.isArray(warehouseAllocations)) {
        const uniqueWarehouses = warehouseAllocations
          .map(alloc => ({
            warehouse_id: alloc.warehouse_id,
            warehouse_name: alloc.warehouse_name,
          }))
          .filter((wh, index, self) => 
            index === self.findIndex(w => w.warehouse_id === wh.warehouse_id)
          );
        setAssignedWarehouses(uniqueWarehouses);
    }
  }, [warehouseAllocations]);

  const handleAddWarehouse = async () => {
    if (!newWarehouseId) {
      setError('Please select a warehouse to add');
      return;
    }

    // Check if warehouse is already assigned
    if (assignedWarehouses.some(wh => wh.warehouse_id === newWarehouseId)) {
      setError('This warehouse is already assigned to this order');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/warehouse`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          warehouse_id: newWarehouseId,
          action: 'add' // Add to allocations instead of replacing
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add warehouse');
      }

      // Add to local state
      const warehouse = warehouses.find(w => w.id === newWarehouseId);
      if (warehouse) {
        setAssignedWarehouses([...assignedWarehouses, {
          warehouse_id: newWarehouseId,
          warehouse_name: warehouse.name,
        }]);
      }

      setNewWarehouseId('');
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add warehouse');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveWarehouse = async (warehouseId: string) => {
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/warehouse`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          action: 'remove' // Remove from allocations
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove warehouse');
      }

      // Remove from local state
      setAssignedWarehouses(assignedWarehouses.filter(wh => wh.warehouse_id !== warehouseId));

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove warehouse');
    } finally {
      setSaving(false);
    }
  };

  // Get available warehouses (not already assigned)
  const availableWarehouses = warehouses.filter(
    w => !assignedWarehouses.some(aw => aw.warehouse_id === w.id)
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Warehouse className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">Shipping Warehouses</h3>
      </div>
      
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-600">
          Warehouse updated successfully!
        </div>
      )}

      {/* Assigned Warehouses List */}
      {assignedWarehouses.length > 0 && (
        <div className="mb-4 space-y-2">
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Assigned Warehouses ({assignedWarehouses.length})
          </label>
          {assignedWarehouses.map((assignedWh) => {
            const warehouse = warehouses.find(w => w.id === assignedWh.warehouse_id);
            return (
              <div
                key={assignedWh.warehouse_id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{assignedWh.warehouse_name}</p>
                  {warehouse && (
                    <p className="text-xs text-slate-500">
                      {warehouse.address_city}, {warehouse.address_state}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveWarehouse(assignedWh.warehouse_id)}
                  disabled={saving}
                  className="ml-2 rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Remove warehouse"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Warehouse */}
      <div className="space-y-3">
        <div>
          <label htmlFor="warehouse-select" className="block text-xs font-medium text-slate-700 mb-1">
            Add Warehouse
          </label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading warehouses...
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                id="warehouse-select"
                value={newWarehouseId}
                onChange={(e) => setNewWarehouseId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                disabled={saving || availableWarehouses.length === 0}
              >
                <option value="">Select a warehouse...</option>
                {availableWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleAddWarehouse}
                disabled={saving || !newWarehouseId || availableWarehouses.length === 0}
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
          {availableWarehouses.length === 0 && warehouses.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              All warehouses have been assigned
            </p>
          )}
          {assignedWarehouses.length === 0 && (
            <p className="text-xs text-slate-500 mt-2">
              No warehouses assigned. Add a warehouse above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

