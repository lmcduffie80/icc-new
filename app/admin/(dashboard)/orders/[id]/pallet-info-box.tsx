'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PalletInfoBoxProps {
  orderId: string;
  currentPalletCount: number | null;
}

export function PalletInfoBox({ orderId, currentPalletCount }: PalletInfoBoxProps) {
  const router = useRouter();
  const [palletCount, setPalletCount] = useState<string>(currentPalletCount?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (currentPalletCount !== null && currentPalletCount !== undefined) {
      setPalletCount(currentPalletCount.toString());
    } else {
      setPalletCount('');
    }
  }, [currentPalletCount]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const palletCountNum = parseInt(palletCount.trim(), 10);
      
      if (isNaN(palletCountNum) || palletCountNum < 1) {
        throw new Error('Pallet count must be a positive number');
      }

      const response = await fetch(`/api/admin/orders/${orderId}/pallets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palletCount: palletCountNum }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update pallet count');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pallet count');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">Pallet Count</h3>
      </div>
      
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-lg bg-green-50 p-2 text-sm text-green-600">
          Pallet count updated successfully!
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="pallet-count" className="block text-xs font-medium text-slate-700 mb-1">
            Total Pallets
          </label>
          <input
            id="pallet-count"
            type="number"
            min="1"
            value={palletCount}
            onChange={(e) => setPalletCount(e.target.value)}
            placeholder="e.g., 2"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            disabled={saving}
          />
          <p className="mt-1 text-xs text-slate-500">
            Manually set the total number of pallets for this order. Leave empty to use auto-calculation.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !palletCount.trim() || parseInt(palletCount.trim(), 10) < 1}
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
              Save Pallet Count
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

