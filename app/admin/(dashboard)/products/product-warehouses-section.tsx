'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Warehouse, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

interface ProductWarehouse {
  id?: string;
  warehouse_id: string;
  inventory_count: number;
  warehouse_location: string | null;
  warehouse_name?: string;
  warehouse_address?: string;
}

interface ProductWarehousesSectionProps {
  productId: string | null;
  initialWarehouses?: ProductWarehouse[];
}

export function ProductWarehousesSection({ productId, initialWarehouses = [] }: ProductWarehousesSectionProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [productWarehouses, setProductWarehouses] = useState<ProductWarehouse[]>(initialWarehouses);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Fetch all available warehouses
  useEffect(() => {
    async function fetchWarehouses() {
      try {
        const response = await fetch('/api/admin/warehouses?active_only=true');
        if (response.ok) {
          const data = await response.json();
          setWarehouses(data);
        }
      } catch (error) {
        console.error('Error fetching warehouses:', error);
      } finally {
        setLoadingWarehouses(false);
      }
    }
    fetchWarehouses();
  }, []);

  // Fetch product warehouses if productId exists
  useEffect(() => {
    if (productId) {
      async function fetchProductWarehouses() {
        try {
          const response = await fetch(`/api/admin/products/${productId}/warehouses`);
          if (response.ok) {
            const data = await response.json();
            // Normalize warehouse_location to empty string if null
            const normalizedWarehouses = (data.warehouses || []).map((pw: ProductWarehouse) => ({
              ...pw,
              warehouse_location: pw.warehouse_location || '',
            }));
            setProductWarehouses(normalizedWarehouses);
          }
        } catch (error) {
          console.error('Error fetching product warehouses:', error);
        }
      }
      fetchProductWarehouses();
    }
  }, [productId]);

  const addWarehouse = () => {
    setProductWarehouses([
      ...productWarehouses,
      {
        warehouse_id: '',
        inventory_count: 0,
        warehouse_location: '',
      },
    ]);
  };

  const removeWarehouse = (index: number) => {
    setProductWarehouses(productWarehouses.filter((_, i) => i !== index));
  };

  const updateWarehouse = (index: number, field: keyof ProductWarehouse, value: string | number) => {
    const updated = [...productWarehouses];
    updated[index] = { ...updated[index], [field]: value };
    setProductWarehouses(updated);
  };

  const saveWarehouse = async (index: number) => {
    if (!productId) return;

    const pw = productWarehouses[index];
    if (!pw.warehouse_id) {
      alert('Please select a warehouse');
      return;
    }

    setSaving({ ...saving, [index]: true });
    try {
      const response = await fetch(`/api/admin/products/${productId}/warehouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: pw.warehouse_id,
          inventory_count: pw.inventory_count,
          warehouse_location: pw.warehouse_location,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save warehouse inventory');
      }

      const data = await response.json();
      const updated = [...productWarehouses];
      updated[index] = { ...updated[index], id: data.id };
      setProductWarehouses(updated);
    } catch (error) {
      console.error('Error saving warehouse:', error);
      alert('Failed to save warehouse inventory');
    } finally {
      setSaving({ ...saving, [index]: false });
    }
  };

  const deleteWarehouse = async (index: number) => {
    if (!productId) {
      removeWarehouse(index);
      return;
    }

    const pw = productWarehouses[index];
    if (!pw.id) {
      removeWarehouse(index);
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/products/${productId}/warehouses?warehouse_id=${pw.warehouse_id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete warehouse inventory');
      }

      removeWarehouse(index);
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      alert('Failed to delete warehouse inventory');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">Warehouse Inventory</h3>
        </div>
        <Button
          type="button"
          onClick={addWarehouse}
          size="sm"
          variant="outline"
          disabled={loadingWarehouses}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Warehouse
        </Button>
      </div>

      {loadingWarehouses ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading warehouses...
        </div>
      ) : productWarehouses.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">
          No warehouse inventory configured. Click &quot;Add Warehouse&quot; to add inventory locations.
        </p>
      ) : (
        <div className="space-y-4">
          {productWarehouses.map((pw, index) => {
            const selectedWarehouse = warehouses.find((w) => w.id === pw.warehouse_id);
            return (
              <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-700">
                    Warehouse {index + 1}
                  </h4>
                  <button
                    type="button"
                    onClick={() => deleteWarehouse(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor={`warehouse-${index}`} className="block text-xs font-medium text-slate-700 mb-1">
                      Warehouse <span className="text-red-500">*</span>
                    </label>
                    <select
                      id={`warehouse-${index}`}
                      value={pw.warehouse_id}
                      onChange={(e) => updateWarehouse(index, 'warehouse_id', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      disabled={!!pw.id && !!productId}
                    >
                      <option value="">Select warehouse...</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`inventory-count-${index}`} className="block text-xs font-medium text-slate-700 mb-1">
                      Inventory Count
                    </label>
                    <input
                      id={`inventory-count-${index}`}
                      type="number"
                      min="0"
                      value={pw.inventory_count}
                      onChange={(e) =>
                        updateWarehouse(index, 'inventory_count', parseInt(e.target.value) || 0)
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label htmlFor={`warehouse-location-${index}`} className="block text-xs font-medium text-slate-700 mb-1">
                      Location in Warehouse
                    </label>
                    <input
                      id={`warehouse-location-${index}`}
                      type="text"
                      value={pw.warehouse_location || ''}
                      onChange={(e) =>
                        updateWarehouse(index, 'warehouse_location', e.target.value)
                      }
                      placeholder="e.g., A-12-B, Bay 3"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {selectedWarehouse && (
                  <div className="mt-3 text-xs text-slate-500">
                    <p>
                      {selectedWarehouse.address_street}, {selectedWarehouse.address_city},{' '}
                      {selectedWarehouse.address_state} {selectedWarehouse.address_zip}
                    </p>
                  </div>
                )}

                {productId && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      onClick={() => saveWarehouse(index)}
                      size="sm"
                      disabled={!pw.warehouse_id || saving[index]}
                    >
                      {saving[index] ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

