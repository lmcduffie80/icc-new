'use client';

import type { SavedAddress } from '@/lib/types/checkout';

interface SavedAddressesProps {
  addresses: SavedAddress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUseNewAddress: () => void;
}

export function SavedAddresses({
  addresses,
  selectedId,
  onSelect,
  onUseNewAddress,
}: SavedAddressesProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {addresses.map((address) => (
          <label
            key={address.id}
            className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-black transition-colors"
          >
            <input
              type="radio"
              name="shipping-address"
              value={address.id}
              checked={selectedId === address.id}
              onChange={() => onSelect(address.id)}
              className="w-4 h-4 mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{address.label}</span>
                {address.isPrimary && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Primary
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 mt-1">{address.fullName}</p>
              <p className="text-sm text-gray-600">{address.street}</p>
              <p className="text-sm text-gray-600">
                {address.city}, {address.state} {address.zipCode}
              </p>
            </div>
          </label>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onUseNewAddress}
          className="text-sm text-primary hover:text-primary hover:underline"
        >
          Use a different address
        </button>
      </div>
    </div>
  );
}
