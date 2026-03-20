'use client';

import { useEffect, useState, startTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCompareStore } from '@/lib/compare-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { useCartStore } from '@/lib/cart-store';
import { formatPrice, formatAvailabilityDate } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';
import { Loader2 } from 'lucide-react';

// Helper function to get document proxy URL (same as image proxy)
const getDocumentUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  // Use proxy for S3 URLs to avoid access denied errors
  if (url.includes('s3.amazonaws.com') || url.includes('.s3.')) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// Product type from API
type Product = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  full_description: string | null;
  price: string;
  original_price: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  sku: string | null;
  rating: string | null;
  review_count: number;
  attributes: Record<string, string>;
  approved_states: string[];
  features: string[];
  specifications: Record<string, string>;
  documents: Array<{ name: string; url: string }>;
  truckload_eligible: boolean;
  gallons_per_case: number | null;
  cases_per_pallet: number | null;
  bulk_density_lbs_per_gallon: number | null;
};

// Star Rating Component
function StarRating({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`h-4 w-4 ${
              star <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-300'
            }`}
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {rating.toFixed(1)} ({reviewCount})
      </span>
    </div>
  );
}

export default function ComparePage() {
  const compareProducts = useCompareStore((state) => state.products);
  const removeProduct = useCompareStore((state) => state.removeProduct);
  const clearCompare = useCompareStore((state) => state.clearCompare);
  const addItem = useCartStore((state) => state.addItem);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    startTransition(() => {
      setMounted(true);
    });
  }, []);

  // Fetch product details when compare products change
  useEffect(() => {
    if (!mounted) return;

    const fetchProducts = async () => {
      if (compareProducts.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch each product's details
        const productPromises = compareProducts.map(async (cp) => {
          const response = await fetch(`/api/products/${cp.id}`);
          if (response.ok) {
            return response.json();
          }
          return null;
        });

        const fetchedProducts = await Promise.all(productPromises);
        setProducts(fetchedProducts.filter((p): p is Product => p !== null));
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [mounted, compareProducts]);

  if (!mounted) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col min-h-[60vh]">
        <section className="py-12 flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Loading products...</span>
          </div>
        </section>
      </div>
    );
  }

  // Empty state
  if (products.length === 0) {
    return (
      <div className="flex flex-col min-h-[60vh]">
        <section className="py-12 flex-1 flex items-center justify-center">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="mb-6">
              <svg
                className="mx-auto h-24 w-24 text-muted-foreground/50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h1 className="mb-4">No Products to Compare</h1>
            <p className="text-muted-foreground mb-8">
              Start comparing products by clicking &quot;Add to Compare&quot; on any product detail page.
            </p>
            <Button size="lg" asChild>
              <Link href="/shop">Browse Products</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  // Get all unique specification keys across all products
  const allSpecKeys = Array.from(
    new Set(products.flatMap((p) => Object.keys(p.specifications || {})))
  );

  // Get max number of features across all products
  const maxFeatures = Math.max(...products.map((p) => (p.features || []).length));

  // Get max number of documents across all products
  const maxDocuments = Math.max(...products.map((p) => (p.documents || []).length));

  const handleAddToCart = (product: Product) => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || '',
      inStock: product.in_stock,
      unitOfMeasure: product.unit_of_measure,
      truckloadEligible: product.truckload_eligible,
      casesPerPallet: product.cases_per_pallet,
      bulkDensityLbsPerGallon: product.bulk_density_lbs_per_gallon,
      gallonsPerCase: product.gallons_per_case,
      quantity: 1,
    });
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <section className="border-b border-border/40 bg-muted/20 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="mb-2">Product Comparison</h1>
              <p className="text-muted-foreground">
                Comparing {products.length} product{products.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href="/shop">Browse Products</Link>
              </Button>
              {products.length > 0 && (
                <Button variant="destructive" onClick={clearCompare}>
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                {/* Product Images and Names */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 w-48 align-top sticky left-0 z-10">
                    Product
                  </td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4 align-top min-w-[280px]">
                      <Card>
                        <CardContent className="p-4">
                          <div className="mb-3 relative w-full h-48 bg-muted rounded-lg overflow-hidden">
                            {product.image ? (
                              <Image
                                src={getImageProxyUrl(product.image) || product.image || '/placeholder.png'}
                                alt={product.name}
                                fill
                                className="object-cover"
                                unoptimized={product.image?.includes('s3.amazonaws.com') || product.image?.includes('.s3.')}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                No image
                              </div>
                            )}
                          </div>
                          <h3 className="text-lg font-semibold mb-2">{product.name}</h3>
                          <div className="text-sm text-primary uppercase tracking-wide font-medium mb-2">
                            {product.category}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeProduct(product.id)}
                          >
                            Remove from Compare
                          </Button>
                        </CardContent>
                      </Card>
                    </td>
                  ))}
                </tr>

                {/* Price */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">Price</td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4">
                      <div className="flex items-baseline gap-2">
                        <PriceWithUnit
                          price={product.price}
                          unitOfMeasure={product.unit_of_measure}
                          containerSize={product.attributes?.containerSizes}
                          priceClassName="text-2xl font-bold"
                          showCostPerGallon={true}
                        />
                        {product.original_price && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatPrice(product.original_price)}
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Rating */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">Rating</td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4">
                      <StarRating
                        rating={parseFloat(product.rating || '0')}
                        reviewCount={product.review_count || 0}
                      />
                    </td>
                  ))}
                </tr>

                {/* Stock Status */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">Availability</td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4">
                      {product.in_stock ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          In Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Out of Stock
                        </span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* SKU */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">SKU</td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4 text-sm text-muted-foreground">
                      {product.sku || '—'}
                    </td>
                  ))}
                </tr>

                {/* Description */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10 align-top">
                    Description
                  </td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {product.full_description || product.description || '—'}
                      </p>
                    </td>
                  ))}
                </tr>

                {/* Attributes Section Header */}
                {products.some(p => p.attributes && Object.keys(p.attributes).length > 0) && (
                  <>
                    <tr className="bg-muted/40">
                      <td colSpan={products.length + 1} className="p-4">
                        <h2 className="text-xl font-semibold">Product Attributes</h2>
                      </td>
                    </tr>

                    {/* Active Ingredients */}
                    <tr className="border-b border-border">
                      <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">
                        Active Ingredients
                      </td>
                      {products.map((product) => (
                        <td key={product.id} className="p-4 text-sm">
                          {product.attributes?.activeIngredients || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* EPA Signal Word */}
                    <tr className="border-b border-border">
                      <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">EPA Signal Word</td>
                      {products.map((product) => (
                        <td key={product.id} className="p-4 text-sm">
                          {product.attributes?.epaSignalWord || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* EPA Registration Number */}
                    <tr className="border-b border-border">
                      <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">
                        EPA Registration Number
                      </td>
                      {products.map((product) => (
                        <td key={product.id} className="p-4 text-sm">
                          {product.attributes?.epaRegistrationNumber || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* Application Rate Range */}
                    <tr className="border-b border-border">
                      <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">
                        Application Rate Range
                      </td>
                      {products.map((product) => (
                        <td key={product.id} className="p-4 text-sm">
                          {product.attributes?.applicationRateRange || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* Container Sizes */}
                    <tr className="border-b border-border">
                      <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">Container Sizes</td>
                      {products.map((product) => (
                        <td key={product.id} className="p-4 text-sm">
                          {product.attributes?.containerSizes || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* Availability Date */}
                    <tr className="border-b border-border">
                      <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">
                        Product Availability Date
                      </td>
                      {products.map((product) => (
                        <td key={product.id} className="p-4 text-sm">
                          {formatAvailabilityDate(product.attributes?.availabilityDate)}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* Approved States */}
                {products.some(p => p.approved_states && p.approved_states.length > 0) && (
                  <tr className="border-b border-border">
                    <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">Approved States</td>
                    {products.map((product) => (
                      <td key={product.id} className="p-4 text-sm">
                        {product.approved_states && product.approved_states.length > 0 ? (
                          <>
                            {product.approved_states.length} states
                            <div className="text-xs text-muted-foreground mt-1">
                              {product.approved_states.join(', ')}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                )}

                {/* Features Section Header */}
                {maxFeatures > 0 && (
                  <>
                    <tr className="bg-muted/40">
                      <td colSpan={products.length + 1} className="p-4">
                        <h2 className="text-xl font-semibold">Key Features</h2>
                      </td>
                    </tr>

                    {/* Features */}
                    {Array.from({ length: maxFeatures }).map((_, index) => (
                      <tr key={`feature-${index}`} className="border-b border-border">
                        <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">
                          Feature {index + 1}
                        </td>
                        {products.map((product) => (
                          <td key={product.id} className="p-4 text-sm">
                            {product.features && product.features[index] ? (
                              <div className="flex items-start gap-2">
                                <svg
                                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span>{product.features[index]}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}

                {/* Specifications Section Header */}
                {allSpecKeys.length > 0 && (
                  <>
                    <tr className="bg-muted/40">
                      <td colSpan={products.length + 1} className="p-4">
                        <h2 className="text-xl font-semibold">Specifications</h2>
                      </td>
                    </tr>

                    {/* Specifications */}
                    {allSpecKeys.map((specKey) => (
                      <tr key={specKey} className="border-b border-border">
                        <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">{specKey}</td>
                        {products.map((product) => (
                          <td key={product.id} className="p-4 text-sm">
                            {product.specifications?.[specKey] || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}

                {/* Documents Section Header */}
                {maxDocuments > 0 && (
                  <>
                    <tr className="bg-muted/40">
                      <td colSpan={products.length + 1} className="p-4">
                        <h2 className="text-xl font-semibold">Product Documents</h2>
                      </td>
                    </tr>

                    {/* Documents */}
                    {Array.from({ length: maxDocuments }).map((_, index) => (
                      <tr key={`doc-${index}`} className="border-b border-border">
                        <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">
                          Document {index + 1}
                        </td>
                        {products.map((product) => (
                          <td key={product.id} className="p-4">
                            {product.documents && product.documents[index] ? (
                              <a
                                href={getDocumentUrl(product.documents[index].url) || product.documents[index].url}
                                className="text-sm text-primary hover:underline flex items-center gap-2"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                                </svg>
                                {product.documents[index].name}
                              </a>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}

                {/* Add to Cart Actions */}
                <tr className="border-b border-border">
                  <td className="p-4 font-semibold bg-muted/20 sticky left-0 z-10">Actions</td>
                  {products.map((product) => (
                    <td key={product.id} className="p-4">
                      <div className="space-y-2">
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={!product.in_stock}
                          onClick={() => handleAddToCart(product)}
                        >
                          <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                          {product.in_stock ? 'Add to Cart' : 'Out of Stock'}
                        </Button>
                        <Button size="sm" variant="outline" className="w-full" asChild>
                          <Link href={`/shop/${product.id}`}>View Details</Link>
                        </Button>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
