'use client';

import { PhoneInput } from '@/components/ui/phone-input';
import { StateSelect } from '@/components/ui/state-select';
import type { CheckoutAddress } from '@/lib/types/checkout';

interface AddressFormProps {
  address: CheckoutAddress;
  onChange: (address: CheckoutAddress) => void;
  showBackButton?: boolean;
  onBackClick?: () => void;
  backButtonText?: string;
}

export function AddressForm({
  address,
  onChange,
  showBackButton = false,
  onBackClick,
  backButtonText = '← Back to saved addresses',
}: AddressFormProps) {
  const handleChange = (field: keyof CheckoutAddress, value: string) => {
    onChange({ ...address, [field]: value });
  };

  return (
    <div className="space-y-4">
      {showBackButton && onBackClick && (
        <div className="pb-4 border-b border-gray-200">
          <button
            type="button"
            onClick={onBackClick}
            className="text-sm text-primary hover:text-primary hover:underline"
          >
            {backButtonText}
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="First Name"
          value={address.firstName}
          onChange={(e) => handleChange('firstName', e.target.value)}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <input
          type="text"
          placeholder="Last Name"
          value={address.lastName}
          onChange={(e) => handleChange('lastName', e.target.value)}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <input
          type="email"
          placeholder="Email"
          value={address.email}
          onChange={(e) => handleChange('email', e.target.value)}
          className="col-span-2 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <PhoneInput
          value={address.phone}
          onChange={(value) => handleChange('phone', value)}
          className="col-span-2 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <input
          type="text"
          placeholder="Address Line 1"
          value={address.address1}
          onChange={(e) => handleChange('address1', e.target.value)}
          className="col-span-2 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <input
          type="text"
          placeholder="Address Line 2 (Optional)"
          value={address.address2}
          onChange={(e) => handleChange('address2', e.target.value)}
          className="col-span-2 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <input
          type="text"
          placeholder="City"
          value={address.city}
          onChange={(e) => handleChange('city', e.target.value)}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <StateSelect
          value={address.state}
          onChange={(value) => handleChange('state', value)}
          placeholder="State"
          className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
        <input
          type="text"
          placeholder="ZIP Code"
          value={address.zipCode}
          onChange={(e) => handleChange('zipCode', e.target.value)}
          className="col-span-2 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
        />
      </div>
    </div>
  );
}
