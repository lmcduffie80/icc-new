'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useCartStore } from '@/lib/cart-store';
import { useTenant } from '@/components/tenant-provider';
import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';
import {
  ShoppingCart,
  Search,
  Lock,
  Tag,
  Loader2,
  CheckCircle2,
  Package,
} from 'lucide-react';

interface DistributorProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  retail_price: number;
  distributor_price: number;
  discount_percent: number | null;
  price_override: number | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  unit_of_measure: string | null;
}

export function DistributorPortalClient() {
  const { user, isPending: authPending } = useAuth();
  const router = useRouter();
  const tenant = useTenant();
  const addItem = useCartStore((state) => state.addItem);

  const [status, setStatus] = useState<'loading' | 'not-auth' | 'not-distributor' | 'ready'>('loading');
  const [products, setProducts] = useState<DistributorProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Step 1 — check distributor status once auth resolves
  useEffect(() => {
    if (authPending) return;
    if (!user) { setStatus('not-auth'); return; }

    fetch('/api/distributor/status')
      .then((r) => r.json())
      .then((data) => {
        if (!data.isDistributor) { setStatus('not-distributor'); return; }
        setStatus('ready');
      })
      .catch(() => setStatus('not-distributor'));
  }, [user, authPending]);

  // Step 2 — load products once access is confirmed
  useEffect(() => {
    if (status !== 'ready') return;
    setProductsLoading(true);
    fetch(`/api/distributor/products?tenant_id=${tenant.id}`)
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .finally(() => setProductsLoading(false));
  }, [status, tenant.id]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products]
  );

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
        const matchSearch =
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.category.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
      }),
    [products, search, selectedCategory]
  );

  const handleAddToCart = (product: DistributorProduct) => {
    const qty = quantities[product.id] ?? 1;
    addItem({
      id: product.id,
      name: product.name,
      price: product.distributor_price.toFixed(2), // cart stores price as string
      image: product.image ?? '',
      inStock: product.in_stock,
      approvedStates: undefined,
      unitOfMeasure: product.unit_of_measure ?? null,
      truckloadEligible: false,
      casesPerPallet: null,
      quantity: qty,
    });
    setAdded((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => setAdded((prev) => ({ ...prev, [product.id]: false })), 2000);
  };

  // ── Gate screens ────────────────────────────────────────────────────────────

  if (authPending || status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (status === 'not-auth') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
        <div className="rounded-full bg-slate-100 p-4">
          <Lock className="h-8 w-8 text-slate-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Sign in required</h2>
        <p className="text-slate-500 max-w-sm">
          The distributor portal is only available to authorized distributor accounts.
          Please sign in to continue.
        </p>
        <Button
          onClick={() => router.push('/auth/sign-in?redirect=/distributor')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Sign in
        </Button>
      </div>
    );
  }

  if (status === 'not-distributor') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
        <div className="rounded-full bg-amber-100 p-4">
          <Lock className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Distributor access required</h2>
        <p className="text-slate-500 max-w-sm">
          Your account doesn&apos;t have distributor access yet. Please contact us to apply
          for a distributor account.
        </p>
        <Button variant="outline" onClick={() => router.push('/contact')}>
          Contact Us
        </Button>
      </div>
    );
  }

  // ── Main portal ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="h-5 w-5 text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
            Distributor Portal
          </span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Distributor Pricing</h1>
        <p className="mt-2 text-slate-500">
          Exclusive pricing for authorized distributors. Prices shown include your distributor discount.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors hover:cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'All Products' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      {productsLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <Package className="h-10 w-10" />
          <p>No products found.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => {
            const savings = product.retail_price - product.distributor_price;
            const savingsPct = Math.round((savings / product.retail_price) * 100);
            const isAdded = added[product.id];
            const qty = quantities[product.id] ?? 1;

            return (
              <div
                key={product.id}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Image */}
                <div className="relative h-44 bg-slate-50">
                  <ProductImage
                    src={product.image}
                    alt={product.name}
                    className="h-full w-full object-contain p-4"
                  />
                  {savings > 0 && (
                    <div className="absolute top-2 right-2">
                      <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                        Save {savingsPct}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col flex-1 p-4 gap-3">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                      {product.category}
                    </p>
                    <h3 className="font-semibold text-slate-900 leading-tight line-clamp-2">
                      {product.name}
                    </h3>
                  </div>

                  {/* Pricing */}
                  <div className="flex items-end gap-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Your price</p>
                      <p className="text-xl font-bold text-emerald-700">
                        {formatPrice(product.distributor_price)}
                        {product.unit_of_measure && (
                          <span className="text-xs font-normal text-slate-400 ml-1">
                            / {product.unit_of_measure}
                          </span>
                        )}
                      </p>
                    </div>
                    {savings > 0 && (
                      <div className="pb-0.5">
                        <p className="text-xs text-slate-400 line-through">
                          {formatPrice(product.retail_price)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quantity + Add to Cart */}
                  <div className="flex items-center gap-2 mt-auto">
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [product.id]: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-16 rounded-md border border-slate-300 px-1 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <Button
                      className={`flex-1 text-sm transition-colors ${
                        isAdded
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                      onClick={() => handleAddToCart(product)}
                      disabled={!product.in_stock || isAdded}
                    >
                      {isAdded ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Added
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="h-4 w-4 mr-1" />
                          {product.in_stock ? 'Add to Cart' : 'Out of Stock'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
