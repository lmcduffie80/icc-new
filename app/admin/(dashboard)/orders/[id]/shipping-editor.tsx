'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, DollarSign, Save, Loader2, AlertCircle, TrendingUp, RefreshCw, CheckCircle2, Clock, Package, BookCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FreightRate {
  carrier: string;
  service: string;
  transitDays: string;
  price: number;
  quoteId: string;
}

interface AddressSummary {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

interface ShippingEditorProps {
  orderId: string;
  currentShippingFee: number;
  deliveryMethod: string;
  estimatedShippingFee?: number | null;
  isManualShipping: boolean;
  freightQuoteId?: string | null;
  isBooked?: boolean;
  onUpdate?: () => void;
  shipFromAddress?: AddressSummary | null;
  shipToAddress?: AddressSummary | null;
  liftgateRequired?: boolean;
}

export function ShippingEditor({
  orderId,
  currentShippingFee,
  deliveryMethod,
  estimatedShippingFee,
  isManualShipping,
  freightQuoteId,
  isBooked: initialIsBooked = false,
  onUpdate,
  shipFromAddress,
  shipToAddress,
  liftgateRequired = false,
}: ShippingEditorProps) {
  const router = useRouter();
  const [shippingFee, setShippingFee] = useState(currentShippingFee.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Live rates state
  const [rates, setRates] = useState<FreightRate[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const [ratesFetched, setRatesFetched] = useState(false);
  const [shipBossConfigured, setShipBossConfigured] = useState(true);
  const [freightTooHeavy, setFreightTooHeavy] = useState<{ weightLbs: number; message: string } | null>(null);

  // Book shipment state
  const [booked, setBooked] = useState(initialIsBooked);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingResult, setBookingResult] = useState<{ bookingId: string; trackingNumber?: string | null; labelUrl?: string | null } | null>(null);
  const [ltlBookingInfo, setLtlBookingInfo] = useState<{ bookingUrl: string; quoteId?: string; carrier?: string } | null>(null);

  const handleSave = async () => {
    const fee = parseFloat(shippingFee);
    if (isNaN(fee) || fee < 0) {
      setError('Please enter a valid shipping fee (>= 0)');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const selectedRate = rates.find((r) => r.quoteId === selectedQuoteId);
      const response = await fetch(`/api/admin/orders/${orderId}/shipping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryFee: fee,
          freightQuoteId: selectedRate?.quoteId,
          shippingCarrier: selectedRate?.carrier,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update shipping cost');
      }

      setSuccess(true);
      // If a new live rate was saved, reset booking state so the button becomes active
      if (selectedRate?.quoteId) {
        setBookingError('');
        setBooked(false);
        setBookingResult(null);
      }
      router.refresh();
      onUpdate?.();

      setTimeout(() => {
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update shipping cost');
    } finally {
      setSaving(false);
    }
  };

  const isTruckload = deliveryMethod?.startsWith('Truckload');

  const effectivePriceFor = (rate: FreightRate): number => {
    if (liftgateRequired && !isTruckload) {
      return Math.round(rate.price * 1.25 * 100) / 100;
    }
    return rate.price;
  };

  const handleGetRates = async () => {
    setLoadingRates(true);
    setRatesError('');
    setRatesFetched(false);
    setRates([]);
    setSelectedQuoteId(null);
    setFreightTooHeavy(null);
    // Clear any previous booking error — fresh rates will provide a new quote ID
    setBookingError('');

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/shipping-rates`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 422 && data.code === 'FREIGHT_TOO_HEAVY') {
          setFreightTooHeavy({ weightLbs: data.weightLbs, message: data.error });
          return;
        }
        throw new Error(data.error || 'Failed to fetch shipping rates');
      }

      setShipBossConfigured(data.configured);
      const fetchedRates: FreightRate[] = data.rates ?? [];
      setRates(fetchedRates);
      setRatesFetched(true);

      if (fetchedRates.length > 0) {
        // Prefer the rate that matches what the customer originally paid (within $1 tolerance)
        const match = fetchedRates.find(
          (r) => Math.abs(effectivePriceFor(r) - currentShippingFee) < 1.0
        );
        const defaultRate = match ?? fetchedRates[0];
        setSelectedQuoteId(defaultRate.quoteId);
        setShippingFee(effectivePriceFor(defaultRate).toFixed(2));
      }
    } catch (err) {
      setRatesError(err instanceof Error ? err.message : 'Failed to fetch shipping rates');
    } finally {
      setLoadingRates(false);
    }
  };

  const handleSelectRate = (rate: FreightRate) => {
    setSelectedQuoteId(rate.quoteId);
    setShippingFee(effectivePriceFor(rate).toFixed(2));
    setError('');
  };

  const handleBookShipment = async () => {
    setBooking(true);
    setBookingError('');
    setLtlBookingInfo(null);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/book-shipment`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.ltlBookingRequired) {
          setLtlBookingInfo({
            bookingUrl: data.bookingUrl,
            quoteId: data.quoteId,
            carrier: data.carrier,
          });
          return;
        }
        throw new Error(data.error || 'Failed to book shipment');
      }

      setBooked(true);
      setBookingResult({
        bookingId: data.bookingId,
        trackingNumber: data.trackingNumber,
        labelUrl: data.labelUrl ?? data.bolUrl,
      });
      setLtlBookingInfo(null);
      router.refresh();
      onUpdate?.();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to book shipment');
    } finally {
      setBooking(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg flex items-center gap-2 font-semibold text-slate-900">
          <Truck className="h-5 w-5" />
          Shipping Cost
          {isManualShipping && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              <AlertCircle className="h-3 w-3" />
              Manual
            </span>
          )}
        </h2>
      </div>

      <div className="space-y-4">
        {/* Current Shipping Info */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Current Shipping Fee</span>
            <span className="text-lg font-semibold text-slate-900">
              {formatCurrency(currentShippingFee)}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Delivery Method: <span className="font-medium capitalize">{deliveryMethod}</span>
          </div>
        </div>

        {/* Estimated Shipping Fee (if available) */}
        {estimatedShippingFee !== null && estimatedShippingFee !== undefined && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Estimated Shipping Fee</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-700">
                Based on historical data for similar orders
              </p>
              <span className="text-base font-semibold text-blue-900">
                {formatCurrency(estimatedShippingFee)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShippingFee(estimatedShippingFee.toFixed(2))}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline hover:cursor-pointer"
            >
              Use estimated fee
            </button>
          </div>
        )}

        {/* Live Rates Section */}
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Live Carrier Rates</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGetRates}
              disabled={loadingRates}
              className="flex items-center gap-2 hover:cursor-pointer"
            >
              {loadingRates ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Get Live Rates
                </>
              )}
            </Button>
          </div>

          {freightTooHeavy && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">LTL / Truckload Freight Required</p>
                  <p className="mt-1 text-xs text-amber-800">
                    This shipment weighs approximately{' '}
                    <span className="font-medium">{freightTooHeavy.weightLbs.toLocaleString()} lbs</span>, which
                    exceeds parcel carrier limits (150 lbs max). Parcel rates are not available.
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    Enter the freight cost manually below after obtaining a quote from your LTL or TL carrier.
                  </p>
                </div>
              </div>
            </div>
          )}

          {ratesError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-700">{ratesError}</p>
              </div>
            </div>
          )}

          {!shipBossConfigured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <p className="text-sm text-amber-700">
                  ShipBoss is not configured. Set <code className="font-mono text-xs">SHIPPING_ICC</code> to enable live shipping rates.
                </p>
              </div>
            </div>
          )}

          {ratesFetched && rates.length === 0 && (
            <p className="text-xs text-slate-500">No rates available for this shipment.</p>
          )}

          {rates.length > 0 && (
            <div className="space-y-2">
              {rates.map((rate) => {
                const isSelected = selectedQuoteId === rate.quoteId;
                const displayPrice = effectivePriceFor(rate);
                const hasLiftgateSurcharge = liftgateRequired && !isTruckload;
                return (
                  <button
                    key={rate.quoteId}
                    type="button"
                    onClick={() => handleSelectRate(rate)}
                    className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${isSelected ? 'text-emerald-900' : 'text-slate-900'}`}>
                          {rate.carrier} — {rate.service}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          {rate.transitDays}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {formatCurrency(displayPrice)}
                      </span>
                      {hasLiftgateSurcharge && (
                        <p className="text-xs text-amber-600 mt-0.5">incl. liftgate</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Shipping Fee Editor */}
        <div>
          <label htmlFor="shipping-fee" className="block text-sm font-medium text-slate-700 mb-2">
            Update Shipping Fee ($)
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="shipping-fee"
                type="number"
                step="0.01"
                min="0"
                value={shippingFee}
                onChange={(e) => {
                  setShippingFee(e.target.value);
                  setError('');
                  setSuccess(false);
                  // Deselect rate if user manually edits the fee
                  if (selectedQuoteId) {
                    const selected = rates.find((r) => r.quoteId === selectedQuoteId);
                    if (selected && parseFloat(e.target.value) !== selected.price) {
                      setSelectedQuoteId(null);
                    }
                  }
                }}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="0.00"
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || (parseFloat(shippingFee) === currentShippingFee && !selectedQuoteId)}
              className="flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {selectedQuoteId
              ? 'Rate selected from live quotes. Click Save to apply.'
              : 'Update the shipping cost for this order. This will recalculate the order total.'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-green-700">Shipping cost updated successfully!</p>
          </div>
        )}

        {/* ShipBoss Booking Section — addresses always visible when available */}
        {(shipFromAddress || shipToAddress) && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">ShipBoss Booking</span>
              {booked && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Shipment Booked
                </span>
              )}
            </div>

            {booked && bookingResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                <p className="text-xs text-emerald-800">
                  <span className="font-medium">Booking ID:</span> {bookingResult.bookingId}
                </p>
                {bookingResult.trackingNumber && (
                  <p className="text-xs text-emerald-800">
                    <span className="font-medium">Tracking:</span> {bookingResult.trackingNumber}
                  </p>
                )}
                {bookingResult.labelUrl && (
                  <a
                    href={bookingResult.labelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-700 underline hover:text-emerald-900"
                  >
                    {bookingResult.labelUrl.includes('bol') || bookingResult.labelUrl.includes('bill')
                      ? 'Download BOL'
                      : 'Download Label'}
                  </a>
                )}
              </div>
            )}

            {/* Address cards — always visible */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-700 mb-1">Ship From (Warehouse)</p>
                {shipFromAddress ? (
                  <>
                    <p className="text-slate-600">{shipFromAddress.name}</p>
                    <p className="text-slate-500">{shipFromAddress.street}</p>
                    <p className="text-slate-500">{shipFromAddress.city}, {shipFromAddress.state} {shipFromAddress.zip}</p>
                  </>
                ) : (
                  <p className="text-slate-400 italic">No warehouse assigned</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-700 mb-1">Ship To (Customer)</p>
                {shipToAddress ? (
                  <>
                    <p className="text-slate-600">{shipToAddress.name}</p>
                    <p className="text-slate-500">{shipToAddress.street}</p>
                    <p className="text-slate-500">{shipToAddress.city}, {shipToAddress.state} {shipToAddress.zip}</p>
                  </>
                ) : (
                  <p className="text-slate-400 italic">No shipping address</p>
                )}
              </div>
            </div>

            {/* Liftgate badge — always visible when applicable */}
            {liftgateRequired && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm text-amber-800 font-medium">Liftgate service required for this delivery</span>
              </div>
            )}

            {/* Booking controls — only shown once a rate has been saved or shipment is booked */}
            {(freightQuoteId || booked) ? (
              <>
                {!booked && !ltlBookingInfo && (
                  <>
                    <p className="text-xs text-slate-500">
                      A rate has been saved for this order. Clicking Book Shipment will fetch a fresh quote and purchase the label with ShipBoss.
                    </p>
                    <Button
                      onClick={handleBookShipment}
                      disabled={booking}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      {booking ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Booking...
                        </>
                      ) : (
                        <>
                          <BookCheck className="h-4 w-4" />
                          Book Shipment
                        </>
                      )}
                    </Button>
                  </>
                )}

                {ltlBookingInfo && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-amber-900">LTL Freight — Book via ShipBoss</p>
                        <p className="text-xs text-amber-800">
                          LTL freight shipments must be booked through the ShipBoss web interface.
                          {ltlBookingInfo.carrier && (
                            <> Carrier: <span className="font-medium">{ltlBookingInfo.carrier}</span>.</>
                          )}
                        </p>
                        {ltlBookingInfo.quoteId && (
                          <p className="text-xs text-amber-700">
                            Quote ID: <code className="font-mono text-xs bg-amber-100 px-1 rounded">{ltlBookingInfo.quoteId}</code>
                          </p>
                        )}
                      </div>
                    </div>
                    <a
                      href={ltlBookingInfo.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                    >
                      <BookCheck className="h-4 w-4" />
                      Open ShipBoss
                    </a>
                  </div>
                )}

                {bookingError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{bookingError}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Get live rates above and save a rate to enable shipment booking.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
