'use client';

import { Loader2, Truck, AlertCircle, MapPin } from 'lucide-react';
import type { TruckloadQuoteRate, TruckloadQuoteResponse } from '@/app/api/shipping/truckload-quote/route';

interface TruckloadRateSelectorProps {
  quote: TruckloadQuoteResponse | null;
  selectedRateId: string | null;
  onSelect: (rate: TruckloadQuoteRate, freightTotal: number) => void;
  loading: boolean;
  error: string | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}


export function TruckloadRateSelector({
  quote,
  selectedRateId,
  onSelect,
  loading,
  error,
}: TruckloadRateSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Calculating truckload freight rates…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (!quote || quote.rates.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
        No truckload rates available.
      </div>
    );
  }

  const { rates, total_totes, total_gallons, distance_miles, distance_unavailable } = quote;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="rounded-lg bg-orange-100 p-1.5">
          <Truck className="h-4 w-4 text-orange-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Truckload Freight</p>
          <p className="text-xs text-muted-foreground">
            Full truckload required for orders of {quote.settings.min_totes}+ totes
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-4 border-b border-border px-4 py-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{total_totes}</span> totes
        </span>
        <span>
          <span className="font-medium text-foreground">{total_gallons.toLocaleString()}</span> gallons
        </span>
        {distance_unavailable ? (
          <span className="flex items-center gap-1 text-amber-600">
            <MapPin className="h-3 w-3" />
            Distance unavailable — configure <code className="font-mono">GOOGLE_MAPS_API_KEY</code>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="font-medium text-foreground">{distance_miles.toLocaleString()}</span> miles from warehouse
          </span>
        )}
      </div>

      {/* Rate table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Freight Rate</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Freight/Gal</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total Freight</th>
              <th className="w-8 px-2" />
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => {
              const isSelected = rate.id === selectedRateId;

              return (
                <tr
                  key={rate.id}
                  onClick={() => onSelect(rate, rate.freight_total)}
                  className={`cursor-pointer border-b border-border last:border-0 transition-colors ${
                    isSelected
                      ? 'bg-primary/5'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${
                        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}>
                        {isSelected && (
                          <div className="flex h-full w-full items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {rate.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {distance_unavailable ? '—' : formatCurrency(rate.freight_per_gallon)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    {distance_unavailable ? '—' : formatCurrency(rate.freight_total)}
                  </td>
                  <td className="w-8 px-2" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {distance_unavailable && (
        <div className="border-t border-border bg-amber-50 px-4 py-3 text-xs text-amber-700">
          Distance calculation requires a Google Maps API key. Contact your administrator to configure <code className="font-mono">GOOGLE_MAPS_API_KEY</code>.
        </div>
      )}
    </div>
  );
}
