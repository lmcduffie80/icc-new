'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Search, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';

interface BOMProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number;
  inventory_count: number;
  in_stock: boolean;
  unit_of_measure: string | null;
  supplier_name: string | null;
}

export function BillOfMaterialsClient() {
  const [products, setProducts] = useState<BOMProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [editingSkuValue, setEditingSkuValue] = useState('');
  const [skuSaving, setSkuSaving] = useState(false);
  const [skuError, setSkuError] = useState<string | null>(null);
  const skuInputRef = useRef<HTMLInputElement>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/admin/reports/bill-of-materials');
        if (!response.ok) throw new Error('Failed to fetch bill of materials');
        const data = await response.json();
        setProducts(data.products);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (editingSkuId && skuInputRef.current) {
      skuInputRef.current.focus();
      skuInputRef.current.select();
    }
  }, [editingSkuId]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchesSearch =
        !q ||
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.supplier_name?.toLowerCase().includes(q);
      const matchesCategory = !categoryFilter || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const exportCSV = () => {
    const headers = ['Item Code', 'Description', 'Category', 'Supplier', 'Unit Price', 'UOM', 'Inventory', 'Stock Status'];
    const rows = filtered.map(p => [
      p.sku || '',
      p.name || '',
      p.category || '',
      p.supplier_name || '',
      p.price?.toFixed(2) ?? '0.00',
      p.unit_of_measure || '',
      String(p.inventory_count ?? 0),
      p.in_stock ? 'In Stock' : 'Out of Stock',
    ]);

    const csv = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bill-of-materials-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const startEditSku = (product: BOMProduct) => {
    setEditingSkuId(product.id);
    setEditingSkuValue(product.sku || '');
    setSkuError(null);
  };

  const cancelEditSku = () => {
    setEditingSkuId(null);
    setEditingSkuValue('');
    setSkuError(null);
  };

  const saveSku = async (productId: string) => {
    const trimmed = editingSkuValue.trim();
    if (!trimmed) {
      setSkuError('SKU cannot be empty');
      return;
    }

    const product = products.find(p => p.id === productId);
    if (product && product.sku === trimmed) {
      cancelEditSku();
      return;
    }

    setSkuSaving(true);
    setSkuError(null);

    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json();
        setSkuError(data.error || 'Failed to update SKU');
        return;
      }

      setProducts(prev =>
        prev.map(p => (p.id === productId ? { ...p, sku: trimmed } : p))
      );
      setEditingSkuId(null);
      setEditingSkuValue('');
    } catch {
      setSkuError('Network error');
    } finally {
      setSkuSaving(false);
    }
  };

  const handleSkuKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSku(productId);
    } else if (e.key === 'Escape') {
      cancelEditSku();
    }
  };

  const handleDelete = async (product: BOMProduct) => {
    const confirmed = window.confirm(
      `Permanently delete "${product.name}" (${product.sku})?\n\nThis action cannot be undone. All related inventory transactions will also be removed.`
    );
    if (!confirmed) return;

    setDeletingId(product.id);

    try {
      const response = await fetch(`/api/admin/products/${product.id}/hard-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to delete product');
        return;
      }

      setProducts(prev => prev.filter(p => p.id !== product.id));
    } catch {
      alert('Network error while deleting product');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bill of Materials</h1>
          <p className="text-slate-600 mt-1">
            Complete product catalog with item codes and descriptions
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label htmlFor="bom-search" className="block text-sm font-medium text-slate-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="bom-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by item code, description, or supplier..."
                className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bom-category" className="block text-sm font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              id="bom-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Total Items</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">In Stock</p>
          <p className="text-2xl font-bold text-emerald-600">
            {filtered.filter(p => p.in_stock).length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Out of Stock</p>
          <p className="text-2xl font-bold text-red-600">
            {filtered.filter(p => !p.in_stock).length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <p className="text-sm text-slate-600">
            Showing {filtered.length} of {products.length} items
          </p>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-red-600">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500">No items found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Item Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    UOM
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Inventory
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {editingSkuId === product.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={skuInputRef}
                            type="text"
                            value={editingSkuValue}
                            onChange={(e) => {
                              setEditingSkuValue(e.target.value);
                              setSkuError(null);
                            }}
                            onKeyDown={(e) => handleSkuKeyDown(e, product.id)}
                            disabled={skuSaving}
                            className={`w-28 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${
                              skuError
                                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500'
                            }`}
                          />
                          {skuSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : (
                            <>
                              <button
                                onClick={() => saveSku(product.id)}
                                className="p-0.5 text-emerald-600 hover:text-emerald-800 hover:cursor-pointer"
                                title="Save"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={cancelEditSku}
                                className="p-0.5 text-slate-400 hover:text-slate-600 hover:cursor-pointer"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {skuError && (
                            <span className="text-xs text-red-500 ml-1">{skuError}</span>
                          )}
                        </div>
                      ) : (
                        <div className="group flex items-center gap-1">
                          <span>{product.sku}</span>
                          <button
                            onClick={() => startEditSku(product)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-emerald-600 hover:cursor-pointer transition-opacity"
                            title="Edit item code"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {product.category || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {product.supplier_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {product.unit_of_measure || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900">
                      {product.inventory_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          product.in_stock
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {product.in_stock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleDelete(product)}
                        disabled={deletingId === product.id}
                        className="inline-flex items-center p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Delete product permanently"
                      >
                        {deletingId === product.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
