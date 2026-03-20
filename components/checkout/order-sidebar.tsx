'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { CheckoutStep } from '@/lib/types/checkout';

interface OrderSidebarProps {
  subtotal: number;
  deliveryFee: number;
  taxAmount: number;
  taxRate: number;
  total: number;
  shippingState: string;
  currentStep: CheckoutStep;
  termsAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
  isSubmitting: boolean;
  isCalculatingTax: boolean;
  submitError: React.ReactNode | null;
  canProceed: boolean;
  buttonText: string;
  onPrimaryAction: () => void;
  paymentsDisabled: boolean;
  isTruckloadOrder?: boolean;
  selectedShippingLabel?: string;
  // Payment-specific props
  hasSavedPaymentMethods: boolean;
  useNewCard: boolean;
  clientSecret: string | null;
  selectedPaymentMethodId: string | null;
  onConfirmSavedPayment: () => void;
  minimumOrderError?: Array<{
    productName: string;
    minimumOrderQty: number;
    orderedQty: number;
  }> | null;
}

export function OrderSidebar({
  subtotal,
  deliveryFee,
  taxAmount,
  taxRate,
  total,
  shippingState,
  currentStep,
  termsAccepted,
  onTermsChange,
  isSubmitting,
  isCalculatingTax,
  submitError,
  canProceed,
  buttonText,
  onPrimaryAction,
  paymentsDisabled,
  isTruckloadOrder = false,
  selectedShippingLabel,
  hasSavedPaymentMethods,
  useNewCard,
  clientSecret,
  selectedPaymentMethodId,
  onConfirmSavedPayment,
  minimumOrderError,
}: OrderSidebarProps) {
  const shippingLabel = isTruckloadOrder
    ? deliveryFee > 0
      ? 'Truckload Freight'
      : 'Truckload Freight (calculating...)'
    : selectedShippingLabel ?? 'Shipping (Estimate)';
  return (
    <div className="sticky top-4 bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-6">
      <h2 className="text-xl font-semibold">Order Total</h2>

      <div className="space-y-3">
        <div className="flex justify-between text-gray-700">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-700">
          <span>{shippingLabel}</span>
          <span>{deliveryFee === 0 ? (isTruckloadOrder ? '—' : (selectedShippingLabel ? '$0.00' : '—')) : formatPrice(deliveryFee)}</span>
        </div>
        <div className="flex justify-between text-gray-700">
          <span>
            Tax
            {taxRate > 0 && shippingState && (
              <span className="ml-1 text-sm text-gray-500">
                ({shippingState}: {(taxRate * 100).toFixed(2)}%)
              </span>
            )}
            {taxRate === 0 && shippingState && currentStep === 'payment' && (
              <span className="ml-1 text-sm text-gray-500">
                (No tax for {shippingState})
              </span>
            )}
          </span>
          <span>{formatPrice(taxAmount)}</span>
        </div>
        <div className="pt-3 border-t border-gray-300">
          <div className="flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </div>

      {currentStep !== 'payment' && (
        <>
          {submitError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm text-red-600">{submitError}</div>
            </div>
          )}

          <button
            onClick={onPrimaryAction}
            disabled={!canProceed || isCalculatingTax}
            className="w-full bg-black text-white py-4 rounded-lg font-semibold hover:cursor-pointer hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isCalculatingTax && <Loader2 className="h-5 w-5 animate-spin" />}
            {isCalculatingTax ? 'Calculating tax...' : buttonText}
          </button>
        </>
      )}

      {currentStep === 'payment' && (
        <>
          {submitError && !paymentsDisabled && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm text-red-600">{submitError}</div>
            </div>
          )}

          {!paymentsDisabled && (
            <div className="pt-4 border-t border-gray-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => onTermsChange(e.target.checked)}
                  className="w-4 h-4 mt-1"
                />
                <span className="text-sm text-gray-700">
                  I agree to the{' '}
                  <Link href="/terms" className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium">
                    Terms & Conditions
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium">
                    Privacy Policy
                  </Link>
                </span>
              </label>
            </div>
          )}

          {!paymentsDisabled && hasSavedPaymentMethods && !useNewCard ? (
            <button
              type="button"
              onClick={onConfirmSavedPayment}
              disabled={
                !termsAccepted ||
                isSubmitting ||
                !clientSecret ||
                !selectedPaymentMethodId ||
                Boolean(minimumOrderError && minimumOrderError.length > 0)
              }
              className="w-full bg-black text-white py-4 rounded-lg font-semibold hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              {isSubmitting ? 'Processing...' : 'Place Order'}
            </button>
          ) : !paymentsDisabled ? (
            <button
              type="submit"
              form="payment-form"
              disabled={
                !termsAccepted || 
                isSubmitting || 
                !clientSecret ||
                Boolean(minimumOrderError && minimumOrderError.length > 0)
              }
              className="w-full bg-black text-white py-4 rounded-lg font-semibold hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              {isSubmitting ? 'Processing...' : 'Place Order'}
            </button>
          ) : null}
        </>
      )}

      <div className="text-xs text-gray-500 text-center">
        Secure checkout powered by Stripe
      </div>
    </div>
  );
}
