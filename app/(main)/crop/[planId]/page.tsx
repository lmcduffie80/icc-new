'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { useCartStore } from '@/lib/cart-store';
import { OrderByDeadline } from '@/components/crop/order-by-deadline';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Sprout,
  Sun,
  Wheat,
  Leaf,
  Sparkles,
  Copy,
  Trash2,
  Loader2,
  AlertCircle,
  FileText,
  ShoppingCart,
  Check,
} from 'lucide-react';
import { CarbonScoreWidget } from '@/components/crop/carbon-score-widget';
import type { CarbonScore } from '@/lib/carbon-scoring';

// --- Types ---
interface PlanProduct {
  id: number;
  product_id: string;
  product_name: string;
  rate_per_acre: string;
  rate_unit: string;
  units_needed: string | null;
  unit_cost: string | null;
  line_total: string | null;
  cost_per_acre: string | null;
  is_recommended: boolean;
  sort_order: number;
  current_product_name: string;
  current_price: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  truckload_eligible?: boolean;
  cases_per_pallet?: number | null;
  bulk_density_lbs_per_gallon?: number | null;
  gallons_per_case?: number | null;
  label_url?: string | null;
  admin_label_url?: string | null;
  restricted_use?: boolean;
}

interface PlanPass {
  id: number;
  name: string;
  category: string;
  timing_label: string | null;
  sort_order: number;
  pass_cost: string | null;
  products: PlanProduct[];
}

interface CropPlan {
  id: number;
  plan_name: string;
  crop: string;
  plan_year: number;
  total_acres: string;
  target_weeds: string[];
  weed_pressure: string | null;
  total_cost: string | null;
  cost_per_acre: string | null;
  status: string;
  ai_generated: boolean;
  notes: string | null;
  carbon_score: CarbonScore | null;
  created_at: string;
  updated_at: string;
  passes: PlanPass[];
}

// --- Constants ---
const CROP_ICONS: Record<string, React.ReactNode> = {
  corn: <Sun className="h-6 w-6 text-yellow-500" />,
  soybeans: <Sprout className="h-6 w-6 text-green-600" />,
  wheat: <Wheat className="h-6 w-6 text-amber-600" />,
  cotton: <Leaf className="h-6 w-6 text-sky-600" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Pre-Emergent': 'bg-blue-50 border-blue-200',
  'Post-Emerge': 'bg-green-50 border-green-200',
  'In-Season': 'bg-amber-50 border-amber-200',
  'Adjuvants': 'bg-purple-50 border-purple-200',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Pre-Emergent': 'bg-blue-100 text-blue-700',
  'Post-Emerge': 'bg-green-100 text-green-700',
  'In-Season': 'bg-amber-100 text-amber-700',
  'Adjuvants': 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600' },
  saved: { label: 'Saved', color: 'bg-emerald-100 text-emerald-700' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

const WEED_PRESSURE_COLORS: Record<string, string> = {
  light: 'bg-green-100 text-green-700',
  moderate: 'bg-amber-100 text-amber-700',
  heavy: 'bg-red-100 text-red-700',
};

function fmt(n: string | null | undefined) {
  if (!n) return '—';
  return `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n: string | null | undefined) {
  if (!n) return '—';
  const val = parseFloat(n);
  return isNaN(val) ? '—' : val % 1 === 0 ? val.toLocaleString() : val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export default function CropPlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isPending } = useAuth();
  const { addItem } = useCartStore();
  const planId = params?.planId as string;

  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cloning, setCloning] = useState(false);
  // Track which product IDs were just added (for brief confirmation flash)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [allAdded, setAllAdded] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isPending && !user) {
      router.push(`/auth/sign-in?callbackUrl=/crop/${planId}`);
    }
  }, [user, isPending, router, planId]);

  const fetchPlan = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crop/${planId}`);
      if (res.status === 404) {
        setError('Plan not found.');
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to load plan.');
        return;
      }
      const data = await res.json();
      setPlan(data.plan);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (user) fetchPlan();
  }, [user, fetchPlan]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/crop/${planId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/crop/dashboard');
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failed to delete plan.');
        setConfirmDelete(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async () => {
    const currentYear = new Date().getFullYear();
    const year = prompt(`Clone "${plan?.plan_name}" to which year?`, String(currentYear));
    if (!year) return;
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      alert('Invalid year.');
      return;
    }
    setCloning(true);
    try {
      const res = await fetch(`/api/crop/${planId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_year: yearNum }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/crop/${data.plan.id}`);
      } else {
        alert(data.error ?? 'Failed to clone plan.');
      }
    } finally {
      setCloning(false);
    }
  };

  // Add a single product to cart using its computed units_needed as quantity
  const addProductToCart = useCallback((product: PlanProduct) => {
    const qty = product.units_needed ? Math.ceil(parseFloat(product.units_needed)) : 1;
    const price = product.current_price ?? product.unit_cost ?? '0';
    // Use explicit label URLs first; fall back to product image if the filename contains 'label'
    const imageIsLabel = product.image && (
      product.image.toLowerCase().includes('label') ||
      product.image.toLowerCase().includes('_label') ||
      product.image.toLowerCase().includes('-label')
    );
    const labelUrl = product.admin_label_url || product.label_url || (imageIsLabel ? product.image : null);
    addItem({
      id: product.product_id,
      name: product.current_product_name || product.product_name,
      price,
      image: product.image || labelUrl || '',
      quantity: qty,
      inStock: product.in_stock,
      unitOfMeasure: product.unit_of_measure,
      truckloadEligible: product.truckload_eligible,
      casesPerPallet: product.cases_per_pallet,
      bulkDensityLbsPerGallon: product.bulk_density_lbs_per_gallon,
      gallonsPerCase: product.gallons_per_case,
      labelUrl,
      restrictedUse: product.restricted_use,
    });
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(product.product_id);
      return next;
    });
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(product.product_id);
        return next;
      });
    }, 2000);
  }, [addItem]);

  // Add all products across all passes
  const addAllToCart = useCallback(() => {
    if (!plan) return;
    plan.passes.forEach((pass) => {
      pass.products.forEach((product) => {
        addProductToCart(product);
      });
    });
    setAllAdded(true);
    setTimeout(() => setAllAdded(false), 2500);
  }, [plan, addProductToCart]);

  // Add all products in a single pass
  const addPassToCart = useCallback((pass: PlanPass) => {
    pass.products.forEach((product) => addProductToCart(product));
  }, [addProductToCart]);

  // Count in-stock products across the whole plan
  const allProducts = plan?.passes.flatMap((p) => p.products) ?? [];
  const inStockCount = allProducts.filter((p) => p.in_stock).length;

  // Loading / auth pending state
  if (isPending || (loading && !error)) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-muted-foreground">Loading plan...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h2 className="mb-2 text-xl font-bold text-slate-900">Something went wrong</h2>
          <p className="mb-6 text-slate-500">{error}</p>
          <Button asChild variant="outline">
            <Link href="/crop/dashboard">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to My Plans
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const status = STATUS_LABELS[plan.status] ?? STATUS_LABELS.draft;
  const cropIcon = CROP_ICONS[plan.crop] ?? <Sprout className="h-6 w-6 text-emerald-600" />;
  const acresNum = parseFloat(plan.total_acres) || 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Breadcrumb */}
      <div className="border-b border-border/40 bg-white py-4">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/crop/dashboard"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              My Plans
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700 truncate max-w-xs">{plan.plan_name}</span>
          </div>
        </div>
      </div>

      {/* Hero header */}
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-800 py-10 text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-emerald-300 text-sm font-medium">
                <Sprout className="h-4 w-4" />
                Innovative Crop Planning · {plan.plan_year}
              </div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  {cropIcon}
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{plan.plan_name}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.color}`}>
                  {status.label}
                </span>
                {plan.ai_generated && (
                  <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                    <Sparkles className="h-3 w-3" />
                    AI Generated
                  </span>
                )}
                {plan.weed_pressure && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${WEED_PRESSURE_COLORS[plan.weed_pressure] ?? 'bg-slate-100 text-slate-600'}`}>
                    {plan.weed_pressure} pressure
                  </span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:text-right">
              {[
                { label: 'Acres', value: acresNum.toLocaleString() },
                { label: 'Passes', value: String(plan.passes.length) },
                { label: 'Cost/Acre', value: fmt(plan.cost_per_acre) },
                { label: 'Total Cost', value: fmt(plan.total_cost) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-white/10 px-3 py-2 text-center">
                  <p className="text-xs text-emerald-300">{label}</p>
                  <p className="font-extrabold text-white text-lg leading-tight">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">

        {/* Add All to Cart CTA */}
        {allProducts.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-emerald-900">Ready to order?</p>
                <p className="text-sm text-emerald-700">
                  {inStockCount} of {allProducts.length} product{allProducts.length !== 1 ? 's' : ''} in stock
                  {' '}· quantities calculated for {acresNum.toLocaleString()} acres
                </p>
              </div>
              <Button
                onClick={addAllToCart}
                size="lg"
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold hover:cursor-pointer"
              >
                {allAdded ? (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    Added to Cart!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    Add All to Cart
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Target weeds */}
        {plan.target_weeds && plan.target_weeds.length > 0 && (
          <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Target Weeds</p>
            <div className="flex flex-wrap gap-2">
              {plan.target_weeds.map((weed) => (
                <span
                  key={weed}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800"
                >
                  {weed}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Order-by deadline */}
        <OrderByDeadline planId={plan.id} variant="full" />

        {/* Carbon score */}
        <CarbonScoreWidget carbonScore={plan.carbon_score} acres={acresNum} />

        {/* Passes */}
        {plan.passes.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-white py-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-slate-700">No passes saved</p>
            <p className="mt-1 text-sm text-slate-500">This plan has no application passes yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Application Passes</h2>
            {plan.passes.map((pass) => {
              const cardColor = CATEGORY_COLORS[pass.category] ?? 'bg-slate-50 border-slate-200';
              const badgeColor = CATEGORY_BADGE[pass.category] ?? 'bg-slate-100 text-slate-700';
              const passInStockCount = pass.products.filter((p) => p.in_stock).length;
              return (
                <div key={pass.id} className={`rounded-2xl border-2 p-5 ${cardColor}`}>
                  {/* Pass header */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${badgeColor}`}>
                        {pass.category}
                      </span>
                      <h3 className="mt-1 font-bold text-slate-900 text-base">{pass.name}</h3>
                      {pass.timing_label && (
                        <p className="text-xs text-slate-500 mt-0.5">{pass.timing_label}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {pass.pass_cost && parseFloat(pass.pass_cost) > 0 && (
                        <div className="rounded-lg bg-white/80 px-3 py-1.5 text-right shadow-sm">
                          <p className="text-xs text-slate-500">Pass total</p>
                          <p className="font-bold text-slate-900">{fmt(pass.pass_cost)}</p>
                        </div>
                      )}
                      {pass.products.length > 1 && passInStockCount > 0 && (
                        <button
                          onClick={() => addPassToCart(pass)}
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:cursor-pointer transition-colors"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Add Pass to Cart
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Products */}
                  <div className="space-y-2">
                    {pass.products.map((product) => {
                      const priceChanged =
                        product.unit_cost &&
                        product.current_price &&
                        Math.abs(parseFloat(product.unit_cost) - parseFloat(product.current_price)) > 0.001;
                      const justAdded = addedIds.has(product.product_id);

                      return (
                        <div key={product.id} className="rounded-xl border border-border bg-white p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900 text-sm">{product.product_name}</p>
                                {product.is_recommended && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    Recommended
                                  </span>
                                )}
                                {!product.in_stock && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                                    Out of stock
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                                <span>{product.rate_per_acre} {product.rate_unit}/acre</span>
                                {product.unit_cost && (
                                  <span>
                                    {fmt(product.unit_cost)}/{product.unit_of_measure ?? 'unit'} at save
                                    {priceChanged && (
                                      <span className="ml-1 text-amber-600 font-medium">
                                        · now {fmt(product.current_price)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Action buttons */}
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                onClick={() => addProductToCart(product)}
                                disabled={!product.in_stock}
                                title={product.in_stock ? `Add ${product.units_needed ? Math.ceil(parseFloat(product.units_needed)) : 1} to cart` : 'Out of stock'}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors hover:cursor-pointer ${
                                  justAdded
                                    ? 'bg-emerald-600 text-white'
                                    : product.in_stock
                                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'border border-border bg-slate-50 text-slate-300 cursor-not-allowed'
                                }`}
                              >
                                {justAdded ? (
                                  <><Check className="h-3 w-3" /> Added</>
                                ) : (
                                  <><ShoppingCart className="h-3 w-3" /> Add</>
                                )}
                              </button>
                              <Link
                                href={`/shop/${product.product_id}`}
                                className="flex items-center gap-1 rounded-lg border border-border bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:cursor-pointer transition-colors"
                              >
                                Shop
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            </div>
                          </div>

                          {/* Cost breakdown grid */}
                          {(product.units_needed || product.line_total || product.cost_per_acre) && (
                            <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-border/50 bg-slate-50 p-2 text-center text-xs">
                              <div>
                                <p className="text-slate-400">Units needed</p>
                                <p className="font-bold text-slate-800">{fmtNum(product.units_needed)}</p>
                                <p className="text-slate-400">{product.unit_of_measure ?? 'units'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Line total</p>
                                <p className="font-bold text-slate-800">{fmt(product.line_total)}</p>
                                <p className="text-slate-400">for {acresNum.toLocaleString()} ac</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Cost/acre</p>
                                <p className="font-bold text-emerald-700">{fmt(product.cost_per_acre)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notes */}
        {plan.notes && (
          <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{plan.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/crop/dashboard"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to My Plans
            </Link>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClone}
                disabled={cloning}
                className="hover:cursor-pointer"
              >
                {cloning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="mr-1.5 h-4 w-4" />
                )}
                Clone Plan
              </Button>

              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">Delete this plan?</span>
                  <Button
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 text-white hover:cursor-pointer"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, Delete'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmDelete(false)}
                    className="hover:cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 hover:cursor-pointer"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
