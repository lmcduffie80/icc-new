'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Warehouse {
  id: string;
  name: string;
}

interface DeleteWarehouseModalProps {
  warehouse: Warehouse;
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteWarehouseModal({ warehouse, isOpen, onClose }: DeleteWarehouseModalProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/warehouses/${warehouse.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete warehouse');
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete warehouse');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full bg-red-100 p-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Delete Warehouse</h2>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Are you sure you want to delete <strong>{warehouse.name}</strong>? This action cannot be undone.
          </p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-800 font-medium mb-1">What will be deleted:</p>
            <ul className="text-xs text-amber-700 space-y-1 ml-4 list-disc">
              <li>All product inventory records for this warehouse</li>
              <li>All supplier assignments to this warehouse</li>
            </ul>
            <p className="text-xs text-amber-800 font-medium mt-2 mb-1">Protected:</p>
            <ul className="text-xs text-amber-700 ml-4 list-disc">
              <li>Orders cannot be deleted - warehouse deletion will be blocked if any orders reference it</li>
            </ul>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Warehouse'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

