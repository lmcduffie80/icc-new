'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, AlertCircle } from 'lucide-react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

import { useCartStore } from '@/lib/cart-store';
import { useAuth } from '@/components/auth-provider';
import { formatPrice } from '@/lib/utils';
import { getPhoneDigits } from '@/components/ui/phone-input';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { checkCartEligibility, getIneligibilityMessage } from '@/lib/state-eligibility';
import type { FreightRate } from '@/lib/freight-quote';
import { ShippingRateSelector } from '@/components/checkout/shipping-rate-selector';
import { TruckloadRateSelector } from '@/components/checkout/truckload-rate-selector';
import type { TruckloadQuoteRate, TruckloadQuoteResponse } from '@/app/api/shipping/truckload-quote/route';
import { getImageProxyUrl } from '@/lib/image-proxy';

import type { PaymentMethod } from '@/lib/types/payment';
import type {
  CheckoutStep,
  CheckoutAddress,
  SavedAddress,
  ProfileData,
  InvoiceMetadata,
  LicenseMetadata,
} from '@/lib/types/checkout';
import { EMPTY_ADDRESS } from '@/lib/types/checkout';

import { AccordionSection } from '@/components/checkout/accordion-section';
import { PaymentForm } from '@/components/checkout/payment-form';
import { AddressForm } from '@/components/checkout/address-form';
import { SavedAddresses } from '@/components/checkout/saved-addresses';
import { SavedPaymentMethods } from '@/components/checkout/saved-payment-methods';
import { OrderSidebar } from '@/components/checkout/order-sidebar';
import { InvoiceUpload } from '@/components/checkout/invoice-upload';
import { LicenseUpload } from '@/components/checkout/license-upload';
import { InventoryErrorMessage } from '@/components/checkout/inventory-error-message';
import { MinimumOrderErrorMessage } from '@/components/checkout/minimum-order-error-message';

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

/**
 * Label Image Thumbnail Component
 * Handles 403 errors gracefully by falling back to original URL or text link
 */
function LabelImageThumbnail({ 
  proxyUrl, 
  originalUrl, 
  productName 
}: { 
  proxyUrl: string; 
  originalUrl: string | null; 
  productName: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [useOriginalUrl, setUseOriginalUrl] = useState(false);

  // If proxy fails, try original URL or show text link
  const handleImageError = () => {
    console.log('[LabelImageThumbnail] Image load error:', {
      proxyUrl,
      originalUrl,
      imageError,
      useOriginalUrl,
    });
    
    if (!imageError && originalUrl && !useOriginalUrl) {
      // Try original URL once
      setImageError(true);
      setUseOriginalUrl(true);
    } else {
      // Both proxy and original failed, will show text link
      setImageError(true);
    }
  };

  // Determine which URL to use
  // CRITICAL: Always convert S3 URLs to proxy URLs before passing to Image component
  // Even if useOriginalUrl is true, we must use proxy for S3 URLs to prevent Next.js errors
  let imageUrl: string;
  if (useOriginalUrl && originalUrl) {
    // Check if originalUrl is an S3 URL - if so, convert to proxy
    if (originalUrl.includes('amazonaws.com')) {
      imageUrl = `/api/images/proxy?url=${encodeURIComponent(originalUrl)}`;
    } else {
      imageUrl = originalUrl;
    }
  } else {
    imageUrl = proxyUrl || '/placeholder.png';
  }
  const linkUrl = originalUrl || proxyUrl;

  // If image fails to load (including 403 errors), show as text link instead
  // This handles cases where S3 proxy fails or file doesn't exist
  // Show text link if proxy failed and we haven't tried original URL yet
  // OR if both proxy and original URL failed
  if (imageError) {
    // If we tried original URL and it also failed, show text link
    // OR if proxy failed and we haven't tried original yet, show text link
    if (useOriginalUrl || !originalUrl) {
      return (
        <a
          href={linkUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium inline-flex items-center gap-1"
          title="Click to view label (image preview unavailable)"
        >
          <span>View Product Label</span>
          <span>→</span>
        </a>
      );
    }
  }

  return (
    <a
      href={linkUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-100 border border-slate-200 hover:border-emerald-500 transition-colors flex-shrink-0"
      title={`View ${productName} label`}
    >
      <Image
        src={imageUrl}
        alt="Product Label"
        fill
        sizes="48px"
        className="object-cover"
        unoptimized={true}
        onError={handleImageError}
      />
    </a>
  );
}

// Component to fetch and display product label link
function ProductLabelLink({ productId, fallbackUrl }: { productId: string; fallbackUrl?: string }) {
  // Initialize with fallback URL if provided, but convert S3 URLs to proxy URLs
  const getInitialLabelUrl = () => {
    if (!fallbackUrl) return null;
    // CRITICAL: Convert S3 URLs to proxy URLs immediately
    if (!fallbackUrl.startsWith('/api/images/proxy') && fallbackUrl.includes('amazonaws.com')) {
      return `/api/images/proxy?url=${encodeURIComponent(fallbackUrl)}`;
    }
    return fallbackUrl;
  };
  const [labelUrl, setLabelUrl] = useState<string | null>(getInitialLabelUrl());
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!fallbackUrl);
  const [error, setError] = useState<string | null>(null);

  // Initialize originalUrl from fallbackUrl immediately
  useEffect(() => {
    if (fallbackUrl) {
      if (fallbackUrl.startsWith('/api/images/proxy?url=')) {
        try {
          const decoded = decodeURIComponent(fallbackUrl.split('url=')[1]);
          setOriginalUrl(decoded);
        } catch {
          // If decode fails, use fallbackUrl as original
          setOriginalUrl(fallbackUrl);
        }
      } else {
        setOriginalUrl(fallbackUrl);
      }
    }
  }, [fallbackUrl]);

  useEffect(() => {
    async function fetchLabel() {
      // If we have a fallback URL, use it immediately
      if (fallbackUrl) {
        // CRITICAL: Always convert S3 URLs to proxy URLs, even for fallback URLs
        let processedFallbackUrl = fallbackUrl;
        if (!fallbackUrl.startsWith('/api/images/proxy')) {
          // Check if it's an S3 URL and convert to proxy
          if (fallbackUrl.includes('amazonaws.com')) {
            processedFallbackUrl = `/api/images/proxy?url=${encodeURIComponent(fallbackUrl)}`;
            console.log('ProductLabelLink: Converted fallback S3 URL to proxy:', {
              original: fallbackUrl,
              proxy: processedFallbackUrl,
            });
          }
        }
        
        setLabelUrl(processedFallbackUrl);
        // Extract original URL from proxy URL if it's a proxy
        if (processedFallbackUrl.startsWith('/api/images/proxy?url=')) {
          try {
            const decoded = decodeURIComponent(processedFallbackUrl.split('url=')[1]);
            setOriginalUrl(decoded);
            console.log('ProductLabelLink: Using fallback proxy URL, extracted original:', decoded);
          } catch (e) {
            console.error('ProductLabelLink: Error decoding proxy URL:', e);
          }
        } else {
          setOriginalUrl(fallbackUrl);
          console.log('ProductLabelLink: Using fallback direct URL:', fallbackUrl);
        }
        setLoading(false);
      }

      // Always fetch to get the most up-to-date label information
      try {
        if (!fallbackUrl) {
          setLoading(true);
        }
        setError(null);
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch product: ${response.status}`);
        }
        const product = await response.json();
        
        // The API returns the product directly, not wrapped in a 'product' property
        // The API adds label_url/admin_label_url to the documents array
        // Check documents array first for label
        const labelDoc = product?.documents?.find((doc: { name: string; url: string }) => {
          if (!doc || !doc.name) return false;
          const name = doc.name.toLowerCase();
          return name.includes('label') || name.includes('product label');
        });
        
        // Also check direct label_url and admin_label_url fields (prefer admin_label_url)
        const directLabelUrl = product?.admin_label_url || product?.label_url;
        
        // Use document URL if found, otherwise use direct URL
        const url = labelDoc?.url || directLabelUrl;
        
        // Debug: log the full product structure to see what we're working with
        if (process.env.NODE_ENV === 'development') {
          console.log('ProductLabelLink: Full product data:', {
            productId,
            hasDocuments: !!product?.documents,
            documents: product?.documents,
            labelDoc,
            directLabelUrl,
            admin_label_url: product?.admin_label_url,
            label_url: product?.label_url,
            finalUrl: url,
          });
        }
        
        if (url) {
          setOriginalUrl(url);
          // AGGRESSIVE S3 URL DETECTION: Convert ANY URL containing amazonaws.com to proxy
          // This prevents Next.js Image errors for all S3 URL formats
          const isS3Url = url.includes('amazonaws.com');
          const finalUrl = isS3Url
            ? `/api/images/proxy?url=${encodeURIComponent(url)}`
            : url;
          setLabelUrl(finalUrl);
          
          console.log('ProductLabelLink: Product label found:', {
            productId,
            productName: product?.name,
            labelDoc,
            directLabelUrl,
            url,
            finalUrl,
            hasFallback: !!fallbackUrl,
            documentsCount: product?.documents?.length || 0,
          });
        } else {
          // Expanded logging to help debug
          console.log('ProductLabelLink: No label found for product:', {
            productId,
            productName: product?.name,
            hasDocuments: !!product?.documents,
            documentsCount: product?.documents?.length || 0,
            documents: product?.documents,
            admin_label_url: product?.admin_label_url,
            label_url: product?.label_url,
            hasFallback: !!fallbackUrl,
            fallbackUrl: fallbackUrl,
            // Show full product structure for debugging
            productKeys: product ? Object.keys(product) : [],
          });
        }
      } catch (error) {
        console.error('ProductLabelLink: Error fetching product label:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch label');
      } finally {
        setLoading(false);
      }
    }
    fetchLabel();
  }, [productId, fallbackUrl]);

  // Determine the display URL - prefer labelUrl, then originalUrl, then fallbackUrl
  // But always convert S3 URLs to proxy URLs before using
  const rawDisplayUrl = labelUrl || originalUrl || fallbackUrl;
  
  // Show loading state only if we're actively fetching and have no URL yet
  if (loading && !rawDisplayUrl) {
    return (
      <div className="mt-2 text-xs text-gray-400">
        Loading label...
      </div>
    );
  }

  // If we have a URL (from any source), show the link
  if (!rawDisplayUrl) {
    // No label available
    return null;
  }

  // Convert S3 URLs to proxy URLs to avoid Next.js optimization issues
  // Preserve original URL for fallback logic
  let displayUrl: string;
  let finalOriginalUrl = originalUrl || fallbackUrl;
  
  if (rawDisplayUrl.includes('/api/images/proxy')) {
    // Already a proxy URL
    displayUrl = rawDisplayUrl;
  } else {
    // AGGRESSIVE S3 URL DETECTION: Convert ANY URL containing amazonaws.com to proxy
    // This prevents Next.js Image errors for all S3 URL formats
    const isS3Url = rawDisplayUrl.includes('amazonaws.com');
    
    if (isS3Url) {
      displayUrl = `/api/images/proxy?url=${encodeURIComponent(rawDisplayUrl)}`;
      // Preserve original URL for fallback
      if (!finalOriginalUrl) {
        finalOriginalUrl = rawDisplayUrl;
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[ProductLabelLink] Converted S3 URL to proxy:', {
          original: rawDisplayUrl,
          proxy: displayUrl,
        });
      }
    } else {
      displayUrl = rawDisplayUrl;
    }
  }

  // Extract original URL to check file type (needed for proxy URLs)
  const getOriginalUrlForCheck = (url: string | null): string | null => {
    if (!url) return null;
    // If it's a proxy URL, extract the original
    if (url.startsWith('/api/images/proxy?url=')) {
      try {
        return decodeURIComponent(url.split('url=')[1]);
      } catch {
        return url;
      }
    }
    return url;
  };
  
  const originalDisplayUrl = getOriginalUrlForCheck(displayUrl);
  
  // Check if label is an image (check original URL, not proxy URL)
  const isLabelImage = originalDisplayUrl && (
    originalDisplayUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) || 
    originalDisplayUrl.includes('image/') ||
    originalDisplayUrl.includes('image%2F') ||
    // Also check if the original URL contains image indicators
    (originalDisplayUrl.includes('s3') && (
      originalDisplayUrl.toLowerCase().includes('label') && 
      !originalDisplayUrl.toLowerCase().includes('.pdf')
    ))
  );

  // Show label link even if there was an error (user can try direct URL)
  // If proxy fails, they can try the original URL
  const isProxyUrl = labelUrl?.startsWith('/api/images/proxy');

  return (
    <div className="mt-2 flex items-center gap-2">
      {isLabelImage ? (
        // Display label as thumbnail image preview (matching Admin Panel product image style)
        <a
          href={displayUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-100 border border-slate-200 hover:border-emerald-500 transition-colors flex-shrink-0"
        >
          <Image
            src={displayUrl}
            alt="Product Label"
            fill
            sizes="48px"
            className="object-cover"
            unoptimized={true}
          />
        </a>
      ) : (
        // For PDFs or other documents, show as link
        <a
          href={displayUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium inline-flex items-center gap-1"
          onClick={(e) => {
            // If proxy URL fails, try original URL as fallback
            if (isProxyUrl && originalUrl) {
              const link = e.currentTarget;
              // Try original URL if proxy fails
              fetch(labelUrl!)
                .then(res => {
                  if (!res.ok && originalUrl) {
                    // Proxy failed, use original URL
                    link.href = originalUrl;
                  }
                })
                .catch(() => {
                  // Proxy failed, use original URL
                  if (originalUrl) {
                    link.href = originalUrl;
                  }
                });
            }
          }}
        >
          <span>View Product Label</span>
          <span>→</span>
        </a>
      )}
      {error && process.env.NODE_ENV === 'development' && (
        <div className="mt-1 text-xs text-amber-600">
          Note: {error}
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getSubtotal, clearCart, updateQuantity, refreshMetadata } = useCartStore();
  const { user, isPending: isAuthPending } = useAuth();

  // Core checkout state
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCartReady, setIsCartReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('order-summary');
  const [completedSteps, setCompletedSteps] = useState<CheckoutStep[]>([]);
  const [isOrderComplete, setIsOrderComplete] = useState(false);

  // Delivery state
  const [selectedDelivery, setSelectedDelivery] = useState<string>('standard');

  // Address state
  const [shippingAddress, setShippingAddress] = useState<CheckoutAddress>(EMPTY_ADDRESS);
  const [billingAddress, setBillingAddress] = useState<CheckoutAddress>(EMPTY_ADDRESS);
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [showAddressFormForPhone, setShowAddressFormForPhone] = useState(false);

  // Payment state
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<React.ReactNode | null>(null);
  const [minimumOrderError, setMinimumOrderError] = useState<Array<{
    productName: string;
    minimumOrderQty: number;
    orderedQty: number;
    productId?: string;
  }> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  const [isLoadingPaymentIntent, setIsLoadingPaymentIntent] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false);
  const [hasCheckedPaymentMethods, setHasCheckedPaymentMethods] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [paymentsDisabled, setPaymentsDisabled] = useState(false);
  const [storeInfo, setStoreInfo] = useState<{ phone: string; support_email: string } | null>(null);
  const [inventoryError, setInventoryError] = useState<{
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      availableInventory: number;
      inventoryAvailable: boolean;
      nextAvailableQuantity?: number | null;
      nextAvailableDate?: string | null;
      nextAvailableWarehouseName?: string | null;
      canFulfillPartially?: boolean;
      partialQuantity?: number;
    }>;
    errors: string[];
  } | null>(null);

  // Tax state
  const [taxAmount, setTaxAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [isCalculatingTax, setIsCalculatingTax] = useState(false);
  const [taxCalculated, setTaxCalculated] = useState(false);

  // Invoice state
  const [invoiceMetadata, setInvoiceMetadata] = useState<InvoiceMetadata | null>(null);
  const [invoiceUploadProgress, setInvoiceUploadProgress] = useState<{
    uploading: boolean;
    error: string | null;
  }>({ uploading: false, error: null });
  const [hasRecentInvoice, setHasRecentInvoice] = useState<boolean | null>(null);
  const [isCheckingRecentInvoice, setIsCheckingRecentInvoice] = useState(true);
  const [invoiceRequired, setInvoiceRequired] = useState(true);

  // License state (for restricted-use products)
  const [licenseMetadata, setLicenseMetadata] = useState<LicenseMetadata | null>(null);
  const [licenseUploadProgress, setLicenseUploadProgress] = useState<{
    uploading: boolean;
    error: string | null;
  }>({ uploading: false, error: null });
  const [hasRecentLicense, setHasRecentLicense] = useState<boolean | null>(null);
  const [isCheckingRecentLicense, setIsCheckingRecentLicense] = useState(false);

  // Warehouse count state (for shipping calculation)
  const [warehouseCount, setWarehouseCount] = useState(1);

  // Freight quote state
  const [freightRates, setFreightRates] = useState<FreightRate[]>([]);
  const [selectedFreightRate, setSelectedFreightRate] = useState<FreightRate | null>(null);
  const [isFetchingFreightRates, setIsFetchingFreightRates] = useState(false);
  const [freightRateError, setFreightRateError] = useState<string | null>(null);
  const [freightRatesFetched, setFreightRatesFetched] = useState(false);
  const [liftgateRequired, setLiftgateRequired] = useState(false);

  // Truckload quote state
  const [truckloadQuote, setTruckloadQuote] = useState<TruckloadQuoteResponse | null>(null);
  const [selectedTruckloadRate, setSelectedTruckloadRate] = useState<TruckloadQuoteRate | null>(null);
  const [isFetchingTruckloadRates, setIsFetchingTruckloadRates] = useState(false);
  const [truckloadRateError, setTruckloadRateError] = useState<string | null>(null);
  const [truckloadRatesFetched, setTruckloadRatesFetched] = useState(false);
  const [truckloadMinTotes, setTruckloadMinTotes] = useState<number>(15);
  const [truckloadEnabled, setTruckloadEnabled] = useState<boolean>(false);
  const [truckloadMinPallets, setTruckloadMinPallets] = useState<number>(22);
  const [truckloadMaxWeightLbs, setTruckloadMaxWeightLbs] = useState<number>(44000);
  const [truckloadSettingsLoaded, setTruckloadSettingsLoaded] = useState<boolean>(false);

  // Refs
  const prevShippingStateRef = useRef<string | null>(null);
  const prevItemsRef = useRef<string>('');
  // Prevents retry loops when create-intent returns a non-retryable error (429, 400, 503).
  // Cleared whenever the user makes a change that warrants a fresh attempt.
  const paymentIntentErrorRef = useRef(false);
  // Stable ref so the payment-intent useEffect doesn't re-run just because
  // the useCallback reference changed (e.g. cart total updated).
  const createPaymentIntentRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Computed values
  const subtotal = Math.round(getSubtotal() * 100) / 100;

  // Determine if this order qualifies for truckload shipping.
  // Uses the explicit truckload_eligible product flag as primary signal,
  // with UOM/name string matching as fallback for products not yet flagged.
  const isTruckloadOrder = useMemo(() => {
    if (!truckloadEnabled) return false;
    return items.some((item) => {
      // Case goods path: pallet count or total weight threshold
      if (item.truckloadEligible && item.casesPerPallet && item.gallonsPerCase && item.bulkDensityLbsPerGallon) {
        const lbsPerCase = item.gallonsPerCase * item.bulkDensityLbsPerGallon;
        const totalWeightLbs = item.quantity * lbsPerCase;
        const pallets = Math.ceil(item.quantity / item.casesPerPallet);
        if (pallets >= truckloadMinPallets || totalWeightLbs >= truckloadMaxWeightLbs) return true;
      }
      // Tote/bulk path: explicit flag set in Admin on the product
      if (item.truckloadEligible && item.quantity >= truckloadMinTotes) return true;
      // Fallback: legacy string matching for products not yet flagged
      const name = item.name?.toLowerCase() ?? '';
      const uom = item.unitOfMeasure?.toLowerCase() ?? '';
      const isGlyphosate = name.includes('glyphosate');
      const isTote = uom.includes('tote') || uom.includes('tank') || name.includes('tote');
      return isGlyphosate && isTote && item.quantity >= truckloadMinTotes;
    });
  }, [items, truckloadEnabled, truckloadMinTotes, truckloadMinPallets, truckloadMaxWeightLbs]);

  // Detect if any cart item is a restricted-use product
  const hasRestrictedItems = items.some((item) => item.restrictedUse);

  // Use selected ShipBoss rate; 0 until a live rate is fetched and selected
  // For truckload orders, use the selected truckload rate instead
  const baseDeliveryFee = isTruckloadOrder
    ? (selectedTruckloadRate?.freight_total ?? 0)
    : (selectedFreightRate ? selectedFreightRate.price : 0);
  // Multiply by warehouse count if inventory is split across multiple warehouses (non-truckload only)
  const baseDeliveryFeeWithWarehouse = isTruckloadOrder
    ? Math.round(baseDeliveryFee * 100) / 100
    : Math.round(baseDeliveryFee * warehouseCount * 100) / 100;
  // Liftgate surcharge: 25% of the base LTL freight cost (not applicable to truckload)
  const liftgateFee = (!isTruckloadOrder && liftgateRequired && selectedFreightRate)
    ? Math.round(baseDeliveryFeeWithWarehouse * 0.25 * 100) / 100
    : 0;
  const deliveryFee = Math.round((baseDeliveryFeeWithWarehouse + liftgateFee) * 100) / 100;
  const total = Math.round((subtotal + deliveryFee + taxAmount) * 100) / 100;

  // ========== EFFECTS ==========

  // Fetch shipping settings on mount (truckload + global invoice requirement)
  useEffect(() => {
    async function fetchTruckloadSettings() {
      try {
        const res = await fetch('/api/settings/shipping');
        if (res.ok) {
          const data = await res.json();
          if (data.truckload) {
            setTruckloadEnabled(!!data.truckload.enabled);
            setTruckloadMinTotes(data.truckload.min_totes ?? 15);
            setTruckloadMinPallets(data.truckload.min_pallets ?? 22);
            setTruckloadMaxWeightLbs(data.truckload.max_weight_lbs ?? 44000);
          }
          if (data.invoice) {
            // If invoice.required is explicitly false, invoices are globally disabled
            setInvoiceRequired(data.invoice.required !== false);
          }
        }
      } catch {
        // Settings unavailable; default to truckload disabled, invoice required
      } finally {
        setTruckloadSettingsLoaded(true);
      }
    }
    fetchTruckloadSettings();
  }, []);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!isAuthPending && !user) {
      router.push('/auth/sign-in?redirect=/checkout');
    }
  }, [user, isAuthPending, router]);

  // Check if user has a recent invoice (skipped when invoices are globally disabled)
  useEffect(() => {
    if (!user || !isLoaded || !truckloadSettingsLoaded) return;

    // If invoices are globally disabled, treat every user as having a recent invoice
    if (!invoiceRequired) {
      setHasRecentInvoice(true);
      setIsCheckingRecentInvoice(false);
      return;
    }

    const checkRecentInvoice = async () => {
      try {
        const response = await fetch('/api/invoice/check-recent');
        if (response.ok) {
          const data = await response.json();
          setHasRecentInvoice(data.hasRecentInvoice);
          if (data.hasRecentInvoice && data.recentInvoice) {
            setInvoiceMetadata(data.recentInvoice);
          } else {
            // User has no recent invoice - clear any stale data from sessionStorage
            setInvoiceMetadata(null);
            setCompletedSteps((prev) => prev.filter((step) => step !== 'invoice-verification'));
          }
        }
      } catch (error) {
        console.error('Error checking recent invoice:', error);
        setHasRecentInvoice(false);
        // Also clear stale invoice data on error
        setInvoiceMetadata(null);
        setCompletedSteps((prev) => prev.filter((step) => step !== 'invoice-verification'));
      } finally {
        setIsCheckingRecentInvoice(false);
      }
    };

    checkRecentInvoice();
  }, [user, isLoaded, invoiceRequired, truckloadSettingsLoaded]);

  // Check if user has a recent license (only when cart has restricted-use products)
  useEffect(() => {
    if (!user || !isLoaded || !isCartReady) return;
    if (!hasRestrictedItems) {
      setHasRecentLicense(true); // no restricted items — skip the gate
      setIsCheckingRecentLicense(false);
      return;
    }

    setIsCheckingRecentLicense(true);
    const checkRecentLicense = async () => {
      try {
        const response = await fetch('/api/license/check-recent');
        if (response.ok) {
          const data = await response.json();
          setHasRecentLicense(data.hasRecentLicense);
          if (data.hasRecentLicense && data.recentLicense) {
            setLicenseMetadata(data.recentLicense);
          } else {
            setLicenseMetadata(null);
            setCompletedSteps((prev) => prev.filter((step) => step !== 'license-verification'));
          }
        }
      } catch (error) {
        console.error('Error checking recent license:', error);
        setHasRecentLicense(false);
        setLicenseMetadata(null);
        setCompletedSteps((prev) => prev.filter((step) => step !== 'license-verification'));
      } finally {
        setIsCheckingRecentLicense(false);
      }
    };

    checkRecentLicense();
  }, [user, isLoaded, isCartReady, hasRestrictedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wait for cart to rehydrate
  useEffect(() => {
    const timer = setTimeout(() => setIsCartReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Refresh cart item metadata from the product API on checkout load.
  // This ensures stale localStorage items (e.g. added before truckload_eligible
  // was set on the product) get up-to-date flags before TL detection runs.
  useEffect(() => {
    if (!isCartReady || items.length === 0) return;
    async function syncCartMetadata() {
      const updates: Record<string, Partial<import('@/lib/cart-store').CartItem>> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            const res = await fetch(`/api/products/${item.id}`);
            if (!res.ok) return;
            const p = await res.json();
            updates[item.id] = {
              truckloadEligible: p.truckload_eligible ?? false,
              casesPerPallet: p.cases_per_pallet ?? null,
              bulkDensityLbsPerGallon: p.bulk_density_lbs_per_gallon ?? null,
              gallonsPerCase: p.gallons_per_case ?? null,
              restrictedUse: p.restricted_use ?? false,
            };
          } catch {
            // ignore — stale metadata is better than a broken checkout
          }
        })
      );
      if (Object.keys(updates).length > 0) refreshMetadata(updates);
    }
    syncCartMetadata();
  }, [isCartReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load checkout data from sessionStorage
  useEffect(() => {
    const savedData = sessionStorage.getItem('checkout-data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const restoredStep = parsed.currentStep || 'order-summary';
        const restoredCompletedSteps: CheckoutStep[] = parsed.completedSteps || [];

        if (restoredStep !== 'order-summary' && !restoredCompletedSteps.includes('order-summary')) {
          sessionStorage.removeItem('checkout-data');
          setCurrentStep('order-summary');
          setCompletedSteps([]);
        } else {
          setCurrentStep(restoredStep);
          setCompletedSteps(restoredCompletedSteps);
          setSelectedDelivery(parsed.selectedDelivery || 'standard');
          setSameAsShipping(parsed.sameAsShipping ?? true);
          if (parsed.shippingAddress) setShippingAddress(parsed.shippingAddress);
          if (parsed.billingAddress) setBillingAddress(parsed.billingAddress);
          setInvoiceMetadata(parsed.invoiceMetadata || null);
          if (parsed.selectedFreightRate) setSelectedFreightRate(parsed.selectedFreightRate);
          if (parsed.liftgateRequired) setLiftgateRequired(parsed.liftgateRequired);
          if (parsed.warehouseCount) setWarehouseCount(parsed.warehouseCount);
          if (parsed.selectedTruckloadRate) setSelectedTruckloadRate(parsed.selectedTruckloadRate);
        }
      } catch {
        sessionStorage.removeItem('checkout-data');
      }
    }
    setIsLoaded(true);
  }, []);

  // When restored to the payment step from session storage, tax hasn't been
  // calculated yet — trigger it so createPaymentIntent can proceed.
  useEffect(() => {
    if (isLoaded && currentStep === 'payment' && !taxCalculated && !isCalculatingTax) {
      calculateTax();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, currentStep]);

  // Pre-fill email from user
  useEffect(() => {
    if (user?.email && !shippingAddress.email) {
      setShippingAddress((prev) => ({ ...prev, email: user.email }));
    }
  }, [user, shippingAddress.email]);

  // Fetch saved addresses
  useEffect(() => {
    if (!user || !isLoaded) return;

    const savedData = sessionStorage.getItem('checkout-data');
    let sessionSelectedAddressId: string | null = null;
    let sessionUseNewAddress = false;
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        sessionSelectedAddressId = parsed.selectedAddressId || null;
        sessionUseNewAddress = parsed.useNewAddress || false;
      } catch {
        /* continue */
      }
    }

    const fetchAddresses = async () => {
      setIsLoadingAddresses(true);
      try {
        const [addressesRes, profileRes] = await Promise.all([
          fetch('/api/profile/addresses'),
          fetch('/api/profile'),
        ]);

        if (!addressesRes.ok || !profileRes.ok) {
          setIsLoadingAddresses(false);
          setUseNewAddress(true);
          return;
        }

        const [addressesData, profileData] = await Promise.all([
          addressesRes.json(),
          profileRes.json(),
        ]);

        const addresses: SavedAddress[] = addressesData.addresses || [];
        const profile: ProfileData = profileData.profile;

        setSavedAddresses(addresses);

        if (addresses.length === 0) {
          setUseNewAddress(true);
          setIsLoadingAddresses(false);
          return;
        }

        if (sessionUseNewAddress) {
          setUseNewAddress(true);
        } else if (sessionSelectedAddressId && addresses.find((a) => a.id === sessionSelectedAddressId)) {
          setSelectedAddressId(sessionSelectedAddressId);
          const selectedAddr = addresses.find((a) => a.id === sessionSelectedAddressId)!;
          const phoneMissing = populateShippingFromSavedAddress(selectedAddr, profile, user.email, '');
          setShowAddressFormForPhone(phoneMissing);
        } else {
          const primaryAddress = addresses[0];
          setSelectedAddressId(primaryAddress.id);
          const phoneMissing = populateShippingFromSavedAddress(primaryAddress, profile, user.email, '');
          setShowAddressFormForPhone(phoneMissing);
        }
      } catch (error) {
        console.error('Error fetching saved addresses:', error);
        setUseNewAddress(true);
      } finally {
        setIsLoadingAddresses(false);
      }
    };

    fetchAddresses();
  }, [user, isLoaded]);

  // Estimate warehouse count when items change
  useEffect(() => {
    if (!isLoaded || items.length === 0) {
      setWarehouseCount(1);
      return;
    }

    // Only estimate if we have valid items with product IDs
    const validItems = items.filter(item => item.id && item.quantity > 0);
    if (validItems.length === 0) {
      setWarehouseCount(1);
      return;
    }

    async function estimateWarehouses() {
      try {
        const response = await fetch('/api/checkout/estimate-warehouses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: validItems.map(item => ({
              productId: item.id,
              quantity: item.quantity,
            })),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setWarehouseCount(data.warehouseCount || 1);
        } else {
          // Default to 1 if estimation fails
          setWarehouseCount(1);
        }
      } catch (error) {
        console.error('Error estimating warehouse count:', error);
        setWarehouseCount(1);
      }
    }

    estimateWarehouses();
  }, [items, isLoaded]);

  // Reset freight rates when the delivery address changes so stale rates are not shown
  const prevShipKeyRef = useRef('');
  useEffect(() => {
    if (!isLoaded) return;
    const { address1, city, state, zipCode } = shippingAddress;
    const key = `${address1}|${city}|${state}|${zipCode}`;
    if (key !== prevShipKeyRef.current && prevShipKeyRef.current !== '') {
      setFreightRates([]);
      setSelectedFreightRate(null);
      setLiftgateRequired(false);
      setFreightRatesFetched(false);
      setFreightRateError(null);
      // Also reset truckload rates
      setTruckloadQuote(null);
      setSelectedTruckloadRate(null);
      setTruckloadRatesFetched(false);
      setTruckloadRateError(null);
    }
    prevShipKeyRef.current = key;
  }, [shippingAddress.address1, shippingAddress.city, shippingAddress.state, shippingAddress.zipCode, isLoaded]);

  // Auto-fetch freight rates when the shipping address becomes complete
  useEffect(() => {
    if (!isLoaded) return;
    // Don't fetch rates after the order has been completed and cart cleared
    if (isOrderComplete || items.length === 0) return;
    // Wait until truckload settings are known before deciding which rate API to call,
    // otherwise a tote order would incorrectly call ShipBoss before we know it's TL.
    if (!truckloadSettingsLoaded) return;
    const { firstName, lastName, address1, city, state, zipCode, phone, email } = shippingAddress;
    const addressComplete = !!(firstName && lastName && address1 && city && state && zipCode && zipCode.length >= 5 && phone && email);
    if (addressComplete) {
      if (isTruckloadOrder && !truckloadRatesFetched && !isFetchingTruckloadRates) {
        fetchTruckloadQuote();
      } else if (!isTruckloadOrder && !freightRatesFetched && !isFetchingFreightRates) {
        fetchFreightQuotes();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingAddress, freightRatesFetched, isFetchingFreightRates, truckloadRatesFetched, isFetchingTruckloadRates, isTruckloadOrder, truckloadSettingsLoaded, isLoaded, isOrderComplete, items.length]);

  // Save checkout data to sessionStorage
  useEffect(() => {
    if (!isLoaded) return;
    const checkoutData = {
      currentStep,
      completedSteps,
      selectedDelivery,
      sameAsShipping,
      shippingAddress,
      billingAddress,
      invoiceMetadata,
      selectedAddressId,
      useNewAddress,
      selectedFreightRate,
      liftgateRequired,
      warehouseCount,
      selectedTruckloadRate,
    };
    sessionStorage.setItem('checkout-data', JSON.stringify(checkoutData));
  }, [isLoaded, currentStep, completedSteps, selectedDelivery, sameAsShipping, shippingAddress, billingAddress, invoiceMetadata, selectedAddressId, useNewAddress, selectedFreightRate, liftgateRequired, warehouseCount, selectedTruckloadRate]);

  // Redirect to shop if cart is empty
  useEffect(() => {
    if (isCartReady && items.length === 0 && !isOrderComplete) {
      router.push('/shop');
    }
  }, [isCartReady, items, router, isOrderComplete]);

  // Create a stable signature of items for comparison (id:quantity pairs)
  const itemsSignature = useMemo(() => {
    return items.map(item => `${item.id}:${item.quantity}`).sort().join(',');
  }, [items]);

  // Auto-update minimum order error when cart items change
  // This allows re-validation when user updates cart quantities (either on checkout page or after returning from cart)
  const hasMinimumOrderError = Boolean(minimumOrderError && minimumOrderError.length > 0);
  
  // Create a stable signature for minimum order error to use in dependency array
  const minimumOrderErrorSignature = useMemo(() => {
    if (!minimumOrderError || minimumOrderError.length === 0) return '';
    return minimumOrderError.map(e => `${e.productName}:${e.orderedQty}:${e.minimumOrderQty}`).join(',');
  }, [minimumOrderError]);
  
  useEffect(() => {
    if (!isCartReady) return;
    
    // If items changed (quantities updated), update error message with current quantities
    if (prevItemsRef.current !== itemsSignature && prevItemsRef.current !== '') {
      // Update error message quantities to reflect current cart state
      if (hasMinimumOrderError && minimumOrderError) {
        const updatedErrors = minimumOrderError.map(error => {
          // Find the product in current cart to get the actual current quantity
          const cartItem = items.find(item => 
            item.name === error.productName || item.id === error.productId
          );
          if (cartItem) {
            return {
              ...error,
              orderedQty: cartItem.quantity, // Use current cart quantity
              productId: cartItem.id,
            };
          }
          return error;
        });
        
        // Check if any errors are now resolved (quantity meets minimum)
        const stillHasErrors = updatedErrors.some(
          error => error.orderedQty < error.minimumOrderQty
        );
        
        if (stillHasErrors) {
          // Update error with current quantities
          setMinimumOrderError(updatedErrors);
        } else {
          // All minimums are met, clear the error
          setMinimumOrderError(null);
          setSubmitError(null);
        }
      }
      
      // Reset payment intent to trigger re-validation with new quantities
      // Only reset clientSecret when items change if we're on payment step and tax is calculated
      // This prevents premature payment intent creation before all calculations are complete
      if (currentStep === 'payment' && taxCalculated && !isCalculatingTax) {
        setClientSecret(null);
        paymentIntentErrorRef.current = false;
      }
    }
    
    prevItemsRef.current = itemsSignature;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, isCartReady, hasMinimumOrderError, currentStep, taxCalculated, isCalculatingTax, minimumOrderErrorSignature]);

  // Fetch payment methods when on payment step
  useEffect(() => {
    if (currentStep === 'payment' && user && !hasCheckedPaymentMethods && !isLoadingPaymentMethods && !paymentsDisabled) {
      fetchPaymentMethods();
    }
  }, [currentStep, user, hasCheckedPaymentMethods, isLoadingPaymentMethods, paymentsDisabled]);

  // Create payment intent callback
  const createPaymentIntent = useCallback(async () => {
    setIsLoadingPaymentIntent(true);
    setSubmitError(null);
    setMinimumOrderError(null);

    try {
      const response = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            price: parseFloat(item.price),
            name: item.name,
            image: item.image?.trim() || undefined,
            unitOfMeasure: item.unitOfMeasure || null,
          })),
          deliveryFee,
          tax: taxAmount,
          deliveryMethod: selectedDelivery,
          state: shippingAddress.state,
          freightQuoteId: selectedFreightRate?.quoteId ?? null,
          shippingCarrier: selectedFreightRate?.carrier ?? null,
          liftgateFee,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Mark non-retryable errors so the useEffect guard doesn't immediately re-fire
        if (response.status === 429 || response.status === 400 || response.status === 500 || response.status === 503) {
          paymentIntentErrorRef.current = true;
        }
        if (response.status === 503) {
          setPaymentsDisabled(true);
          try {
            const storeInfoRes = await fetch('/api/settings/store-info');
            if (storeInfoRes.ok) {
              const info = await storeInfoRes.json();
              setStoreInfo({ phone: info.phone, support_email: info.support_email });
            }
          } catch {
            setStoreInfo({ phone: '1-800-CROP-CARE', support_email: 'support@innovativecropcare.com' });
          }
          return;
        }
        
        // Check if this is an inventory warning (allow proceeding)
        // Inventory issues are now warnings, not errors, so we allow checkout to proceed
        // but we still want to show the warning information
        if (errorData.validationDetails?.warnings) {
          const hasInventoryWarnings = errorData.validationDetails.warnings.some(
            (warning: string) => warning.includes('Partial inventory')
          );
          if (hasInventoryWarnings && errorData.validationDetails.items) {
            // Store warnings but don't block checkout
            setSubmitError(
              <div className="space-y-2">
                <p className="font-semibold">Note: Some items have limited inventory</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {errorData.validationDetails.warnings
                    .filter((w: string) => w.includes('Partial inventory'))
                    .map((warning: string, idx: number) => (
                      <li key={idx}>{warning}</li>
                    ))}
                </ul>
              </div>
            );
            // Don't return - allow checkout to proceed
          }
        }
        
        // Check for minimum order quantity errors
        if (errorData.details && Array.isArray(errorData.details)) {
          const minimumOrderErrors: Array<{
            productName: string;
            minimumOrderQty: number;
            orderedQty: number;
            productId?: string;
          }> = [];
          
          errorData.details.forEach((detail: unknown) => {
            // Parse error message like "Product X requires a minimum order quantity of Y. You ordered Z."
            if (typeof detail !== 'string') return;
            const match = detail.match(/Product (.+?) requires a minimum order quantity of (\d+)\. You ordered (\d+)\./);
            if (match) {
              const productName = match[1];
              const minimumOrderQty = parseInt(match[2], 10);
              // Use current cart quantity instead of parsed quantity from error message
              // Find the product in current cart to get the actual current quantity
              const cartItem = items.find(item => item.name === productName);
              const currentQuantity = cartItem ? cartItem.quantity : parseInt(match[3], 10);
              
              minimumOrderErrors.push({
                productName,
                minimumOrderQty,
                orderedQty: currentQuantity, // Use current cart quantity, not stale API quantity
                productId: cartItem?.id,
              });
            }
          });
          
          if (minimumOrderErrors.length > 0) {
            setMinimumOrderError(minimumOrderErrors);
            setIsLoadingPaymentIntent(false); // Reset loading state to prevent retry loop
            return; // Don't proceed with payment intent creation
          }
        }
        
        // Include validation error details in the error message
        const errorMessage = errorData.error || 'Failed to create payment intent';
        const details = errorData.details
          ? (Array.isArray(errorData.details)
              ? errorData.details.map((d: unknown) => (typeof d === 'string' ? d : (d as { message?: string })?.message ?? JSON.stringify(d))).join(', ')
              : JSON.stringify(errorData.details))
          : '';
        throw new Error(details ? `${errorMessage}: ${details}` : errorMessage);
      }

      // Clear inventory error on success
      setInventoryError(null);
      const data = await response.json();
      setClientSecret(data.clientSecret);
      
      // Show warnings about partial inventory if present
      if (data.warnings && data.warnings.length > 0) {
        setSubmitError(
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <p className="font-semibold text-amber-900">Note: Some items have limited inventory</p>
            <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
              {data.warnings.map((warning: string, idx: number) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        );
      }
    } catch (error) {
      console.error('Error creating payment intent:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to initialize payment');
    } finally {
      setIsLoadingPaymentIntent(false);
    }
  }, [total, items, deliveryFee, taxAmount, selectedDelivery, shippingAddress.state]);

  // Keep the stable ref in sync with the latest callback so the trigger effect
  // below can call it without listing it as a dependency.
  useEffect(() => {
    createPaymentIntentRef.current = createPaymentIntent;
  }, [createPaymentIntent]);

  // Create payment intent when on payment step.
  // Intentionally omits createPaymentIntent from deps — called via stable ref so
  // a new callback reference (e.g. cart total changed) doesn't re-trigger this effect.
  // paymentIntentErrorRef guards against retry loops on non-retryable errors.
  useEffect(() => {
    if (
      currentStep === 'payment' &&
      !clientSecret &&
      !isLoadingPaymentIntent &&
      !paymentsDisabled &&
      items.length > 0 &&
      taxCalculated &&
      !isCalculatingTax &&
      !minimumOrderError &&
      !paymentIntentErrorRef.current
    ) {
      createPaymentIntentRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, clientSecret, isLoadingPaymentIntent, paymentsDisabled, items.length, taxCalculated, isCalculatingTax, minimumOrderError]);

  // Reset tax when shipping state changes
  useEffect(() => {
    if (!isLoaded) return;
    if (prevShippingStateRef.current === null) {
      prevShippingStateRef.current = shippingAddress.state;
      return;
    }
    if (prevShippingStateRef.current !== shippingAddress.state) {
      prevShippingStateRef.current = shippingAddress.state;
      setTaxCalculated(false);
      setClientSecret(null);
      paymentIntentErrorRef.current = false;
      setFreightRatesFetched(false);
      setFreightRates([]);
      setSelectedFreightRate(null);
      setLiftgateRequired(false);
    }
  }, [shippingAddress.state, isLoaded]);

  // ========== HELPER FUNCTIONS ==========

  const populateShippingFromSavedAddress = (
    address: SavedAddress,
    profile: ProfileData | null,
    email: string,
    currentPhone: string
  ): boolean => {
    const nameParts = address.fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const phone = profile?.phone || currentPhone;

    setShippingAddress((prev) => ({
      firstName: firstName || prev.firstName,
      lastName: lastName || prev.lastName,
      address1: address.street || prev.address1,
      address2: prev.address2,
      city: address.city || prev.city,
      state: address.state || prev.state,
      zipCode: address.zipCode || prev.zipCode,
      phone: phone || prev.phone,
      email: email || prev.email,
    }));

    // Return true if phone is missing
    return !phone;
  };

  const handleSelectAddress = async (addressId: string) => {
    setSelectedAddressId(addressId);
    const selectedAddr = savedAddresses.find((a) => a.id === addressId);
    if (selectedAddr) {
      try {
        const profileRes = await fetch('/api/profile');
        const profileData = profileRes.ok ? await profileRes.json() : null;
        const phoneMissing = populateShippingFromSavedAddress(
          selectedAddr,
          profileData?.profile || null,
          user?.email || '',
          shippingAddress.phone
        );
        setShowAddressFormForPhone(phoneMissing);
      } catch {
        const phoneMissing = populateShippingFromSavedAddress(
          selectedAddr,
          null,
          user?.email || '',
          shippingAddress.phone
        );
        setShowAddressFormForPhone(phoneMissing);
      }
    }
  };

  const handleUseNewAddress = () => {
    setUseNewAddress(true);
    setSelectedAddressId(null);
    setShowAddressFormForPhone(false);
    setShippingAddress({ ...EMPTY_ADDRESS, email: user?.email || '' });
  };

  const handleBackToSavedAddresses = () => {
    setUseNewAddress(false);
    setShowAddressFormForPhone(false);
    const primaryAddress = savedAddresses[0];
    if (primaryAddress) {
      handleSelectAddress(primaryAddress.id);
    }
  };

  const isPhoneValid = (phone: string): boolean => {
    // Extract digits and check for exactly 10
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10;
  };

  const isAddressValid = (address: CheckoutAddress): boolean => {
    return !!(
      address.firstName &&
      address.lastName &&
      address.address1 &&
      address.city &&
      address.state &&
      address.zipCode &&
      address.zipCode.length >= 5 &&
      isPhoneValid(address.phone) &&
      address.email
    );
  };

  // ========== API FUNCTIONS ==========

  const fetchPaymentMethods = async () => {
    setIsLoadingPaymentMethods(true);
    try {
      const response = await fetch('/api/payment/methods');
      if (!response.ok) throw new Error('Failed to fetch payment methods');

      const data = await response.json();
      const methods = data.paymentMethods || [];
      setSavedPaymentMethods(methods);

      const defaultMethod = methods.find((m: PaymentMethod) => m.isDefault);
      if (defaultMethod) {
        setSelectedPaymentMethodId(defaultMethod.paymentMethodId);
      } else if (methods.length > 0) {
        setSelectedPaymentMethodId(methods[0].paymentMethodId);
      } else {
        setUseNewCard(true);
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      setUseNewCard(true);
    } finally {
      setIsLoadingPaymentMethods(false);
      setHasCheckedPaymentMethods(true);
    }
  };

  const calculateTax = async () => {
    if (!shippingAddress.state) {
      setTaxAmount(0);
      setTaxRate(0);
      setTaxCalculated(true);
      return;
    }

    setIsCalculatingTax(true);
    try {
      const response = await fetch('/api/tax/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtotal, state: shippingAddress.state }),
      });

      if (!response.ok) throw new Error('Failed to calculate tax');

      const data = await response.json();
      setTaxAmount(data.tax);
      setTaxRate(data.rate);
    } catch (error) {
      console.error('Error calculating tax:', error);
      setSubmitError('Failed to calculate tax. Please try again.');
      setTaxAmount(0);
      setTaxRate(0);
    } finally {
      setIsCalculatingTax(false);
      setTaxCalculated(true);
    }
  };

  const fetchFreightQuotes = async () => {
    setIsFetchingFreightRates(true);
    setFreightRateError(null);
    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            name: item.name,
            unitOfMeasure: item.unitOfMeasure || null,
            quantity: item.quantity,
            productId: item.id,
          })),
          shipTo: {
            street: shippingAddress.address1,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zipCode,
            country: 'US',
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Failed to fetch shipping rates');
      }

      const data = await response.json();
      const rates: FreightRate[] = data.rates || [];
      setFreightRates(rates);
      // Auto-select the first (cheapest) rate
      if (rates.length > 0 && !selectedFreightRate) {
        setSelectedFreightRate(rates[0]);
      }
    } catch (error) {
      console.error('Error fetching freight quotes:', error);
      setFreightRateError(
        error instanceof Error && error.message !== 'Failed to fetch shipping rates'
          ? error.message
          : 'Unable to fetch shipping rates. Please check your address and try again.'
      );
    } finally {
      setIsFetchingFreightRates(false);
      setFreightRatesFetched(true);
    }
  };

  const fetchTruckloadQuote = async () => {
    setIsFetchingTruckloadRates(true);
    setTruckloadRateError(null);
    try {
      const response = await fetch('/api/shipping/truckload-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            name: item.name,
            unitOfMeasure: item.unitOfMeasure || null,
            quantity: item.quantity,
            productId: item.id,
            pricePerUnit: parseFloat(item.price),
          })),
          shipTo: {
            street: shippingAddress.address1,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zipCode,
            country: 'US',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch truckload rates');

      const data: TruckloadQuoteResponse = await response.json();
      setTruckloadQuote(data);
      // Auto-select the middle rate tier by default
      if (data.rates.length > 0 && !selectedTruckloadRate) {
        const midIndex = Math.floor(data.rates.length / 2);
        const defaultRate = data.rates[midIndex];
        setSelectedTruckloadRate(defaultRate);
        setSelectedDelivery(`Truckload — ${defaultRate.label}`);
      }
    } catch (error) {
      console.error('Error fetching truckload quote:', error);
      setTruckloadRateError('Unable to fetch truckload rates. Please check your address and try again.');
    } finally {
      setIsFetchingTruckloadRates(false);
      setTruckloadRatesFetched(true);
    }
  };

  // ========== ACTION HANDLERS ==========

  const handleStepComplete = (step: CheckoutStep) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
    }
  };

  const handleConfirmSavedPayment = async () => {
    if (!selectedPaymentMethodId || !clientSecret || !termsAccepted) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!stripePromise) {
        throw new Error('Stripe is not configured');
      }
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe failed to load');

      // Extract payment intent ID from client secret
      const paymentIntentId = clientSecret.split('_secret_')[0];
      
      if (!paymentIntentId) {
        throw new Error('Invalid client secret format');
      }
      
      // Retrieve the payment intent to check its status
      const retrieveResult = await stripe.retrievePaymentIntent(clientSecret);
      const paymentIntent = retrieveResult.paymentIntent;
      
      if (!paymentIntent) {
        throw new Error('Failed to retrieve payment intent');
      }
      
      // If payment intent is already succeeded, proceed directly to order submission
      if (paymentIntent.status === 'succeeded') {
        await handleSubmitOrder(paymentIntent.id);
        return;
      }
      
      // Only update if payment intent is in a state that allows updates
      if (paymentIntent.status === 'requires_payment_method' || 
          paymentIntent.status === 'requires_confirmation' || 
          paymentIntent.status === 'requires_action') {
        // Update the payment intent with the saved payment method
        try {
          const updateResponse = await fetch('/api/payment/update-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientSecret,
              paymentMethodId: selectedPaymentMethodId,
            }),
          });

          if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            // If update fails but payment intent is already succeeded, proceed anyway
            if (errorData.error?.includes('succeeded') || 
                errorData.message?.includes('succeeded') ||
                errorData.status === 'succeeded') {
              await handleSubmitOrder(paymentIntentId);
              return;
            }
            throw new Error(errorData.error || 'Failed to update payment intent');
          }
          
          // Check if the update response indicates success even if payment was already succeeded
          const updateData = await updateResponse.json();
          if (updateData.status === 'succeeded' || updateData.message?.includes('succeeded')) {
            await handleSubmitOrder(paymentIntentId);
            return;
          }
        } catch (updateError: unknown) {
          // If update fails because payment intent is already succeeded, proceed
          const errorMessage = updateError instanceof Error ? updateError.message : '';
          if (errorMessage.includes('succeeded') ||
              errorMessage.includes('status of succeeded')) {
            await handleSubmitOrder(paymentIntentId);
            return;
          }
          throw updateError;
        }
      }

      // Confirm the payment
      const { error: confirmError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(clientSecret);

      if (confirmError) {
        setSubmitError(confirmError.message || 'Payment failed');
        setIsSubmitting(false);
        return;
      }

      if (confirmedIntent?.status === 'succeeded') {
        await handleSubmitOrder(confirmedIntent.id);
      } else {
        setSubmitError('Payment was not successful. Please try again.');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error confirming payment:', error);
      setSubmitError(error instanceof Error ? error.message : 'An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const handleSubmitOrder = async (confirmedPaymentIntentId: string) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const finalBillingAddress = sameAsShipping ? shippingAddress : billingAddress;
      const orderData = {
        items: items.map((item) => ({
          productId: item.id,
          name: item.name,
          price: parseFloat(item.price),
          image: item.image?.trim() || undefined,
          quantity: item.quantity,
        })),
        shippingAddress: {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          line1: shippingAddress.address1,
          line2: shippingAddress.address2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          zipCode: shippingAddress.zipCode,
          country: 'US',
        },
        billingAddress: {
          firstName: finalBillingAddress.firstName,
          lastName: finalBillingAddress.lastName,
          line1: finalBillingAddress.address1,
          line2: finalBillingAddress.address2,
          city: finalBillingAddress.city,
          state: finalBillingAddress.state,
          zipCode: finalBillingAddress.zipCode,
          country: 'US',
        },
        email: shippingAddress.email,
        phone: getPhoneDigits(shippingAddress.phone),
        paymentIntentId: confirmedPaymentIntentId,
        savePaymentMethod: saveCard,
        invoiceMetadata: invoiceMetadata!,
        notes: '',
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        let errorData: { error?: string; message?: string; details?: string | string[] } = {};
        try {
          errorData = await response.json();
        } catch {
          // If response is not JSON, use status text
          const statusText = response.statusText || 'Unknown error';
          console.error('Order creation failed - non-JSON response:', {
            status: response.status,
            statusText,
          });
          throw new Error(`Failed to create order: ${statusText} (${response.status})`);
        }
        
        // Log detailed error for debugging
        console.error('Order creation failed:', {
          status: response.status,
          error: errorData.error,
          message: errorData.message,
          details: errorData.details,
          response: errorData,
        });
        
        // Build a more detailed error message
        let errorMessage = errorData.error || 'Failed to create order';
        
        if (errorData.details && Array.isArray(errorData.details) && errorData.details.length > 0) {
          // If there are validation errors, show them
          const detailsText = errorData.details.join(', ');
          errorMessage = `${errorMessage}: ${detailsText}`;
        } else if (errorData.message) {
          errorMessage = `${errorMessage}: ${errorData.message}`;
        } else if (errorData.details && typeof errorData.details === 'string') {
          errorMessage = `${errorMessage}: ${errorData.details}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setIsOrderComplete(true);
      clearCart();
      sessionStorage.removeItem('checkout-data');
      router.push(`/checkout/thank-you?orderId=${data.order.id}`);
    } catch (error) {
      console.error('Error submitting order:', error);
      
      // Show more detailed error message to user
      let errorMessage: string | React.ReactNode = 'Failed to place order.';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // If it's a validation error, format it nicely
        if (error.message.includes('Order validation failed')) {
          errorMessage = (
            <div className="space-y-2">
              <p className="font-semibold text-red-900">Order validation failed</p>
              <p className="text-sm text-red-700">{error.message}</p>
              <p className="text-xs text-red-600">Please review your cart and try again.</p>
            </div>
          );
        }
      }
      
      setSubmitError(errorMessage);
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (currentStep === 'order-summary') {
      handleStepComplete('order-summary');
      // Determine next step: license (if restricted items and no recent license) → invoice → address
      if (hasRestrictedItems && !hasRecentLicense) {
        setCurrentStep('license-verification');
      } else if (hasRecentInvoice) {
        handleStepComplete('invoice-verification');
        setCurrentStep('address');
      } else {
        setCurrentStep('invoice-verification');
      }
    } else if (currentStep === 'license-verification') {
      if (licenseMetadata) {
        handleStepComplete('license-verification');
        if (hasRecentInvoice) {
          handleStepComplete('invoice-verification');
          setCurrentStep('address');
        } else {
          setCurrentStep('invoice-verification');
        }
      }
    } else if (currentStep === 'invoice-verification') {
      if (invoiceMetadata) {
        handleStepComplete('invoice-verification');
        setCurrentStep('address');
      }
    } else if (currentStep === 'address') {
      // Validate invoice for shipping state (skipped when invoices are globally disabled)
      if (invoiceRequired) {
        try {
          const checkStateResponse = await fetch(`/api/invoice/check-state?state=${shippingAddress.state}`);
          if (!checkStateResponse.ok) {
            setSubmitError('Failed to verify invoice. Please try again.');
            return;
          }
          const { hasMatchingInvoice } = await checkStateResponse.json();
          if (!hasMatchingInvoice) {
            setSubmitError(
              <>
                You need an invoice for {shippingAddress.state} to ship to this address. Please upload one in{' '}
                <Link href="/account/invoices" className="text-primary hover:underline">
                  Account &gt; Invoices
                </Link>
              </>
            );
            return;
          }
        } catch {
          setSubmitError('Failed to verify invoice. Please try again.');
          return;
        }
      }

      // Validate product eligibility
      const eligibilityCheck = checkCartEligibility(
        items.map((item) => ({
          id: item.id,
          name: item.name,
          approvedStates: item.approvedStates || [],
        })),
        shippingAddress.state
      );

      if (!eligibilityCheck.allEligible) {
        setSubmitError(getIneligibilityMessage(eligibilityCheck.ineligibleProducts, shippingAddress.state));
        return;
      }

      if (isAddressValid(shippingAddress) && (sameAsShipping || isAddressValid(billingAddress))) {
        await Promise.all([
          calculateTax(),
          isTruckloadOrder
            ? (truckloadRatesFetched ? Promise.resolve() : fetchTruckloadQuote())
            : (freightRatesFetched ? Promise.resolve() : fetchFreightQuotes()),
        ]);
        handleStepComplete('address');
        setCurrentStep('payment');
        paymentIntentErrorRef.current = false;
        setSubmitError(null);
        setClientSecret(null);
      }
    }
  };

  const canProceed = () => {
    if (currentStep === 'order-summary') {
      return items.length > 0 && !isCheckingRecentInvoice && !isCheckingRecentLicense;
    }
    if (currentStep === 'license-verification') return licenseMetadata !== null;
    if (currentStep === 'invoice-verification') return invoiceMetadata !== null;
    if (currentStep === 'address') {
      return isAddressValid(shippingAddress) && (sameAsShipping || isAddressValid(billingAddress));
    }
    return false;
  };

  const getButtonText = () => {
    if (currentStep === 'order-summary') {
      if (hasRestrictedItems && !hasRecentLicense) return 'Continue to License Upload';
      return hasRecentInvoice ? 'Continue to Address' : 'Continue to Invoice Upload';
    }
    if (currentStep === 'license-verification') {
      return hasRecentInvoice ? 'Continue to Address' : 'Continue to Invoice Upload';
    }
    if (currentStep === 'invoice-verification') return 'Continue to Address';
    if (currentStep === 'address') return 'Continue to Payment';
    return '';
  };

  // ========== RENDER ==========

  if (isAuthPending) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user || !isCartReady || items.length === 0) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Order Summary */}
              <AccordionSection
                step="order-summary"
                title="Order Summary"
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepChange={setCurrentStep}
                stepNumber={1}
              >
                <div className="space-y-4">
                  {items.map((item) => {
                    // Get document proxy URL for label - ensure all S3 URLs go through proxy
                    const getDocumentUrl = (url: string | null | undefined): string | null => {
                      if (!url) return null;
                      
                      // If already a proxy URL, return as-is
                      if (url.includes('/api/images/proxy')) {
                        return url;
                      }
                      
                      // Check if it's an S3 URL (various formats)
                      const isS3Url = url.includes('s3.amazonaws.com') || 
                                     url.includes('.s3.') || 
                                     url.includes('s3-') ||
                                     (url.startsWith('https://') && url.includes('amazonaws.com/s3'));
                      
                      if (isS3Url) {
                        return `/api/images/proxy?url=${encodeURIComponent(url)}`;
                      }
                      
                      // For non-S3 URLs, return as-is (might be external or relative)
                      return url;
                    };
                    
                    // Process label URL - AGGRESSIVE S3 URL DETECTION
                    // Always convert S3 URLs to proxy to prevent Next.js Image errors
                    let labelUrl: string | null = null;
                    if (item.labelUrl) {
                      if (item.labelUrl.includes('/api/images/proxy')) {
                        // Already a proxy URL
                        labelUrl = item.labelUrl;
                      } else if (item.labelUrl.includes('amazonaws.com')) {
                        // S3 URL - convert to proxy immediately
                        labelUrl = `/api/images/proxy?url=${encodeURIComponent(item.labelUrl)}`;
                      } else {
                        // Try getImageProxyUrl first, then fallback to getDocumentUrl
                        labelUrl = getImageProxyUrl(item.labelUrl) || getDocumentUrl(item.labelUrl);
                      }
                    }
                    
                    // Extract original URL to check file type (needed for proxy URLs)
                    const getOriginalUrl = (url: string | null): string | null => {
                      if (!url) return null;
                      // If it's a proxy URL, extract the original
                      if (url.startsWith('/api/images/proxy?url=')) {
                        try {
                          return decodeURIComponent(url.split('url=')[1]);
                        } catch {
                          return url;
                        }
                      }
                      return url;
                    };
                    
                    const originalLabelUrl = getOriginalUrl(labelUrl || item.labelUrl || null);
                    
                    // Check if label is an image (check original URL, not proxy URL)
                    const isLabelImage = originalLabelUrl && (
                      originalLabelUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) || 
                      originalLabelUrl.includes('image/') ||
                      originalLabelUrl.includes('image%2F') ||
                      // Also check if the original URL contains image indicators
                      (originalLabelUrl.includes('s3') && (
                        originalLabelUrl.toLowerCase().includes('label') && 
                        !originalLabelUrl.toLowerCase().includes('.pdf')
                      ))
                    );
                    
                    // Debug logging in development
                    if (process.env.NODE_ENV === 'development') {
                      console.log('Checkout item:', {
                        id: item.id,
                        name: item.name,
                        hasLabelUrl: !!item.labelUrl,
                        labelUrl: item.labelUrl,
                        processedLabelUrl: labelUrl,
                        originalLabelUrl,
                        isLabelImage,
                        willShowLabel: !!labelUrl,
                        willUseProductLabelLink: !labelUrl,
                      });
                    }
                    
                    // Get image proxy URL for S3 images (same as store pages)
                    // Always use proxy for S3 URLs to avoid Next.js optimization issues
                    let productImageUrl: string;
                    if (!item.image) {
                      productImageUrl = '/placeholder.png';
                    } else if (item.image.includes('/api/images/proxy')) {
                      // Already a proxy URL
                      productImageUrl = item.image;
                    } else {
                      // AGGRESSIVE S3 URL DETECTION: Convert ANY URL containing amazonaws.com to proxy
                      // This prevents Next.js Image errors for all S3 URL formats
                      const isS3Url = item.image.includes('amazonaws.com');
                      
                      if (isS3Url) {
                        // Always use proxy for S3 URLs to prevent Next.js Image errors
                        productImageUrl = `/api/images/proxy?url=${encodeURIComponent(item.image)}`;
                        if (process.env.NODE_ENV === 'development') {
                          console.log('[Checkout] Converted S3 URL to proxy:', {
                            original: item.image,
                            proxy: productImageUrl,
                          });
                        }
                      } else {
                        // For non-S3 URLs, try getImageProxyUrl first
                        const proxyUrl = getImageProxyUrl(item.image);
                        if (proxyUrl) {
                          productImageUrl = proxyUrl;
                        } else {
                          // Fallback to original URL only if it's definitely not S3
                          productImageUrl = item.image;
                        }
                      }
                    }
                    
                    return (
                      <div key={item.id} className="flex gap-4 p-4 bg-white rounded-lg border border-gray-200">
                        <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                          <Image 
                            src={productImageUrl} 
                            alt={item.name} 
                            fill 
                            className="object-cover"
                            unoptimized={true}
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{item.name}</h3>
                          <p className="text-gray-600">Quantity: {item.quantity}</p>
                          <p className="text-gray-900 font-semibold mt-2">
                            <PriceWithUnit price={item.price} unitOfMeasure={item.unitOfMeasure} />
                          </p>
                          {/* Show label as thumbnail preview (matching Admin Panel style) if we have it from cart, otherwise fetch from API */}
                          {labelUrl ? (
                            <div className="mt-2 flex items-center gap-2">
                              {isLabelImage ? (
                                // Display label as thumbnail image preview (matching Admin Panel product image style)
                                // If proxy fails (403), fallback to original URL or text link
                                <LabelImageThumbnail
                                  proxyUrl={labelUrl}
                                  originalUrl={originalLabelUrl || item.labelUrl || null}
                                  productName={item.name}
                                />
                              ) : (
                                // For PDFs or other documents, show as link
                                <a
                                  href={labelUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium inline-flex items-center gap-1"
                                >
                                  <span>View Product Label</span>
                                  <span>→</span>
                                </a>
                              )}
                            </div>
                          ) : (
                            <ProductLabelLink productId={item.id} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionSection>

              {/* License Verification — only shown when cart has restricted-use products and no recent license on file */}
              {hasRestrictedItems && !hasRecentLicense && (
                <AccordionSection
                  step="license-verification"
                  title="Pesticide Applicator License"
                  currentStep={currentStep}
                  completedSteps={completedSteps}
                  onStepChange={setCurrentStep}
                  stepNumber={2}
                >
                  <LicenseUpload
                    onUploadComplete={(metadata) => {
                      setLicenseMetadata(metadata);
                      setLicenseUploadProgress({ uploading: false, error: null });
                    }}
                    onUploadStart={() => setLicenseUploadProgress({ uploading: true, error: null })}
                    onUploadError={(error) => setLicenseUploadProgress({ uploading: false, error })}
                    isUploading={licenseUploadProgress.uploading}
                    currentLicense={licenseMetadata}
                    onRemove={() => setLicenseMetadata(null)}
                  />
                </AccordionSection>
              )}

              {/* Invoice Verification */}
              {!hasRecentInvoice && (
                <AccordionSection
                  step="invoice-verification"
                  title="Invoice Verification"
                  currentStep={currentStep}
                  completedSteps={completedSteps}
                  onStepChange={setCurrentStep}
                  stepNumber={hasRestrictedItems && !hasRecentLicense ? 3 : 2}
                >
                  <InvoiceUpload
                    onUploadComplete={(metadata) => setInvoiceMetadata(metadata)}
                    onUploadStart={() => setInvoiceUploadProgress({ uploading: true, error: null })}
                    onUploadError={(error) => setInvoiceUploadProgress({ uploading: false, error })}
                    isUploading={invoiceUploadProgress.uploading}
                    currentInvoice={invoiceMetadata}
                    onRemove={() => setInvoiceMetadata(null)}
                  />
                </AccordionSection>
              )}

              {/* Address */}
              <AccordionSection
                step="address"
                title="Delivery & Address"
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepChange={setCurrentStep}
                stepNumber={(() => {
                  let n = 2;
                  if (hasRestrictedItems && !hasRecentLicense) n++;
                  if (!hasRecentInvoice) n++;
                  return n;
                })()}
              >
                <div className="space-y-6">
                  {/* Shipping Address */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4">Shipping Address</h3>
                    {isLoadingAddresses ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                        <span className="ml-3 text-gray-600">Loading saved addresses...</span>
                      </div>
                    ) : savedAddresses.length > 0 && !useNewAddress && !showAddressFormForPhone ? (
                      <SavedAddresses
                        addresses={savedAddresses}
                        selectedId={selectedAddressId}
                        onSelect={handleSelectAddress}
                        onUseNewAddress={handleUseNewAddress}
                      />
                    ) : (
                      <>
                        {showAddressFormForPhone && (
                          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-800">
                              Please enter your phone number to continue with the selected address.
                            </p>
                          </div>
                        )}
                        <AddressForm
                          address={shippingAddress}
                          onChange={setShippingAddress}
                          showBackButton={savedAddresses.length > 0}
                          onBackClick={handleBackToSavedAddresses}
                        />
                      </>
                    )}
                  </div>

                  {/* Billing Address */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="checkbox"
                        id="sameAsShipping"
                        checked={sameAsShipping}
                        onChange={(e) => setSameAsShipping(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <label htmlFor="sameAsShipping" className="font-medium cursor-pointer">
                        Billing address same as shipping
                      </label>
                    </div>
                    {!sameAsShipping && (
                      <>
                        <h3 className="font-semibold text-lg mb-4">Billing Address</h3>
                        <AddressForm address={billingAddress} onChange={setBillingAddress} />
                      </>
                    )}
                  </div>

                  {/* Delivery Options — truckload or live ShipBoss rates */}
                  <div>
                    <h3 className="font-semibold text-lg mb-4">Delivery Options</h3>
                    {!isAddressValid(shippingAddress) ? (
                      <p className="text-sm text-muted-foreground">
                        Enter your shipping address above to see available rates.
                      </p>
                    ) : isTruckloadOrder ? (
                      <TruckloadRateSelector
                        quote={truckloadQuote}
                        selectedRateId={selectedTruckloadRate?.id ?? null}
                        onSelect={(rate) => {
                          setSelectedTruckloadRate(rate);
                          setSelectedDelivery(`Truckload — ${rate.label}`);
                          setClientSecret(null);
                          paymentIntentErrorRef.current = false;
                        }}
                        loading={isFetchingTruckloadRates}
                        error={truckloadRateError}
                      />
                    ) : (
                      <>
                        <ShippingRateSelector
                          rates={freightRates}
                          selectedQuoteId={selectedFreightRate?.quoteId ?? null}
                          onSelect={(rate) => {
                            setSelectedFreightRate(rate);
                            setSelectedDelivery(`${rate.carrier} ${rate.service}`);
                            setClientSecret(null);
                            paymentIntentErrorRef.current = false;
                          }}
                          loading={isFetchingFreightRates}
                          error={freightRateError}
                          onRetry={() => {
                            setFreightRateError(null);
                            setFreightRatesFetched(false);
                          }}
                        />
                        {selectedFreightRate && (
                          <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                            <input
                              type="checkbox"
                              id="liftgateRequired"
                              checked={liftgateRequired}
                              onChange={(e) => {
                                setLiftgateRequired(e.target.checked);
                                setClientSecret(null);
                                paymentIntentErrorRef.current = false;
                              }}
                              className="mt-0.5 h-4 w-4 shrink-0 hover:cursor-pointer"
                            />
                            <label htmlFor="liftgateRequired" className="text-sm cursor-pointer select-none">
                              <span className="font-medium">I need a liftgate for delivery</span>
                              <span className="ml-1 text-muted-foreground">
                                (+25% = {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.round(baseDeliveryFeeWithWarehouse * 0.25 * 100) / 100)})
                              </span>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Required if your delivery location does not have a loading dock or forklift.
                              </p>
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </AccordionSection>

              {/* Payment */}
              <AccordionSection
                step="payment"
                title="Payment"
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepChange={setCurrentStep}
                stepNumber={(() => {
                  let n = 3;
                  if (hasRestrictedItems && !hasRecentLicense) n++;
                  if (!hasRecentInvoice) n++;
                  return n;
                })()}
              >
                {minimumOrderError && (
                  <MinimumOrderErrorMessage items={minimumOrderError} />
                )}
                {paymentsDisabled ? (
                  <div className="py-8">
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                        <AlertCircle className="h-8 w-8 text-amber-600" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-900">Payments Temporarily Unavailable</h3>
                        <p className="text-gray-600 max-w-md">
                          We&apos;re currently unable to process payments. Please contact our customer support team.
                        </p>
                      </div>
                      <div className="pt-4 space-y-2">
                        <a
                          href={`tel:${(storeInfo?.phone || '1-800-CROP-CARE').replace(/[^\d+]/g, '')}`}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                        >
                          Call {storeInfo?.phone || '1-800-CROP-CARE'}
                        </a>
                        <p className="text-sm text-gray-500">
                          or email{' '}
                          <a href={`mailto:${storeInfo?.support_email || 'support@innovativecropcare.com'}`} className="text-primary hover:underline">
                            {storeInfo?.support_email || 'support@innovativecropcare.com'}
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : isLoadingPaymentMethods || isLoadingPaymentIntent ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                    <span className="ml-3 text-gray-600">Loading payment options...</span>
                  </div>
                ) : savedPaymentMethods.length > 0 && !useNewCard ? (
                  <SavedPaymentMethods
                    methods={savedPaymentMethods}
                    selectedId={selectedPaymentMethodId}
                    onSelect={setSelectedPaymentMethodId}
                    onUseNewCard={() => setUseNewCard(true)}
                  />
                ) : clientSecret ? (
                  <div className="space-y-6">
                    {minimumOrderError && (
                      <MinimumOrderErrorMessage items={minimumOrderError} />
                    )}
                    {savedPaymentMethods.length > 0 && (
                      <div className="pb-4 border-b border-gray-200">
                        <button
                          type="button"
                          onClick={() => setUseNewCard(false)}
                          className="text-sm text-primary hover:underline"
                        >
                          ← Back to saved payment methods
                        </button>
                      </div>
                    )}
                    {stripePromise ? (
                      <Elements stripe={stripePromise} options={{ clientSecret }}>
                        <PaymentForm
                          onSuccess={handleSubmitOrder}
                          termsAccepted={termsAccepted}
                          saveCard={saveCard}
                          onSaveCardChange={setSaveCard}
                          onSubmittingChange={setIsSubmitting}
                        />
                      </Elements>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-red-600">Stripe is not configured. Please contact support.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {inventoryError ? (
                      <InventoryErrorMessage
                        items={inventoryError.items}
                        errors={inventoryError.errors}
                        onUpdateCart={() => router.push('/shop')}
                        onAdjustQuantity={(productId, newQuantity) => {
                          updateQuantity(productId, newQuantity);
                          setInventoryError(null);
                          setSubmitError(null);
                          setTimeout(() => {
                            createPaymentIntent();
                          }, 500);
                        }}
                      />
                    ) : (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600">
                          {submitError || 'Failed to initialize payment. Please try again.'}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </AccordionSection>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <OrderSidebar
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              taxAmount={taxAmount}
              taxRate={taxRate}
              total={total}
              shippingState={shippingAddress.state}
              currentStep={currentStep}
              termsAccepted={termsAccepted}
              onTermsChange={setTermsAccepted}
              isSubmitting={isSubmitting}
              isCalculatingTax={isCalculatingTax}
              submitError={submitError}
              canProceed={canProceed()}
              buttonText={getButtonText()}
              onPrimaryAction={handlePrimaryAction}
              isTruckloadOrder={isTruckloadOrder}
              selectedShippingLabel={
                !isTruckloadOrder && selectedFreightRate
                  ? `${selectedFreightRate.carrier} — ${selectedFreightRate.service}`
                  : undefined
              }
              paymentsDisabled={paymentsDisabled}
              hasSavedPaymentMethods={savedPaymentMethods.length > 0}
              useNewCard={useNewCard}
              clientSecret={clientSecret}
              selectedPaymentMethodId={selectedPaymentMethodId}
              onConfirmSavedPayment={handleConfirmSavedPayment}
              minimumOrderError={minimumOrderError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
