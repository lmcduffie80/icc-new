'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QuantitySelector } from '@/components/ui/quantity-selector';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { USMap } from '@/components/us-map';
import { useCartStore } from '@/lib/cart-store';
import { useCompareStore } from '@/lib/compare-store';
import { isProductEligibleForState } from '@/lib/state-eligibility';
import { useAuth } from '@/components/auth-provider';
import type { ProductDetailView, SimilarProduct } from '@/lib/products';
import { formatPrice, formatAvailabilityDate } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';
import { AlertTriangle } from 'lucide-react';

// Helper function to get document URL (URLs should already be converted to proxy URLs server-side)
// This is just a fallback for any URLs that might not have been converted
const getDocumentUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  
  // If already a proxy URL, return as-is (most common case after server-side conversion)
  if (url.includes('/api/images/proxy')) {
    return url;
  }
  
  // Fallback: Convert S3 URLs to proxy URLs if somehow they weren't converted server-side
  const urlLower = url.toLowerCase();
  const isS3Url = 
    urlLower.includes('s3.amazonaws.com') ||
    urlLower.includes('.s3.') ||
    urlLower.includes('s3-') ||
    urlLower.includes('amazonaws.com');
  
  if (isS3Url) {
    return `/api/images/proxy?url=${encodeURIComponent(url)}`;
  }
  
  return url;
};

// Star Rating Component
function StarRating({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`h-5 w-5 ${
              star <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-300'
            }`}
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {rating} ({reviewCount} reviews)
      </span>
    </div>
  );
}

// Breadcrumb Component
function Breadcrumb({ category, productName }: { category: string; productName: string }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
      <Link href="/shop" className="hover:text-primary transition-colors">
        All Products
      </Link>
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      <Link href={`/shop?category=${category.toLowerCase()}`} className="hover:text-primary transition-colors">
        {category}
      </Link>
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      <span className="text-foreground">{productName}</span>
    </nav>
  );
}

export function ProductDetailContent({
  product,
  similarProducts = [],
}: {
  product: ProductDetailView;
  similarProducts?: SimilarProduct[];
}) {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [userState, setUserState] = useState<string | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const { user } = useAuth();

  const addProduct = useCompareStore((state) => state.addProduct);
  const removeProduct = useCompareStore((state) => state.removeProduct);
  const isInCompare = useCompareStore((state) => state.isInCompare(product.id));
  const canAddMore = useCompareStore((state) => state.canAddMore());

  // Fetch user's primary address state if logged in
  useEffect(() => {
    async function fetchUserState() {
      if (!user) return;

      try {
        const response = await fetch('/api/profile/addresses');
        if (response.ok) {
          const data = await response.json();
          // Addresses are sorted by is_primary DESC, so first address is primary
          if (data.addresses && data.addresses.length > 0) {
            setUserState(data.addresses[0].state);
          }
        }
      } catch {
        // Silently fail - warning is optional enhancement
      }
    }

    fetchUserState();
  }, [user]);

  // Check if product is eligible for user's state
  const showStateWarning =
    userState && !isProductEligibleForState(product.approvedStates, userState);
  
  const handleAddToCart = () => {
    setIsAdding(true);
    // Find label URL from documents - check for various label name formats
    const labelDoc = product.documents?.find(doc => {
      if (!doc || !doc.name) return false;
      const name = doc.name.toLowerCase();
      return name.includes('label') || name.includes('product label');
    });
    
    // Also check if product has label_url or admin_label_url directly (from page.tsx)
    // The product page adds these to documents, but we should also check directly
    // as a fallback in case the document structure is different
    let labelUrl = labelDoc?.url || null;
    
    // If no label found in documents, try to find any document with 'label' in URL
    if (!labelUrl && product.documents) {
      const urlLabelDoc = product.documents.find(doc => {
        if (!doc || !doc.url) return false;
        const url = doc.url.toLowerCase();
        return url.includes('label') && !url.includes('sds');
      });
      labelUrl = urlLabelDoc?.url || null;
    }
    
    // Debug: log if label is found
    if (process.env.NODE_ENV === 'development') {
      console.log('Adding to cart:', {
        productName: product.name,
        hasDocuments: !!product.documents,
        documentsCount: product.documents?.length || 0,
        documents: product.documents,
        labelDoc,
        labelUrl,
      });
    }
    
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || labelUrl || '',
      inStock: product.inStock,
      approvedStates: product.approvedStates,
      unitOfMeasure: product.unitOfMeasure,
      truckloadEligible: product.truckloadEligible,
      casesPerPallet: product.casesPerPallet,
      bulkDensityLbsPerGallon: product.bulkDensityLbsPerGallon,
      gallonsPerCase: product.gallonsPerCase,
      labelUrl,
      restrictedUse: product.restrictedUse,
      attributes: product.attributes ? {
        containerSizes: product.attributes.containerSizes,
      } : null,
      quantity,
    });
    
    // Show feedback and reset
    setTimeout(() => {
      setIsAdding(false);
      setQuantity(1);
    }, 500);
  };
  
  const handleAddToCompare = () => {
    addProduct({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    });
  };
  
  const handleRemoveFromCompare = () => {
    removeProduct(product.id);
  };

  const lbsPerGal = product.attributes?.lbsPerGallon
    ? parseFloat(product.attributes.lbsPerGallon)
    : null;
  const lbsPerGalDisplay = lbsPerGal && !isNaN(lbsPerGal) && lbsPerGal > 0
    ? lbsPerGal % 1 === 0 ? lbsPerGal.toFixed(0) : lbsPerGal.toFixed(1)
    : null;

  return (
    <div className="flex flex-col">
      {/* Product Detail Section */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumb category={product.category} productName={product.name} />

          {/* State Eligibility Warning */}
          {showStateWarning && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Shipping Restriction
                  </p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    This product is not approved for sale in your state ({userState}).
                    You may still add it to your cart, but you will not be able to
                    complete checkout with a shipping address in {userState}.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
            {/* Product Image */}
            <div className="relative overflow-hidden rounded-lg bg-white dark:bg-slate-50 aspect-square">
              <Image
                src={getImageProxyUrl(product.image) || product.image || '/placeholder.png'}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
                unoptimized={product.image?.includes('s3.amazonaws.com') || product.image?.includes('.s3.')}
              />
            </div>

            {/* Product Info */}
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm text-primary uppercase tracking-wide font-medium">
                    {product.category}
                  </span>
                  {product.unitOfMeasure && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                      {product.unitOfMeasure}
                    </span>
                  )}
                </div>
                <h1 className="mb-2">{product.name}</h1>
                <p className="text-muted-foreground whitespace-pre-wrap">{product.description}</p>
              </div>

              {/* Buy Section Card */}
              <Card>
                <CardContent className="p-6 space-y-6">
                  {/* Price */}
                  <div className="flex items-start gap-6">
                    <div>
                      <div className="flex items-baseline gap-3">
                        <PriceWithUnit
                          price={product.price}
                          unitOfMeasure={product.unitOfMeasure}
                          containerSize={product.attributes?.containerSizes}
                          priceClassName="text-3xl font-bold"
                          showCostPerGallon={true}
                        />
                        {product.originalPrice && (
                          <span className="text-xl text-muted-foreground line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                    {lbsPerGalDisplay && (
                      <div className="text-sm border-l border-border/40 pl-6">
                        <div className="font-semibold text-foreground text-base">{lbsPerGalDisplay} lbs/gal</div>
                        <div className="text-xs text-muted-foreground">Active ingredient</div>
                      </div>
                    )}
                  </div>

                  {/* Stock Status */}
                  <div>
                    {product.inStock ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        In Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Out of Stock
                      </span>
                    )}
                  </div>

                  {/* Quantity Selector */}
                  <QuantitySelector 
                    quantity={quantity} 
                    onQuantityChange={(qty) => setQuantity(Math.max(1, qty))} 
                  />

                  {/* Actions */}
                  <div className="space-y-3">
                    <Button 
                      size="lg" 
                      className="w-full" 
                      disabled={!product.inStock || isAdding}
                      onClick={handleAddToCart}
                    >
                      {isAdding ? (
                        <>
                          <svg className="h-5 w-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Added!
                        </>
                      ) : (
                        <>
                          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                        </>
                      )}
                    </Button>
                    
                    {/* Compare Buttons */}
                    {!isInCompare ? (
                      <Button 
                        size="lg" 
                        variant="outline" 
                        className="w-full"
                        onClick={handleAddToCompare}
                        disabled={!canAddMore}
                      >
                        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        {canAddMore ? 'Add to Compare' : 'Compare List Full (3 max)'}
                      </Button>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <Button 
                          size="lg" 
                          variant="outline" 
                          onClick={handleRemoveFromCompare}
                        >
                          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Remove from Compare
                        </Button>
                        <Button 
                          size="lg" 
                          variant="default"
                          asChild
                        >
                          <Link href="/compare">
                            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View Comparisons
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Terms & Conditions Link */}
                  <div className="pt-4 border-t border-border/40">
                    <Link href="/terms" className="text-sm text-primary hover:underline flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      View Terms & Conditions
                    </Link>
                  </div>

                  {/* SKU, Package Type & Compared To */}
                  <div className="pt-4 border-t border-border/40 text-sm text-muted-foreground space-y-1">
                    <div>SKU: {product.sku}</div>
                    {product.attributes?.packageType && (
                      <div>Package Type: {product.attributes.packageType}</div>
                    )}
                    {product.attributes?.activeIngredients && (
                      <div>Active Ingredient: <span className="font-medium text-foreground">{product.attributes.activeIngredients}</span></div>
                    )}
                    {product.comparedTo && (
                      <div>Compared to: <span className="font-medium text-foreground">{product.comparedTo}</span></div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Description Card with Rating */}
      <section className="border-t border-border/40 bg-muted/20 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Product Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StarRating rating={product.rating} reviewCount={product.reviewCount} />
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{product.fullDescription}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Product Attributes */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center">Product Attributes</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Technical Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-border/40 pb-3">
                    <dt className="font-medium mb-1 sm:mb-0">Active Ingredients:</dt>
                    <dd className="text-muted-foreground sm:text-right">{product.attributes.activeIngredients}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-border/40 pb-3">
                    <dt className="font-medium mb-1 sm:mb-0">EPA Signal Word:</dt>
                    <dd className="text-muted-foreground sm:text-right">{product.attributes.epaSignalWord}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-border/40 pb-3">
                    <dt className="font-medium mb-1 sm:mb-0">EPA Registration Number:</dt>
                    <dd className="text-muted-foreground sm:text-right">{product.attributes.epaRegistrationNumber}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-border/40 pb-3">
                    <dt className="font-medium mb-1 sm:mb-0">Application Rate Range:</dt>
                    <dd className="text-muted-foreground sm:text-right">{product.attributes.applicationRateRange}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between border-b border-border/40 pb-3">
                    <dt className="font-medium mb-1 sm:mb-0">Container Size(s):</dt>
                    <dd className="text-muted-foreground sm:text-right">{product.attributes.containerSizes}</dd>
                  </div>
                  {product.attributes.packageType && (
                    <div className="flex flex-col sm:flex-row sm:justify-between border-b border-border/40 pb-3">
                      <dt className="font-medium mb-1 sm:mb-0">Package Type:</dt>
                      <dd className="text-muted-foreground sm:text-right">{product.attributes.packageType}</dd>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <dt className="font-medium mb-1 sm:mb-0">Product Availability Date:</dt>
                    <dd className="text-muted-foreground sm:text-right">{formatAvailabilityDate(product.attributes.availabilityDate)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>States Approved for Sale</CardTitle>
              </CardHeader>
              <CardContent>
                <USMap approvedStates={product.approvedStates} />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Documents Card */}
      <section className="border-t border-border/40 bg-muted/20 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center">Product Documents</h2>
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {product.documents.map((doc, index) => (
                  <a
                    key={index}
                    href={getDocumentUrl(doc.url) || doc.url}
                    className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted transition-colors group"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                        <path d="M14 2v6h6M10 13h4M10 17h4M10 9h1" stroke="white" strokeWidth="1" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium group-hover:text-primary transition-colors">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">PDF Document</div>
                    </div>
                    <svg className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features & Specifications */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Features */}
            <Card>
              <CardHeader>
                <CardTitle>Key Features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <svg
                        className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Specifications */}
            <Card>
              <CardHeader>
                <CardTitle>Specifications</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between border-b border-border/40 pb-2">
                      <dt className="font-medium">{key}:</dt>
                      <dd className="text-muted-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Similar Products Section */}
      {similarProducts.length > 0 && (
        <section className="border-t border-border/40 py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-8 text-center">Compare to Like Products</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {similarProducts.map((item) => {
                const itemImage = item.image ? getImageProxyUrl(item.image) : null;
                const uom = item.unit_of_measure
                  ? item.unit_of_measure.replace(/^\//, '')
                  : null;

                return (
                  <Link
                    key={item.id}
                    href={`/shop/${item.id}`}
                    className="group block"
                  >
                    <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg hover:cursor-pointer">
                      <div className="relative aspect-square bg-muted/30">
                        {itemImage ? (
                          <Image
                            src={itemImage}
                            alt={item.name}
                            fill
                            className="object-contain p-4 transition-transform group-hover:scale-105"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            unoptimized={
                              itemImage.includes('/api/images/proxy') ||
                              itemImage.includes('s3.amazonaws.com') ||
                              itemImage.includes('.s3.')
                            }
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            No Image
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs text-primary uppercase tracking-wide">
                            {item.category}
                          </span>
                          {uom && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                              {uom}
                            </span>
                          )}
                        </div>
                        <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
                          {item.name}
                        </h3>
                        <div className="mb-2">
                          <PriceWithUnit
                            price={item.price}
                            unitOfMeasure={item.unit_of_measure}
                            containerSize={item.attributes?.containerSizes}
                            priceClassName="text-lg font-bold"
                            showCostPerGallon={true}
                          />
                        </div>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.in_stock
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.in_stock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="border-t border-border/40 bg-muted/20 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4">Have Questions?</h2>
          <p className="mb-8 text-muted-foreground">
            Our team is here to help you make the right choice for your operation
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/contact">Contact Us</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/shop">Browse Products</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

