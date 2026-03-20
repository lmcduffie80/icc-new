'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles, Sun, Sprout, Wheat, Leaf,
  Download, Loader2, ChevronRight, ChevronDown,
  Search, ChevronUp, ChevronsUpDown,
  ChevronLeft, ChevronRight as ChevronRightPag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ForecastPlan } from './page';
import type { PassWithProducts } from '@/app/api/admin/forecasts/[planId]/products/route';

interface ForecastsTableProps {
  plans: ForecastPlan[];
}

const CROP_ICONS: Record<string, React.ReactNode> = {
  corn: <Sun className="h-3.5 w-3.5 text-yellow-500" />,
  soybeans: <Sprout className="h-3.5 w-3.5 text-green-600" />,
  wheat: <Wheat className="h-3.5 w-3.5 text-amber-600" />,
  cotton: <Leaf className="h-3.5 w-3.5 text-sky-500" />,
};

const CROP_COLORS: Record<string, string> = {
  corn: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  soybeans: 'bg-green-50 text-green-800 border-green-200',
  wheat: 'bg-amber-50 text-amber-800 border-amber-200',
  cotton: 'bg-sky-50 text-sky-800 border-sky-200',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  saved: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-gray-100 text-gray-500',
};

const PRESSURE_COLORS: Record<string, string> = {
  light: 'bg-green-100 text-green-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  heavy: 'bg-red-100 text-red-700',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Pre-Emergent': 'bg-blue-50 text-blue-700 border-blue-200',
  'Post-Emerge': 'bg-green-50 text-green-700 border-green-200',
  'In-Season': 'bg-amber-50 text-amber-700 border-amber-200',
  'Adjuvants': 'bg-purple-50 text-purple-700 border-purple-200',
};

function fmt(n: string | null): string {
  if (!n) return '—';
  return `$${parseFloat(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const PAGE_SIZE = 25;

type SortDir = 'asc' | 'desc';

export function ForecastsTable({ plans }: ForecastsTableProps) {
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof ForecastPlan | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  // Expand state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [productCache, setProductCache] = useState<Record<number, PassWithProducts[]>>({});

  async function toggleExpand(plan: ForecastPlan) {
    if (expandedId === plan.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(plan.id);
    if (productCache[plan.id]) return; // already loaded
    setLoadingId(plan.id);
    try {
      const res = await fetch(`/api/admin/forecasts/${plan.id}/products`);
      const data = await res.json();
      setProductCache((prev) => ({ ...prev, [plan.id]: data.passes ?? [] }));
    } finally {
      setLoadingId(null);
    }
  }

  async function exportProducts() {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/forecasts/export');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `crop-plan-products-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function handleSort(key: keyof ForecastPlan) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    if (!search) return plans;
    const q = search.toLowerCase();
    return plans.filter(
      (p) =>
        p.plan_name.toLowerCase().includes(q) ||
        p.farmer_name.toLowerCase().includes(q) ||
        p.farmer_email.toLowerCase().includes(q) ||
        p.crop.toLowerCase().includes(q)
    );
  }, [plans, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function SortIcon({ col }: { col: keyof ForecastPlan }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5" />
      : <ChevronDown className="h-3.5 w-3.5" />;
  }

  function SortTh({ col, label, className = '' }: { col: keyof ForecastPlan; label: string; className?: string }) {
    return (
      <th className={`px-4 py-3 text-left text-sm font-medium text-slate-600 ${className}`}>
        <button
          onClick={() => { handleSort(col); setPage(1); }}
          className="flex items-center gap-1 hover:text-slate-900"
        >
          {label}
          <SortIcon col={col} />
        </button>
      </th>
    );
  }

  // Total column count: expand toggle + 13 data columns
  const TOTAL_COLS = 14;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by farmer, plan, or crop…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <Button
          onClick={exportProducts}
          disabled={exporting || plans.length === 0}
          variant="outline"
          size="sm"
          className="hover:cursor-pointer shrink-0"
        >
          {exporting
            ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Exporting…</>
            : <><Download className="mr-1.5 h-4 w-4" /> Export Products CSV</>
          }
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {/* Expand toggle column */}
                <th className="w-10 px-3 py-3" />
                <SortTh col="farmer_name" label="Farmer" />
                <SortTh col="plan_name" label="Plan Name" />
                <SortTh col="crop" label="Crop" />
                <SortTh col="plan_year" label="Year" />
                <SortTh col="total_acres" label="Acres" />
                <SortTh col="pass_count" label="Passes" />
                <SortTh col="order_by_date" label="Need By" />
                <SortTh col="total_cost" label="Total Cost" />
                <SortTh col="cost_per_acre" label="Cost / Acre" />
                <SortTh col="weed_pressure" label="Pressure" />
                <SortTh col="status" label="Status" />
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">AI</th>
                <SortTh col="created_at" label="Created" />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLS} className="px-4 py-8 text-center text-sm text-slate-500">
                    No crop plans found.
                  </td>
                </tr>
              ) : (
                paginated.map((plan) => {
                  const isExpanded = expandedId === plan.id;
                  const isLoading = loadingId === plan.id;
                  const passes = productCache[plan.id];
                  const cropColor = CROP_COLORS[plan.crop] ?? 'bg-slate-100 text-slate-700 border-slate-200';
                  const cropIcon = CROP_ICONS[plan.crop];

                  return (
                    <React.Fragment key={plan.id}>
                      <tr
                        className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isExpanded ? 'bg-slate-50' : ''}`}
                      >
                        {/* Expand toggle */}
                        <td className="w-10 px-3 py-3 text-center">
                          <button
                            onClick={() => toggleExpand(plan)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 hover:cursor-pointer"
                            aria-label={isExpanded ? 'Collapse' : 'Expand products'}
                          >
                            {isLoading
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : isExpanded
                                ? <ChevronDown className="h-4 w-4" />
                                : <ChevronRight className="h-4 w-4" />
                            }
                          </button>
                        </td>

                        <td className="px-4 py-3 text-sm">
                          <p className="font-medium text-slate-900">{plan.farmer_name}</p>
                          <p className="text-xs text-slate-500">{plan.farmer_email}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{plan.plan_name}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cropColor}`}>
                            {cropIcon}
                            {plan.crop}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700">{plan.plan_year}</td>
                        <td className="px-4 py-3 text-sm">{parseFloat(plan.total_acres).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{plan.pass_count}</td>
                        <td className="px-4 py-3 text-sm">
                          {plan.order_by_date && plan.urgency ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-700 text-xs font-medium">
                                {new Date(plan.order_by_date + 'T00:00:00').toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                })}
                              </span>
                              {plan.urgency === 'asap' && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 w-fit">
                                  Order Now
                                </span>
                              )}
                              {plan.urgency === 'soon' && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 w-fit">
                                  Soon
                                </span>
                              )}
                              {plan.urgency === 'ahead' && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 w-fit">
                                  On Track
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{fmt(plan.total_cost)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{fmt(plan.cost_per_acre)}</td>
                        <td className="px-4 py-3 text-sm">
                          {plan.weed_pressure ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRESSURE_COLORS[plan.weed_pressure] ?? 'bg-slate-100 text-slate-600'}`}>
                              {plan.weed_pressure}
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[plan.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {plan.ai_generated && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                              <Sparkles className="h-3 w-3" />
                              AI
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {new Date(plan.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </td>
                      </tr>

                      {/* Expanded product sub-table */}
                      {isExpanded && (
                        <tr key={`${plan.id}-products`} className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={TOTAL_COLS} className="px-6 pb-4 pt-0">
                            {!passes ? (
                              <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
                              </div>
                            ) : passes.length === 0 ? (
                              <p className="py-3 text-sm text-slate-400">No passes or products in this plan.</p>
                            ) : (
                              <div className="mt-2 space-y-3">
                                {passes.map((pass) => {
                                  const catColor = CATEGORY_COLORS[pass.category] ?? 'bg-slate-50 text-slate-700 border-slate-200';
                                  return (
                                    <div key={pass.pass_id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                      {/* Pass header */}
                                      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${catColor}`}>
                                          {pass.category}
                                        </span>
                                        <span className="font-semibold text-slate-800 text-sm">{pass.pass_name}</span>
                                        {pass.timing_label && (
                                          <span className="text-xs text-slate-500">· {pass.timing_label}</span>
                                        )}
                                      </div>

                                      {pass.products.length === 0 ? (
                                        <p className="px-4 py-2 text-xs text-slate-400">No products in this pass.</p>
                                      ) : (
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50">
                                              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Product</th>
                                              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Rate / Acre</th>
                                              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Units Needed</th>
                                              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Unit Cost</th>
                                              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Line Total</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {pass.products.map((product, i) => (
                                              <tr key={i} className="border-b border-slate-50 last:border-0">
                                                <td className="px-4 py-2 text-slate-800">
                                                  <span className="font-medium">{product.product_name}</span>
                                                  {product.is_recommended && (
                                                    <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                                                      Rec
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-600">
                                                  {product.rate_per_acre
                                                    ? `${parseFloat(product.rate_per_acre).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${product.rate_unit ?? ''}`
                                                    : '—'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-600">
                                                  {product.units_needed
                                                    ? parseFloat(product.units_needed).toLocaleString('en-US', { maximumFractionDigits: 2 })
                                                    : '—'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-600">{fmt(product.unit_cost)}</td>
                                                <td className="px-4 py-2 text-right font-semibold text-slate-800">{fmt(product.line_total)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronRightPag className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
