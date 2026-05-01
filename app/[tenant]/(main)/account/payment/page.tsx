'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard, Plus, Loader2, X } from 'lucide-react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { PaymentMethod } from '@/lib/types/payment';

// Load Stripe outside of component
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Add Payment Method Form Component
function AddPaymentMethodForm({ 
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Confirm setup intent
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/account/payment`,
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        setError(confirmError.message || 'Failed to add payment method');
        setIsSubmitting(false);
        return;
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        // Save payment method to database
        const response = await fetch('/api/payment/methods/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            setupIntentId: setupIntent.id,
            setAsDefault,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save payment method');
        }

        onSuccess();
      } else {
        setError('Payment method setup was not successful');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Error adding payment method:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="font-medium mb-4">Card Information</h3>
        <PaymentElement />
      </div>

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(e) => setSetAsDefault(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">
            Set as default payment method
          </span>
        </label>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || !stripe || !elements}
          className="flex-1 gap-2"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Adding...' : 'Add Payment Method'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>

      <p className="text-xs text-gray-500">
        Your payment information is securely processed by Stripe. We never store your full card details.
      </p>
    </form>
  );
}

export default function PaymentMethodsPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isCreatingSetupIntent, setIsCreatingSetupIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isPending, router]);

  useEffect(() => {
    if (user) {
      fetchPaymentMethods();
    }
  }, [user]);

  const fetchPaymentMethods = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/payment/methods');
      
      if (!response.ok) {
        throw new Error('Failed to fetch payment methods');
      }

      const data = await response.json();
      setPaymentMethods(data.paymentMethods || []);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      setError('Failed to load payment methods');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    try {
      setIsCreatingSetupIntent(true);
      setError(null);
      
      const response = await fetch('/api/payment/methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to initialize payment method setup');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
      setShowAddModal(true);
    } catch (err) {
      console.error('Error creating setup intent:', err);
      setError('Failed to initialize payment method setup');
    } finally {
      setIsCreatingSetupIntent(false);
    }
  };

  const handleAddSuccess = () => {
    setShowAddModal(false);
    setClientSecret(null);
    fetchPaymentMethods();
  };

  const handleAddCancel = () => {
    setShowAddModal(false);
    setClientSecret(null);
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    try {
      const response = await fetch('/api/payment/methods/default', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentMethodId }),
      });

      if (!response.ok) {
        throw new Error('Failed to set default payment method');
      }

      fetchPaymentMethods();
    } catch (err) {
      console.error('Error setting default:', err);
      setError('Failed to set default payment method');
    }
  };

  const handleRemove = async (paymentMethodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return;
    }

    try {
      const response = await fetch('/api/payment/methods', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentMethodId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove payment method');
      }

      fetchPaymentMethods();
    } catch (err) {
      console.error('Error removing payment method:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove payment method');
    }
  };

  if (isPending || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Payment Methods</h1>
              <p className="text-muted-foreground mt-1">
                Manage your saved payment methods
              </p>
            </div>
            <Button 
              className="gap-2"
              onClick={handleAddPaymentMethod}
              disabled={isCreatingSetupIntent}
            >
              {isCreatingSetupIntent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Payment Method
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Payment Methods List */}
        {paymentMethods.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No payment methods saved</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Add a payment method to make checkout faster and easier. Your payment information is securely stored with Stripe.
            </p>
            <Button 
              className="gap-2"
              onClick={handleAddPaymentMethod}
              disabled={isCreatingSetupIntent}
            >
              {isCreatingSetupIntent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Payment Method
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="bg-card border border-border rounded-xl p-6 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-muted">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{method.brand}</span>
                      <span className="text-muted-foreground">•••• {method.last4}</span>
                      {method.isDefault && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Expires {method.expMonth.toString().padStart(2, '0')}/{method.expYear}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!method.isDefault && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleSetDefault(method.paymentMethodId)}
                    >
                      Set as Default
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemove(method.paymentMethodId)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 bg-card border border-border rounded-xl p-6">
          <h3 className="font-medium mb-2">Secure Payments</h3>
          <p className="text-sm text-muted-foreground">
            Your payment information is encrypted and securely stored by Stripe. We never store your full card details on our servers.
          </p>
        </div>

        {/* Add Payment Method Modal */}
        {showAddModal && clientSecret && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Add Payment Method</h2>
                <button
                  onClick={handleAddCancel}
                  className="p-1 hover:bg-muted rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <AddPaymentMethodForm
                  clientSecret={clientSecret}
                  onSuccess={handleAddSuccess}
                  onCancel={handleAddCancel}
                />
              </Elements>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

