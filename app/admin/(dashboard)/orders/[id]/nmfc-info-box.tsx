'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Loader2, Save, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NMFCInfo {
  number?: string; // NMFC number for LTL
  shippingType: 'TL' | 'LTL'; // Truckload or Less Than Truckload
  freightClass?: string; // LTL freight class (e.g., "65")
}

interface WarehouseAllocation {
  warehouse_id: string;
  warehouse_name: string;
  items?: Array<{
    product_id: string;
    quantity: number;
  }>;
}

interface NMFCInfoBoxProps {
  orderId: string;
  currentNMFC?: string | null; // Legacy: single NMFC number
  currentNMFCInfo?: Array<{ number?: string; shippingType: 'TL' | 'LTL'; freightClass?: string }> | null; // New: array of NMFC info
  warehouseAllocations?: WarehouseAllocation[]; // To determine if multiple warehouses
  suggestedNMFCInfo?: Array<{ shippingType: 'TL' | 'LTL'; number?: string; freightClass?: string }> | null; // Auto-populated from product
}

export function NMFCInfoBox({ orderId, currentNMFC, currentNMFCInfo, warehouseAllocations, suggestedNMFCInfo }: NMFCInfoBoxProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Determine if we have multiple warehouses (for informational purposes)
  const hasMultipleWarehouses = warehouseAllocations && warehouseAllocations.length > 1;
  // Always allow up to 2 entries to support: 2 TLs, 1 TL + 1 LTL, or 2 LTLs
  const maxEntries = 2;
  
  // Helper function to initialize NMFC entries from props
  // Priority: saved data > auto-suggestion from product > blank default
  const initializeNMFCEntries = (): NMFCInfo[] => {
    if (currentNMFCInfo && Array.isArray(currentNMFCInfo) && currentNMFCInfo.length > 0) {
      return currentNMFCInfo;
    } else if (currentNMFC) {
      if (currentNMFC === 'TL') {
        return [{ shippingType: 'TL', number: undefined }];
      } else {
        return [{ shippingType: 'LTL', number: currentNMFC }];
      }
    } else if (suggestedNMFCInfo && suggestedNMFCInfo.length > 0) {
      return suggestedNMFCInfo;
    }
    return [{ shippingType: 'LTL', number: '' }];
  };

  const isAutoPopulated =
    !currentNMFCInfo?.length && !currentNMFC && !!suggestedNMFCInfo?.length;

  // Initialize state - support both legacy single NMFC and new array format
  const [nmfcEntries, setNmfcEntries] = useState<NMFCInfo[]>(initializeNMFCEntries);

  // Sync state when props change (e.g., after refresh)
  useEffect(() => {
    let newEntries: NMFCInfo[] = [];
    if (currentNMFCInfo && Array.isArray(currentNMFCInfo) && currentNMFCInfo.length > 0) {
      newEntries = currentNMFCInfo;
    } else if (currentNMFC) {
      if (currentNMFC === 'TL') {
        newEntries = [{ shippingType: 'TL', number: undefined }];
      } else {
        newEntries = [{ shippingType: 'LTL', number: currentNMFC }];
      }
    } else if (suggestedNMFCInfo && suggestedNMFCInfo.length > 0) {
      newEntries = suggestedNMFCInfo;
    } else {
      newEntries = [{ shippingType: 'LTL', number: '' }];
    }
    setNmfcEntries(newEntries);
  }, [currentNMFC, currentNMFCInfo, suggestedNMFCInfo]);

  const addEntry = () => {
    if (nmfcEntries.length < maxEntries) {
      setNmfcEntries([...nmfcEntries, { shippingType: 'LTL', number: '' }]);
    }
  };

  const removeEntry = (index: number) => {
    if (nmfcEntries.length > 1) {
      setNmfcEntries(nmfcEntries.filter((_, i) => i !== index));
    }
  };

  const updateEntry = (index: number, field: 'shippingType' | 'number' | 'freightClass', value: string) => {
    const updated = [...nmfcEntries];
    if (field === 'shippingType') {
      updated[index] = {
        ...updated[index],
        shippingType: value as 'TL' | 'LTL',
        number: value === 'TL' ? undefined : (updated[index].number || ''),
        freightClass: value === 'TL' ? undefined : (updated[index].freightClass || ''),
      };
    } else if (field === 'freightClass') {
      updated[index] = { ...updated[index], freightClass: value };
    } else {
      updated[index] = { ...updated[index], number: value };
    }
    setNmfcEntries(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      // Validate entries
      for (let i = 0; i < nmfcEntries.length; i++) {
        const entry = nmfcEntries[i];
        if (entry.shippingType === 'LTL' && (!entry.number || entry.number.trim() === '')) {
          throw new Error(`Entry ${i + 1}: NMFC number is required for LTL shipments`);
        }
      }
      
      const response = await fetch(`/api/admin/orders/${orderId}/nmfc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nmfcInfo: nmfcEntries }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update NMFC information');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update NMFC information');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Truck className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">NMFC Number / Shipping Type</h3>
        {hasMultipleWarehouses && (
          <span className="text-xs text-slate-500">(Multiple Warehouses)</span>
        )}
        {!hasMultipleWarehouses && nmfcEntries.length === 1 && (
          <span className="text-xs text-slate-500">(Add up to 2 shipments)</span>
        )}
      </div>

      {isAutoPopulated && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
          Auto-populated from product — review and save to confirm.
        </div>
      )}
      
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-600">
          NMFC information updated successfully!
        </div>
      )}

      <div className="space-y-4">
        {nmfcEntries.map((entry, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
            {nmfcEntries.length > 1 && (
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-slate-700">
                  Shipment {index + 1}
                </h4>
                <button
                  onClick={() => removeEntry(index)}
                  className="text-red-600 hover:text-red-700"
                  type="button"
                  title="Remove this shipment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`tl-${index}`}
                  name={`shipping-type-${index}`}
                  checked={entry.shippingType === 'TL'}
                  onChange={() => updateEntry(index, 'shippingType', 'TL')}
                  className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor={`tl-${index}`} className="text-sm font-medium text-slate-700 cursor-pointer">
                  Truckload (TL)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`ltl-${index}`}
                  name={`shipping-type-${index}`}
                  checked={entry.shippingType === 'LTL'}
                  onChange={() => updateEntry(index, 'shippingType', 'LTL')}
                  className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor={`ltl-${index}`} className="text-sm font-medium text-slate-700 cursor-pointer">
                  Less Than Truckload (LTL)
                </label>
              </div>

              {entry.shippingType === 'LTL' && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor={`nmfc-number-${index}`} className="block text-xs font-medium text-slate-700 mb-1">
                      NMFC Number
                    </label>
                    <input
                      id={`nmfc-number-${index}`}
                      type="text"
                      value={entry.number || ''}
                      onChange={(e) => updateEntry(index, 'number', e.target.value)}
                      placeholder="e.g., 46120"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      disabled={saving}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      National Motor Freight Classification number for LTL shipments
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`freight-class-${index}`} className="block text-xs font-medium text-slate-700 mb-1">
                      Freight Class
                    </label>
                    <input
                      id={`freight-class-${index}`}
                      type="text"
                      value={entry.freightClass || ''}
                      onChange={(e) => updateEntry(index, 'freightClass', e.target.value)}
                      placeholder="e.g., 65"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      disabled={saving}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      LTL freight class (e.g., 55, 65, 70)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {nmfcEntries.length < maxEntries && (
          <button
            onClick={addEntry}
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-400"
          >
            <Plus className="h-4 w-4" />
            {hasMultipleWarehouses ? 'Add Second Shipment' : 'Add Additional Shipment'}
          </button>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || nmfcEntries.some(e => e.shippingType === 'LTL' && !e.number?.trim())}
          size="sm"
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save NMFC Information
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
