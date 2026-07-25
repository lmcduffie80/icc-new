'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Layers, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { ProductImage } from '@/components/product-image';
import type { Product } from '@/lib/products';
import { formatPrice } from '@/lib/utils';
import { useTenant } from '@/components/tenant-provider';

function ShopContent() {
  const tenant = useTenant();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category') || 'all';

  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [sortBy, setSortBy] = useState('featured');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update category when URL changes
  useEffect(() => {
    setSelectedCategory(categoryParam);
  }, [categoryParam]);

  // Fetch categories from API
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch(`/api/categories?tenant_id=${tenant.id}`);
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch {
        // Keep empty categories on error
      }
    }
    fetchCategories();
  }, [tenant.id]);

  // Fetch products from API
  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        const response = await fetch(`/api/products?tenant_id=${tenant.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch products');
        }
        const data = await response.json();
        // Map database fields to component expected format
        const mappedProducts: Product[] = data.map((p: {
          id: string;
          name: string;
          category: string;
          description: string | null;
          price: string;
          msrp: string | null;
          unit_of_measure: string | null;
          image: string | null;
          in_stock: boolean;
          attributes?: {
            containerSizes?: string;
          } | null;
        }) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description || '',
          price: p.price,
          originalPrice: p.msrp || undefined,
          unitOfMeasure: p.unit_of_measure,
          image: p.image || '',
          inStock: p.in_stock,
          attributes: p.attributes || null,
        }));
        setProducts(mappedProducts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [tenant.id]);

  // Function to clear all filters
  const clearFilters = () => {
    setSelectedCategory('all');
    setSortBy('featured');
  };

  // Check if any filters are active
  const hasActiveFilters = selectedCategory !== 'all' || sortBy !== 'featured';

  // Filter and sort products based on selected options
  const filteredAndSortedProducts = useMemo(() => {
    // Filter by category
    const filtered = selectedCategory === 'all' 
      ? products 
      : products.filter(p => p.category.toLowerCase() === selectedCategory.toLowerCase());

    // Sort products
    const sorted = [...filtered];
    switch (sortBy) {
      case 'price-low':
        sorted.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        break;
      case 'price-high':
        sorted.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        break;
      case 'newest':
        // Reverse the order for newest (assuming current order is oldest first)
        sorted.reverse();
        break;
      case 'featured':
      default:
        // Keep original order for featured
        break;
    }

    return sorted;
  }, [selectedCategory, sortBy, products]);

  if (loading) {
    return (
      <div className="flex flex-col">
        <section className="relative flex items-center justify-center overflow-hidden bg-muted/20 py-16">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="mb-4">Shop Our Products</h1>
            <p className="text-muted-foreground">Loading products...</p>
          </div>
        </section>
        <section className="py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <Card key={i} className="overflow-hidden p-0">
                  <div className="aspect-square bg-muted animate-pulse" />
                  <CardContent className="p-4">
                    <div className="h-4 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-6 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <section className="relative flex items-center justify-center overflow-hidden bg-muted/20 py-16">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="mb-4">Shop Our Products</h1>
            <p className="text-red-600">Error: {error}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative flex items-center justify-center overflow-hidden bg-muted/20 py-16">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-4">Shop Our Products</h1>
          <p className="text-muted-foreground">
            Premium agricultural products vetted by experts and backed by manufacturer warranties
          </p>
        </div>
      </section>

      {/* AcrePack CTA Banner */}
      <section className="border-b border-emerald-200 bg-gradient-to-r from-emerald-900 to-green-800 py-5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700/60">
                <Layers className="h-5 w-5 text-emerald-200" />
              </div>
              <div>
                <p className="font-semibold text-white">Innovative Crop Planning</p>
                <p className="text-sm text-emerald-200">
                  Build a complete crop input plan — enter your acreage and get exact quantities with cost per acre.
                </p>
              </div>
            </div>
            <Button
              asChild
              variant="secondary"
              className="shrink-0 bg-white text-emerald-900 hover:bg-emerald-50 hover:cursor-pointer"
            >
              <Link href="/crop">
                Build Your Plan
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Filters Section */}
      <section className="border-b border-border/40 bg-background py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="category" className="text-sm font-medium">
                Category:
              </label>
              <select
                id="category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Products</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat.toLowerCase()}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm font-medium">
                Sort by:
              </label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="newest">Newest</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-primary hover:underline font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {filteredAndSortedProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No products found matching your criteria.</p>
              <Button className="mt-4" variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredAndSortedProducts.map((product) => (
                <Card key={product.id} className="group overflow-hidden transition-all hover:shadow-lg p-0">
                  <Link href={`/shop/${product.id}`}>
                    <div className="relative aspect-square overflow-hidden bg-white dark:bg-slate-50">
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        className="object-contain transition-transform group-hover:scale-105"
                      />
                    </div>
                    <CardContent className="p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs text-primary uppercase tracking-wide">
                          {product.category}
                        </span>
                        {product.unitOfMeasure && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                            {product.unitOfMeasure}
                          </span>
                        )}
                      </div>
                      <h3 className="mb-2 font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                      <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                        {product.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div>
                          <PriceWithUnit
                            price={product.price}
                            unitOfMeasure={product.unitOfMeasure}
                            containerSize={product.attributes?.containerSizes}
                            priceClassName="text-lg font-bold"
                            showCostPerGallon={true}
                          />
                          {product.originalPrice && (
                            <span className="ml-2 text-sm text-muted-foreground line-through">
                              {formatPrice(product.originalPrice)}
                            </span>
                          )}
                        </div>
                        {product.inStock ? (
                          <span className="text-xs text-primary font-medium">In Stock</span>
                        ) : (
                          <span className="text-xs text-red-600 font-medium">Out of Stock</span>
                        )}
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/40 bg-muted/20 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4">Need Expert Advice?</h2>
          <p className="mb-8 text-muted-foreground">
            Our agronomists are here to help you choose the right products for your farm
          </p>
          <Button size="lg" asChild>
            <Link href="/contact">Contact Us</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col">
        <section className="relative flex items-center justify-center overflow-hidden bg-muted/20 py-16">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="mb-4">Shop Our Products</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </section>
      </div>
    }>
      <ShopContent />
    </Suspense>
  );
}
