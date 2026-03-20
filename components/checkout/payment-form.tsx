'use client';

import { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface PaymentFormProps {
  onSuccess: (paymentIntentId: string) => void;
  termsAccepted: boolean;
  saveCard: boolean;
  onSaveCardChange: (value: boolean) => void;
  onSubmittingChange: (value: boolean) => void;
}

export function PaymentForm({
  onSuccess,
  termsAccepted,
  saveCard,
  onSaveCardChange,
  onSubmittingChange,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !termsAccepted) {
      return;
    }

    onSubmittingChange(true);
    setError(null);

    try {
      // Confirm payment with Stripe
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/thank-you`,
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        setError(confirmError.message || 'Payment failed');
        onSubmittingChange(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id);
      } else {
        setError('Payment was not successful. Please try again.');
        onSubmittingChange(false);
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError('An unexpected error occurred. Please try again.');
      onSubmittingChange(false);
    }
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <div className="space-y-6">
        <div>
          <h3 className="font-semibold text-lg mb-4">Card Information</h3>
          <PaymentElement />
        </div>

        <div className="pt-4 border-t border-gray-200">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={saveCard}
              onChange={(e) => onSaveCardChange(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">
              Save card for future purchases
            </span>
          </label>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            We accept Visa, Mastercard, American Express, and Discover. Your
            payment information is securely processed by Stripe.
          </p>
        </div>
      </div>
    </form>
  );
}
