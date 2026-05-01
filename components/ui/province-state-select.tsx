'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { US_STATES } from './state-select';

export const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
] as const;

export type CAProvinceCode = (typeof CA_PROVINCES)[number]['code'];
export type USStateCode = (typeof US_STATES)[number]['code'];

export interface ProvinceStateSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  country?: 'US' | 'CA';
  onChange?: (value: string) => void;
  placeholder?: string;
}

const ProvinceStateSelect = forwardRef<HTMLSelectElement, ProvinceStateSelectProps>(
  (
    {
      className,
      onChange,
      country = 'US',
      placeholder,
      value,
      ...props
    },
    ref
  ) => {
    const isCanada = country === 'CA';
    const options = isCanada ? CA_PROVINCES : US_STATES;
    const defaultPlaceholder = isCanada ? 'Select Province/Territory' : 'Select State';

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e.target.value);
    };

    return (
      <select
        ref={ref}
        className={cn(
          'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        value={value}
        onChange={handleChange}
        {...props}
      >
        <option value="">{placeholder ?? defaultPlaceholder}</option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} – {opt.name}
          </option>
        ))}
      </select>
    );
  }
);

ProvinceStateSelect.displayName = 'ProvinceStateSelect';

export { ProvinceStateSelect };
