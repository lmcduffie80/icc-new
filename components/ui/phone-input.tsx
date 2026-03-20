'use client';

import { forwardRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  onChange?: (value: string) => void;
}

/**
 * Formats a phone number string to (xxx) xxx-xxxx format
 */
export function formatPhoneNumber(value: string): string {
  // Strip all non-numeric characters
  const digits = value.replace(/\D/g, '');
  
  // Limit to 10 digits
  const limitedDigits = digits.slice(0, 10);
  
  // Format based on length
  if (limitedDigits.length === 0) {
    return '';
  } else if (limitedDigits.length <= 3) {
    return `(${limitedDigits}`;
  } else if (limitedDigits.length <= 6) {
    return `(${limitedDigits.slice(0, 3)}) ${limitedDigits.slice(3)}`;
  } else {
    return `(${limitedDigits.slice(0, 3)}) ${limitedDigits.slice(3, 6)}-${limitedDigits.slice(6)}`;
  }
}

/**
 * Extracts just the digits from a formatted phone number
 */
export function getPhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, onChange, value, ...props }, ref) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        const formatted = formatPhoneNumber(inputValue);
        
        if (onChange) {
          onChange(formatted);
        }
      },
      [onChange]
    );

    // Format the value if it's provided
    const displayValue = value !== undefined ? formatPhoneNumber(String(value)) : undefined;

    return (
      <input
        type="tel"
        ref={ref}
        className={cn(
          'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        value={displayValue}
        onChange={handleChange}
        placeholder="(555) 555-5555"
        {...props}
      />
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export { PhoneInput };

