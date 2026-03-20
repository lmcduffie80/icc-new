'use client';

import { CreditCard } from 'lucide-react';
import type { PaymentMethod } from '@/lib/types/payment';

interface SavedPaymentMethodsProps {
  methods: PaymentMethod[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUseNewCard: () => void;
}

export function SavedPaymentMethods({
  methods,
  selectedId,
  onSelect,
  onUseNewCard,
}: SavedPaymentMethodsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-4">Select Payment Method</h3>
        <div className="space-y-3">
          {methods.map((method) => (
            <label
              key={method.id}
              className="flex items-center justify-between p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-black transition-colors"
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="payment-method"
                  value={method.paymentMethodId}
                  checked={selectedId === method.paymentMethodId}
                  onChange={(e) => onSelect(e.target.value)}
                  className="w-4 h-4"
                />
                <CreditCard className="h-5 w-5 text-gray-600" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{method.brand}</span>
                    <span className="text-gray-600">•••• {method.last4}</span>
                    {method.isDefault && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Expires {method.expMonth.toString().padStart(2, '0')}/
                    {method.expYear}
                  </p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onUseNewCard}
          className="text-sm text-primary hover:text-primary hover:underline"
        >
          Use a different card
        </button>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Your payment information is securely processed by Stripe.
        </p>
      </div>
    </div>
  );
}
