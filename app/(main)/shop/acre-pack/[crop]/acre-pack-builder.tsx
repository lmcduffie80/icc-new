'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/cart-store';
import { getImageProxyUrl } from '@/lib/image-proxy';
import { calcUnitsNeeded, calcCostPerAcre } from '@/lib/acre-pack-calc';
import type { AcrePackProgram, AcrePackPass, AcrePackProduct } from '@/app/api/acre-pack/[crop]/route';

interface AcrePackBuilderProps {
  program: AcrePackProgram;
}

interface ProductSelection {
  product: AcrePackProduct;
  ratePerAcre: number;
  selected: boolean;
}

interface PassSelections {
  [passId: number]: {
    [productId: string]: ProductSelection;
  };
}

function formatPrice(price: string | number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(price));
}


export function AcrePackBuilder({ program }: AcrePackBuilderProps) {
  const addItem = useCartStore((s) => s.addItem);

  const [acreage, setAcreage] = useState<number | ''>('');
  const [acreageError, setAcreageError] = useState('');
  const [addedToCart, setAddedToCart] = useState(false);

  // Which passes are expanded (open by default)
  const [expandedPasses, setExpandedPasses] = useState<Set<number>>(
    () => new Set(program.passes.map((p) => p.id))
  );

  // Which product rows have their rate detail expanded
  const [expandedRates, setExpandedRates] = useState<Set<string>>(() => new Set());

  // Initialize selections: recommended products pre-selected at default rate
  const [selections, setSelections] = useState<PassSelections>(() => {
    const init: PassSelections = {};
    for (const pass of program.passes) {
      init[pass.id] = {};
      for (const product of pass.products) {
        init[pass.id][product.id] = {
          product,
          ratePerAcre: product.default_rate_per_acre,
          selected: product.is_recommended,
        };
      }
    }
    return init;
  });

  const acres = typeof acreage === 'number' ? acreage : 0;

  // All selected products across all passes
  const selectedItems = useMemo(() => {
    const items: { pass: AcrePackPass; sel: ProductSelection }[] = [];
    for (const pass of program.passes) {
      const passSelections = selections[pass.id] ?? {};
      for (const sel of Object.values(passSelections)) {
        if (sel.selected) items.push({ pass, sel });
      }
    }
    return items;
  }, [selections, program.passes]);

  const grandTotal = useMemo(() => {
    return selectedItems.reduce((sum, { sel }) => {
      const units = calcUnitsNeeded(acres, sel.ratePerAcre, sel.product.unit_size, sel.product.rate_unit, sel.product.unit_size_unit, sel.product.lbs_per_gallon);
      return sum + units * parseFloat(sel.product.price);
    }, 0);
  }, [selectedItems, acres]);

  const grandCostPerAcre = useMemo(() => {
    if (acres <= 0) return 0;
    return selectedItems.reduce((sum, { sel }) => {
      const units = calcUnitsNeeded(acres, sel.ratePerAcre, sel.product.unit_size, sel.product.rate_unit, sel.product.unit_size_unit, sel.product.lbs_per_gallon);
      return sum + calcCostPerAcre(units, sel.product.price, acres);
    }, 0);
  }, [selectedItems, acres]);

  function validateAcreage(val: number | ''): boolean {
    const n = Number(val);
    if (!val || n <= 0 || n > 100000) {
      setAcreageError('Please enter a valid acreage between 1 and 100,000.');
      return false;
    }
    setAcreageError('');
    return true;
  }

  function togglePass(passId: number) {
    setExpandedPasses((prev) => {
      const next = new Set(prev);
      if (next.has(passId)) next.delete(passId);
      else next.add(passId);
      return next;
    });
  }

  function toggleProduct(passId: number, productId: string) {
    setSelections((prev) => ({
      ...prev,
      [passId]: {
        ...prev[passId],
        [productId]: {
          ...prev[passId][productId],
          selected: !prev[passId][productId].selected,
        },
      },
    }));
  }

  function setRate(passId: number, productId: string, rate: number) {
    setSelections((prev) => ({
      ...prev,
      [passId]: {
        ...prev[passId],
        [productId]: { ...prev[passId][productId], ratePerAcre: rate },
      },
    }));
  }

  function toggleRateDetail(key: string) {
    setExpandedRates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleAddAllToCart() {
    if (!validateAcreage(acreage)) return;
    for (const { sel } of selectedItems) {
      const units = calcUnitsNeeded(acres, sel.ratePerAcre, sel.product.unit_size, sel.product.rate_unit, sel.product.unit_size_unit, sel.product.lbs_per_gallon);
      if (units <= 0) continue;
      addItem({
        id: sel.product.id,
        name: sel.product.name,
        price: sel.product.price,
        image: sel.product.image ?? '',
        quantity: units,
        inStock: sel.product.in_stock,
        approvedStates: sel.product.approved_states,
        unitOfMeasure: sel.product.unit_of_measure,
        truckloadEligible: sel.product.truckload_eligible,
        casesPerPallet: sel.product.cases_per_pallet ?? null,
        bulkDensityLbsPerGallon: sel.product.bulk_density_lbs_per_gallon ?? null,
        gallonsPerCase: sel.product.gallons_per_case ?? null,
      });
    }
    setAddedToCart(true);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

      {/* ── Define Your Program ─────────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Define your program</h2>
        <p className="mb-4 text-sm text-slate-500">
          Enter the number of acres for your program.
        </p>
        <div className="flex items-end gap-4">
          <div className="w-48">
            <label htmlFor="acreage" className="mb-1 block text-xs font-medium text-slate-600">
              Acres
            </label>
            <input
              id="acreage"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={acreage}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                setAcreage(val);
                if (val !== '') validateAcreage(val);
              }}
              placeholder="e.g. 1000"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {acreageError && (
            <p className="flex items-center gap-1 pb-2 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {acreageError}
            </p>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Choose your applications, and we&apos;ll suggest the ideal quantity for your acreage.
        </p>
      </div>

      {/* ── Pass Accordions ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {program.passes.map((pass) => {
          const isOpen = expandedPasses.has(pass.id);
          const passSelections = selections[pass.id] ?? {};
          const passSelectedItems = Object.values(passSelections).filter((s) => s.selected);

          const passCostPerAcre = acres > 0
            ? passSelectedItems.reduce((sum, sel) => {
                const units = calcUnitsNeeded(acres, sel.ratePerAcre, sel.product.unit_size, sel.product.rate_unit, sel.product.unit_size_unit, sel.product.lbs_per_gallon);
                return sum + calcCostPerAcre(units, sel.product.price, acres);
              }, 0)
            : 0;

          const passTotal = passSelectedItems.reduce((sum, sel) => {
            const units = calcUnitsNeeded(acres, sel.ratePerAcre, sel.product.unit_size, sel.product.rate_unit, sel.product.unit_size_unit, sel.product.lbs_per_gallon);
            return sum + units * parseFloat(sel.product.price);
          }, 0);

          return (
            <div key={pass.id} className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
              {/* Pass header */}
              <button
                onClick={() => togglePass(pass.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors hover:cursor-pointer"
              >
                <span className="font-semibold text-slate-900 text-sm sm:text-base">
                  Build Your {pass.name}
                </span>
                <ChevronDown
                  className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-border/50">
                  {/* Pass description / instruction row */}
                  {pass.description && (
                    <div className="flex items-start gap-3 border-b border-border/40 bg-slate-50/60 px-5 py-3">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <p className="text-sm text-slate-600">{pass.description}</p>
                    </div>
                  )}

                  {/* Product rows */}
                  {pass.products.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-slate-400">
                      No products assigned to this pass yet.
                    </div>
                  ) : (
                    <div>
                      {pass.products.map((product) => {
                        const sel = passSelections[product.id];
                        if (!sel) return null;
                        const rateKey = `${pass.id}-${product.id}`;
                        const isRateOpen = expandedRates.has(rateKey);
                        const units = calcUnitsNeeded(acres, sel.ratePerAcre, product.unit_size, product.rate_unit, product.unit_size_unit, product.lbs_per_gallon);
                        const lineTotal = units * parseFloat(product.price);
                        const cpa = calcCostPerAcre(units, product.price, acres);

                        return (
                          <div key={product.id} className="border-b border-border/40 last:border-b-0">
                            {/* Main product row */}
                            <div className="flex items-center gap-3 px-5 py-3">
                              {/* Checkbox */}
                              <button
                                onClick={() => toggleProduct(pass.id, product.id)}
                                className="shrink-0 hover:cursor-pointer"
                                aria-label={sel.selected ? 'Deselect product' : 'Select product'}
                              >
                                {sel.selected ? (
                                  <CheckSquare className="h-5 w-5 text-emerald-600" />
                                ) : (
                                  <Square className="h-5 w-5 text-slate-300" />
                                )}
                              </button>

                              {/* Product image (small) */}
                              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border bg-white">
                                <Image
                                  src={getImageProxyUrl(product.image) || product.image || '/placeholder.png'}
                                  alt={product.name}
                                  fill
                                  sizes="36px"
                                  className="object-contain"
                                  unoptimized={
                                    product.image?.includes('s3.amazonaws.com') ||
                                    product.image?.includes('.s3.')
                                  }
                                />
                              </div>

                              {/* Name + recommended badge */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-medium leading-tight ${sel.selected ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {product.name}
                                  </span>
                                  {product.is_recommended && (
                                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                                      Recommended
                                    </span>
                                  )}
                                  {!product.in_stock && (
                                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
                                      Out of stock
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Acreage or cost display */}
                              <div className="shrink-0 text-right">
                                {acres > 0 && sel.selected ? (
                                  <span className="text-sm text-slate-500">
                                    {acres.toLocaleString()} ac
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">
                                    {formatPrice(product.price)}{product.unit_of_measure ? `/${product.unit_of_measure}` : ''}
                                  </span>
                                )}
                              </div>

                              {/* Expand rate button */}
                              <button
                                onClick={() => toggleRateDetail(rateKey)}
                                className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors hover:cursor-pointer"
                                aria-label="Adjust rate"
                              >
                                <ChevronRight
                                  className={`h-4 w-4 transition-transform ${isRateOpen ? 'rotate-90' : ''}`}
                                />
                              </button>
                            </div>

                            {/* Rate detail panel */}
                            {isRateOpen && (
                              <div className="border-t border-border/30 bg-slate-50/80 px-5 py-4">
                                <div className="flex items-center gap-4 mb-3">
                                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                                    <Image
                                      src={getImageProxyUrl(product.image) || product.image || '/placeholder.png'}
                                      alt={product.name}
                                      fill
                                      sizes="56px"
                                      className="object-contain"
                                      unoptimized={
                                        product.image?.includes('s3.amazonaws.com') ||
                                        product.image?.includes('.s3.')
                                      }
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                                    <p className="text-xs text-slate-500">
                                      {formatPrice(product.price)}
                                      {product.unit_of_measure ? ` / ${product.unit_of_measure}` : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="mb-1 flex items-center justify-between">
                                  <label className="text-xs font-medium text-slate-600">
                                    Application Rate
                                  </label>
                                  <div className="text-right">
                                    <span className="text-sm font-semibold text-slate-800">
                                      {sel.ratePerAcre} {product.rate_unit}/acre
                                    </span>
                                    {product.lbs_per_gallon && product.lbs_per_gallon > 0 && (
                                      <p className="text-xs text-slate-400">
                                        = {(sel.ratePerAcre / product.lbs_per_gallon).toFixed(2)} gal/acre
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <input
                                  type="range"
                                  min={product.min_rate}
                                  max={product.max_rate}
                                  step={(product.max_rate - product.min_rate) / 20}
                                  value={sel.ratePerAcre}
                                  onChange={(e) => setRate(pass.id, product.id, parseFloat(e.target.value))}
                                  className="w-full accent-emerald-600"
                                />
                                <div className="mb-3 flex justify-between text-xs text-slate-400">
                                  <span>{product.min_rate} {product.rate_unit}</span>
                                  <span>{product.max_rate} {product.rate_unit}</span>
                                </div>

                                {acres > 0 && (
                                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-white border border-border/60 p-3 text-center text-xs">
                                    <div>
                                      <p className="text-slate-400">Units needed</p>
                                      <p className="font-bold text-slate-800 text-sm">{units}</p>
                                      <p className="text-slate-400">{product.unit_of_measure ?? 'units'}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400">Line total</p>
                                      <p className="font-bold text-slate-800 text-sm">{formatPrice(lineTotal)}</p>
                                      <p className="text-slate-400">for {acres.toLocaleString()} ac</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400">Cost/acre</p>
                                      <p className="font-bold text-emerald-700 text-sm">{formatPrice(cpa)}</p>
                                      <p className="text-slate-400">per acre</p>
                                    </div>
                                  </div>
                                )}

                                {product.label_scenarios && product.label_scenarios.length > 0 && (
                                  <div className="mt-3">
                                    <p className="mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      Label Rate Reference
                                    </p>
                                    <table className="w-full text-xs border border-border/60 rounded-lg overflow-hidden">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-500">
                                          <th className="px-3 py-1.5 text-left font-medium">Scenario</th>
                                          <th className="px-3 py-1.5 text-right font-medium">Rate/Acre</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {product.label_scenarios.map((scenario, idx) => (
                                          <tr key={idx} className="border-t border-border/40 bg-white even:bg-slate-50/60">
                                            <td className="px-3 py-1.5 text-slate-700">{scenario.label}</td>
                                            <td className="px-3 py-1.5 text-right font-medium text-slate-800">
                                              {scenario.rate} {product.rate_unit}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pass totals footer */}
                  {passSelectedItems.length > 0 && (
                    <div className="flex items-center justify-between border-t border-border/50 bg-slate-50 px-5 py-3">
                      <div className="text-sm text-slate-600">
                        Price per acre
                        <span className="ml-2 font-semibold text-slate-800">
                          {acres > 0 ? formatPrice(passCostPerAcre) : '—'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        Total{' '}
                        <span className="font-bold">
                          {acres > 0 ? formatPrice(passTotal) : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Grand Total + Add to Cart ────────────────────────────────────────── */}
      {selectedItems.length > 0 && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total program cost</p>
              <p className="text-2xl font-bold text-slate-900">
                {acres > 0 ? formatPrice(grandTotal) : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Cost per acre</p>
              <p className="text-2xl font-bold text-emerald-700">
                {acres > 0 ? formatPrice(grandCostPerAcre) : '—'}
              </p>
            </div>
          </div>

          {addedToCart ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                {selectedItems.length} product{selectedItems.length !== 1 ? 's' : ''} added to your cart!
              </div>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <Link href="/shop/acre-pack">Build Another Pack</Link>
                </Button>
                <Button asChild>
                  <Link href="/checkout">
                    <ShoppingCart className="mr-1 h-4 w-4" />
                    Go to Checkout
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="lg"
              className="w-full"
              onClick={handleAddAllToCart}
              disabled={acres <= 0}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Add {selectedItems.length} Product{selectedItems.length !== 1 ? 's' : ''} to Cart
              {acres <= 0 && <span className="ml-2 text-xs opacity-70">(enter acres first)</span>}
            </Button>
          )}
        </div>
      )}

      {selectedItems.length === 0 && program.passes.some((p) => p.products.length > 0) && (
        <div className="mt-6 rounded-xl border border-border bg-white p-5 text-center text-sm text-slate-400">
          Select at least one product above to build your pack.
        </div>
      )}
    </div>
  );
}
