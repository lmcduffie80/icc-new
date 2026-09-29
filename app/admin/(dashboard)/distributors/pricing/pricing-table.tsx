'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';

interface PricingRow {
  id: string | null;
  product_id: string;
  product_name: string;
  retail_price: number;
  price_override: number | null;
  discount_percent: number | null;
  effective_price: number | null;
  notes: string | null;
  updated_at: string | null;
}

interface EditState {
  mode: 'flat' | 'percent';
  value: string;
  notes: string;
}

interface PricingTableProps {
  tenantId: string;
}

export function PricingTable({ tenantId }: PricingTableProps) {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // product_id being edited
  const [editState, setEditState] = useState<EditState>({ mode: 'flat', value: '', notes: '' });
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPricedOnly, setShowPricedOnly] = useState(false);

  const fetchPricing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/distributor-pricing?tenant_id=${tenantId}`);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);

  const filtered = rows.filter((r) => {
    const matchesSearch = !search || r.product_name.toLowerCase().includes(search.toLowerCase());
    const matchesPriced = !showPricedOnly || r.effective_price !== null;
    return matchesSearch && matchesPriced;
  });

  const startEdit = (row: PricingRow) => {
    setEditing(row.product_id);
    if (row.price_override != null) {
      setEditState({ mode: 'flat', value: row.price_override.toFixed(2), notes: row.notes ?? '' });
    } else if (row.discount_percent != null) {
      setEditState({ mode: 'percent', value: row.discount_percent.toFixed(2), notes: row.notes ?? '' });
    } else {
      setEditState({ mode: 'flat', value: '', notes: '' });
    }
  };

  const cancelEdit = () => { setEditing(null); };

  const saveEdit = async (productId: string) => {
    const numVal = parseFloat(editState.value);
    if (isNaN(numVal) || numVal < 0) return;

    setSaving(productId);
    try {
      const body = {
        tenant_id: tenantId,
        product_id: productId,
        price_override: editState.mode === 'flat' ? numVal : null,
        discount_percent: editState.mode === 'percent' ? numVal : null,
        notes: editState.notes || null,
      };
      const res = await fetch('/api/admin/distributor-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchPricing();
        setEditing(null);
      }
    } finally {
      setSaving(null);
    }
  };

  const deletePricing = async (row: PricingRow) => {
    if (!row.id) return;
    if (!confirm(`Remove distributor pricing for "${row.product_name}"?`)) return;
    setDeleting(row.product_id);
    try {
      await fetch(`/api/admin/distributor-pricing/${row.id}`, { method: 'DELETE' });
      await fetchPricing();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showPricedOnly}
            onChange={(e) => setShowPricedOnly(e.target.checked)}
            className="rounded"
          />
          Show priced products only
        </label>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Retail Price</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Distributor Price</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Discount</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Notes</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.product_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-xs">
                    {row.product_name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {formatPrice(row.retail_price)}
                  </td>

                  {/* Editing row */}
                  {editing === row.product_id ? (
                    <>
                      <td className="px-4 py-2 text-right" colSpan={3}>
                        <div className="flex flex-col gap-2 items-end">
                          <div className="flex items-center gap-2">
                            <select
                              value={editState.mode}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  mode: e.target.value as 'flat' | 'percent',
                                  value: '',
                                }))
                              }
                              className="rounded border border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="flat">Flat price ($)</option>
                              <option value="percent">Discount (%)</option>
                            </select>
                            <input
                              type="number"
                              min={0}
                              step={editState.mode === 'flat' ? '0.01' : '0.1'}
                              max={editState.mode === 'percent' ? 100 : undefined}
                              value={editState.value}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setEditState((s) => ({ ...s, value: e.target.value }))
                              }
                              placeholder={editState.mode === 'flat' ? '0.00' : '0.0'}
                              className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <input
                            type="text"
                            placeholder="Internal notes (optional)"
                            value={editState.notes}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setEditState((s) => ({ ...s, notes: e.target.value }))
                            }
                            className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(row.product_id)}
                            disabled={saving === row.product_id || !editState.value}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {saving === row.product_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.effective_price != null ? (
                          <span className="font-semibold text-emerald-700">
                            {formatPrice(row.effective_price)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">retail</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {row.price_override != null
                          ? 'Flat override'
                          : row.discount_percent != null
                          ? `${row.discount_percent}% off`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                        {row.notes ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(row)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 hover:cursor-pointer"
                            title="Edit pricing"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {row.id && (
                            <button
                              onClick={() => deletePricing(row)}
                              disabled={deleting === row.product_id}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 hover:cursor-pointer disabled:opacity-50"
                              title="Remove distributor pricing"
                            >
                              {deleting === row.product_id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        {filtered.filter((r) => r.effective_price !== null).length} of {filtered.length} products have
        distributor pricing. Products without pricing show at retail price in the distributor portal.
      </p>
    </div>
  );
}
