'use client';

import { createPortal } from 'react-dom';
import { X, Building2, Users } from 'lucide-react';

interface PartnerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVendor: () => void;
  onSelectSupplier: () => void;
}

export function PartnerSelectionModal({
  isOpen,
  onClose,
  onSelectVendor,
  onSelectSupplier,
}: PartnerSelectionModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Create New Partner</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <p className="text-sm text-slate-600 mb-6">
          Choose the type of partner you want to create:
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => {
              onSelectVendor();
              onClose();
            }}
            className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition"
          >
            <Building2 className="h-8 w-8 text-emerald-600" />
            <span className="font-medium text-slate-900">Vendor</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              onSelectSupplier();
              onClose();
            }}
            className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition"
          >
            <Users className="h-8 w-8 text-emerald-600" />
            <span className="font-medium text-slate-900">Supplier</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
