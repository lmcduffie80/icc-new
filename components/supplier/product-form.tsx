'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Save, Loader2, Plus, X, FileText, Upload, ExternalLink, ChevronRight, ChevronLeft } from 'lucide-react';
import { getGallonsFromContainerSize } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';

// Helper function to convert S3 URLs to proxy URLs for document viewing
const getDocumentProxyUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  
  // If already a proxy URL, return as-is
  if (url.includes('/api/images/proxy')) {
    return url;
  }
  
  // Check if it's an S3 URL (comprehensive check for various S3 URL formats)
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

// All US states for the approved states selector
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// Container size options for technical details
const CONTAINER_SIZES = ['265 Gal', '135 Gal', '2x2.5 Gal', '4x1 Gal'];

interface ProductAttributes {
  activeIngredients: string;
  epaSignalWord: string;
  epaRegistrationNumber: string;
  applicationRateRange: string;
  containerSizes: string;
  availabilityDate: string;
  weight?: string;
  packageType?: string;
}

interface Product {
  id?: string;
  name: string;
  category: string;
  price: string;
  supplier_price: string | null;
  original_price?: string | null;
  sku: string | null;
  unit_of_measure: string | null;
  image: string | null;
  approval_status?: string;
  icc_available_quantity: number;
  label_url: string | null;
  sds_url: string | null;
  admin_label_url: string | null;
  label_template_id: string | null;
  attributes: ProductAttributes | Record<string, string> | null;
  approved_states: string[];
  features: string[];
  specifications: Record<string, string> | null;
  restricted_use: boolean;
  // Margin approval fields
  margin_split_percentage?: number | null;
  margin_approval_status?: string | null;
  margin_approval_notes?: string | null;
  margin_approved_at?: string | null;
  // ICC/Customer margin breakdown
  icc_margin_percent?: string | null;
  icc_margin_amount?: string | null;
  customer_margin_percent?: string | null;
  customer_margin_amount?: string | null;
  margin_approved_by?: string | null;
}

interface SupplierProductFormProps {
  product?: Product;
}

const DEFAULT_CATEGORIES = ['Herbicides', 'Fungicides', 'Insecticides', 'Plant-Growth Regulators', 'Adjuvants'];
const epaSignalWords = ['Not Applicable', 'CAUTION', 'WARNING', 'DANGER'];

export function SupplierProductForm({ product }: SupplierProductFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'technical' | 'states' | 'inventory'>('basic');

  // Categories state
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/categories');
        if (response.ok) {
          const data = await response.json();
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
          }
        }
      } catch {
        // Keep default categories on error
      }
    }
    fetchCategories();
  }, []);

  // Units of Measure state
  const DEFAULT_UNITS_OF_MEASURE = ['unit', 'lb', 'gallon', 'case', 'bag', 'oz', 'quart'];
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<string[]>(DEFAULT_UNITS_OF_MEASURE);

  useEffect(() => {
    async function fetchUnitsOfMeasure() {
      try {
        const response = await fetch('/api/units-of-measure');
        if (response.ok) {
          const data = await response.json();
          if (data.unitsOfMeasure && data.unitsOfMeasure.length > 0) {
            setUnitsOfMeasure(data.unitsOfMeasure);
          }
        }
      } catch {
        // Keep default units on error
      }
    }
    fetchUnitsOfMeasure();
  }, []);

  // Fetch supplier warehouses
  useEffect(() => {
    async function fetchWarehouses() {
      try {
        setLoadingWarehouses(true);
        const response = await fetch('/api/supplier/warehouses');
        if (response.ok) {
          const data = await response.json();
          setWarehouses(data.warehouses || []);
        }
      } catch (error) {
        console.error('Error fetching warehouses:', error);
      } finally {
        setLoadingWarehouses(false);
      }
    }
    fetchWarehouses();
  }, []);

  // Fetch product warehouses if editing existing product
  useEffect(() => {
    async function fetchProductWarehouses() {
      if (!product?.id) return;
      
      try {
        const response = await fetch(`/api/supplier/products/${product.id}`);
        if (response.ok) {
          const data = await response.json();
          // Load all warehouses for this product
          if (data.product && data.product.warehouses && data.product.warehouses.length > 0) {
            const warehouses = data.product.warehouses.map((wh: { warehouse_id: string; inventory_count: number }) => ({
              warehouse_id: wh.warehouse_id,
              inventory_count: wh.inventory_count || 0,
            }));
            setProductWarehouses(warehouses);
            
            // For backward compatibility, set first warehouse_id
            if (warehouses.length > 0) {
              setFormData((prev) => ({
                ...prev,
                warehouse_id: warehouses[0].warehouse_id,
              }));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching product warehouses:', error);
      }
    }
    fetchProductWarehouses();
  }, [product?.id]);

  // File upload removed - SDS is view-only, managed by admin

  // Warehouse state
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; is_primary: boolean }>>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  
  // Multiple warehouse entries for this product
  interface ProductWarehouse {
    warehouse_id: string;
    inventory_count: number | string; // Allow string for empty input
  }
  const [productWarehouses, setProductWarehouses] = useState<ProductWarehouse[]>([]);

  // Helper function to calculate per-gallon price from total
  const calculatePerGallonFromTotal = (totalPrice: string, containerSize: string | null): string => {
    const gallons = getGallonsFromContainerSize(containerSize);
    if (gallons && totalPrice) {
      const total = parseFloat(totalPrice);
      if (!isNaN(total) && total > 0) {
        return (total / gallons).toFixed(4);
      }
    }
    return '';
  };

  // Helper function to calculate total price from per-gallon
  const calculateTotalFromPerGallon = (perGallon: string, containerSize: string | null): string => {
    const gallons = getGallonsFromContainerSize(containerSize);
    if (gallons && perGallon) {
      const perGal = parseFloat(perGallon);
      if (!isNaN(perGal) && perGal > 0) {
        return (perGal * gallons).toFixed(2);
      }
    }
    return '';
  };

  // Basic info
  const [formData, setFormData] = useState({
    name: product?.name || '',
    category: product?.category || DEFAULT_CATEGORIES[0],
    sku: product?.sku || '',
    price: product?.price || '',
    supplier_price: product?.original_price || product?.supplier_price || product?.price || '',
    unit_of_measure: product?.unit_of_measure || '',
    image: product?.image || '',
    restricted_use: product?.restricted_use ?? false,
    warehouse_id: '', // Deprecated - kept for backward compatibility
    margin_split_percentage: product?.margin_split_percentage?.toString() || '',
    label_template_id: product?.label_template_id || '',
  });

  // Price display state - for containers with gallon pricing, we show per-gallon input
  const [pricePerGallon, setPricePerGallon] = useState<string>(
    calculatePerGallonFromTotal(product?.price || '', product?.attributes?.containerSizes || null)
  );
  const [supplierPricePerGallon, setSupplierPricePerGallon] = useState<string>(
    calculatePerGallonFromTotal(product?.original_price || product?.supplier_price || product?.price || '', product?.attributes?.containerSizes || null)
  );

  // Update per-gallon values when container size changes or when loading existing product
  useEffect(() => {
    if (product && getGallonsFromContainerSize(product.attributes?.containerSizes)) {
      setPricePerGallon(calculatePerGallonFromTotal(product.price, product.attributes?.containerSizes || null));
      setSupplierPricePerGallon(calculatePerGallonFromTotal(product.original_price || product.supplier_price || product.price, product.attributes?.containerSizes || null));
    }
  }, [product?.price, product?.original_price, product?.supplier_price, product?.attributes?.containerSizes]);

  // Technical attributes
  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (dateString: string | undefined): string => {
    if (!dateString) return '';
    try {
      // If it's already in YYYY-MM-DD format, return as-is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
      }
      // Try to parse and format the date
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const [attributes, setAttributes] = useState<ProductAttributes>({
    activeIngredients: product?.attributes?.activeIngredients || '',
    epaSignalWord: product?.attributes?.epaSignalWord || 'Not Applicable',
    epaRegistrationNumber: product?.attributes?.epaRegistrationNumber || '',
    applicationRateRange: product?.attributes?.applicationRateRange || '',
    containerSizes: product?.attributes?.containerSizes || '',
    availabilityDate: formatDateForInput(product?.attributes?.availabilityDate),
    weight: product?.attributes?.weight || '',
    packageType: product?.attributes?.packageType || '',
  });

  // State to track if we're displaying per-gallon input based on container size
  const hasGallonPricing = getGallonsFromContainerSize(attributes.containerSizes) !== null;
  const gallons = getGallonsFromContainerSize(attributes.containerSizes);

  // Approved states
  const [approvedStates, setApprovedStates] = useState<string[]>(
    product?.approved_states || []
  );


  // Document URLs
  const [sdsUrl, setSdsUrl] = useState(product?.sds_url || '');

  // File upload removed - SDS is managed by admin

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate that at least one warehouse is selected
    const validWarehouses = productWarehouses.filter(
      pw => pw.warehouse_id && pw.warehouse_id.trim() !== ''
    );
    
    if (validWarehouses.length === 0) {
      setError('Please add at least one warehouse for this product.');
      return;
    }
    
    // Auto-calculate ICC quantity from warehouse totals
    const totalWarehouseInventory = validWarehouses.reduce(
      (sum, pw) => sum + (typeof pw.inventory_count === 'string' ? parseInt(pw.inventory_count) || 0 : pw.inventory_count || 0),
      0
    );
    
    setSaving(true);

    try {
      const url = product?.id
        ? `/api/supplier/products/${product.id}`
        : '/api/supplier/products';
      const method = product?.id ? 'PUT' : 'POST';

      // Prepare the request body - ONLY inventory data for suppliers
      const requestBody = {
          icc_available_quantity: totalWarehouseInventory,
          warehouses: validWarehouses.length > 0 ? validWarehouses.map(pw => ({
            warehouse_id: pw.warehouse_id,
            quantity: typeof pw.inventory_count === 'string' ? parseInt(pw.inventory_count) || 0 : pw.inventory_count || 0
          })) : undefined,
          // Keep warehouse_id for backward compatibility if only one warehouse
          warehouse_id: validWarehouses.length === 1 ? validWarehouses[0].warehouse_id : undefined,
          restricted_use: formData.restricted_use,
      };

      // Log the request for debugging
      console.log('Submitting product data:', requestBody);
      console.log('Valid warehouses:', validWarehouses);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        // If there are validation details, show them
        if (data.details && Array.isArray(data.details)) {
          const errorMessages = data.details
            .map((issue: { path: string[]; message: string }) => 
              `${issue.path.join('.')}: ${issue.message}`
            )
            .join('; ');
          throw new Error(errorMessages || data.error || 'Failed to save product');
        }
        throw new Error(data.error || 'Failed to save product');
      }

      // Redirect to products list after successful save (both create and update)
      router.push('/supplier/products');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  // State toggle functions removed - approved states are managed by admin

  // Tab navigation functions
  const goToNextTab = () => {
    const tabs: ('basic' | 'technical' | 'states' | 'inventory')[] = ['basic', 'technical', 'states', 'inventory'];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1]);
    }
  };

  const goToPreviousTab = () => {
    const tabs: ('basic' | 'technical' | 'states' | 'inventory')[] = ['basic', 'technical', 'states', 'inventory'];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1]);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/supplier/products"
          className="flex items-center space-x-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Products</span>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8">
            {(['basic', 'technical', 'states', 'inventory'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                  activeTab === tab
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Basic Tab */}
        {activeTab === 'basic' && (
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="product-name" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Product Name *
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="product-name"
                  type="text"
                  value={formData.name}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              <div>
                <label htmlFor="product-category" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Category *
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="product-category"
                  type="text"
                  value={formData.category}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              <div>
                <label htmlFor="product-sku" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  SKU
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="product-sku"
                  type="text"
                  value={formData.sku || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              <div>
                <label htmlFor="unit-of-measure" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Unit of Measure
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="unit-of-measure"
                  type="text"
                  value={formData.unit_of_measure || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              {/* Container Size - Moved from Technical tab */}
              <div>
                <label htmlFor="container-sizes" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Container Size
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="container-sizes"
                  type="text"
                  value={attributes.containerSizes || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              {/* Package Type */}
              <div>
                <label htmlFor="package-type" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Package Type
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="package-type"
                  type="text"
                  value={attributes.packageType || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              {/* Net Content Weight - Moved from Technical tab */}
              <div className="sm:col-span-2">
                <label htmlFor="net-content-weight" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Net Content Weight (lbs)
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="net-content-weight"
                  type="text"
                  value={attributes.weight || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
              </div>

              <div className="sm:col-start-1">
                <label htmlFor="product-price" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {hasGallonPricing ? 'Price Per Gallon (Store Price)' : 'Total Price (Store Price)'}
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    $
                  </span>
                  <input
                    id="product-price"
                    type="text"
                    value={hasGallonPricing ? (pricePerGallon || '') : (formData.price || '')}
                    className="block w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-7 pr-3 text-slate-700 cursor-not-allowed"
                    disabled
                    readOnly
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
                {hasGallonPricing && pricePerGallon && parseFloat(pricePerGallon) > 0 && (
                  <div className="mt-2 space-y-2 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">
                        Store Price Per Gallon
                      </span>
                      <span className="text-2xl font-bold text-green-700">
                        ${parseFloat(pricePerGallon).toFixed(4)}/gal
                      </span>
                    </div>
                    <div className="pt-2 border-t border-green-300 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Container:</span>
                        <span className="font-medium text-slate-700">{attributes.containerSizes} ({gallons} gallons)</span>
                      </div>
                      <div className="bg-white rounded px-2 py-1.5 border border-green-300">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-600 uppercase tracking-wide">Total Store Price:</span>
                          <span className="text-lg font-bold text-slate-900">
                            ${calculateTotalFromPerGallon(pricePerGallon, attributes.containerSizes)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Informational only</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="sm:col-start-2">
                <label htmlFor="supplier-price" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {hasGallonPricing ? 'Supplier Price Per Gallon' : 'Total Supplier Price'}
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    $
                  </span>
                  <input
                    id="supplier-price"
                    type="text"
                    value={hasGallonPricing ? (supplierPricePerGallon || '') : (formData.supplier_price || '')}
                    className="block w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-7 pr-3 text-slate-700 cursor-not-allowed"
                    disabled
                    readOnly
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Managed by administrators</p>
                {hasGallonPricing && supplierPricePerGallon && parseFloat(supplierPricePerGallon) > 0 && (
                  <div className="mt-2 space-y-2 bg-emerald-50 px-4 py-3 rounded-lg border border-emerald-200">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                        Your Price Per Gallon
                      </span>
                      <span className="text-2xl font-bold text-emerald-700">
                        ${parseFloat(supplierPricePerGallon).toFixed(4)}/gal
                      </span>
                    </div>
                    <div className="pt-2 border-t border-emerald-300 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Container:</span>
                        <span className="font-medium text-slate-700">{attributes.containerSizes} ({gallons} gallons)</span>
                      </div>
                      <div className="bg-white rounded px-2 py-1.5 border border-emerald-300">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-600 uppercase tracking-wide">Total Supplier Price:</span>
                          <span className="text-lg font-bold text-slate-900">
                            ${calculateTotalFromPerGallon(supplierPricePerGallon, attributes.containerSizes)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Informational only</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Margin Split Section */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-900">Margin Split with Platform</h3>
                {product?.margin_approval_status && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    product.margin_approval_status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : product.margin_approval_status === 'rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    Margin: {product.margin_approval_status.charAt(0).toUpperCase() + product.margin_approval_status.slice(1)}
                  </span>
                )}
              </div>

              {product?.margin_approval_status === 'rejected' && product?.margin_approval_notes && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-800">
                    <strong>Rejection Reason:</strong> {product.margin_approval_notes}
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="margin-split-percentage" className="block text-sm font-medium text-slate-700">
                    Margin Split Percentage
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="margin-split-percentage"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.margin_split_percentage}
                      className="block w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-3 pr-16 text-slate-700 cursor-not-allowed"
                      disabled
                      readOnly
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-slate-500">%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Margin split is set and approved by ICC administrators. Contact support for changes.
                  </p>
                </div>

                {/* Margin Calculation Preview */}
                {formData.price && formData.supplier_price && (
                  <div className="bg-white rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-600 mb-2">Margin Preview (per unit)</p>
                    {(() => {
                      const storePrice = parseFloat(formData.price) || 0;
                      const supplierCost = parseFloat(formData.supplier_price) || 0;
                      const margin = storePrice - supplierCost;
                      const splitPercentage = parseFloat(formData.margin_split_percentage) || 0;
                      const platformShare = margin * (splitPercentage / 100);
                      const supplierKeeps = margin - platformShare;

                      return (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Store Price:</span>
                            <span className="font-medium">${storePrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Your Cost:</span>
                            <span className="font-medium">${supplierCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200 pt-1">
                            <span className="text-slate-500">Margin:</span>
                            <span className="font-medium">${margin.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Platform Share ({splitPercentage}%):</span>
                            <span className="font-medium text-slate-600">${platformShare.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200 pt-1">
                            <span className="text-slate-700 font-medium">You Keep:</span>
                            <span className="font-semibold text-green-600">${supplierKeeps.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Gallon pricing helper - NEW POSITION */}
            {!hasGallonPricing && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <svg className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-blue-900">Per-Gallon Pricing Available</p>
                    <p className="text-sm text-blue-700 mt-1">
                      For products in gallon containers (265 Gal, 135 Gal, 2x2.5 Gal, 4x1 Gal), 
                      select a Container Size above. Then you can enter per-gallon prices here and the total 
                      will be calculated automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Margin Breakdown - Read-only display */}
            {product && product.icc_margin_percent !== undefined && product.icc_margin_percent !== null && product.customer_margin_percent !== undefined && product.customer_margin_percent !== null && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center justify-between">
                  <span>Margin Breakdown</span>
                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Store Price (Customer Pays)</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        ${parseFloat(product.price).toFixed(2)}
                      </span>
                      <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">ICC Margin ({parseFloat(product.icc_margin_percent).toFixed(1)}%)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600">
                        -${product.icc_margin_amount ? parseFloat(product.icc_margin_amount).toFixed(2) : '0.00'}
                      </span>
                      <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Customer Savings ({parseFloat(product.customer_margin_percent).toFixed(1)}%)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600">
                        -${product.customer_margin_amount ? parseFloat(product.customer_margin_amount).toFixed(2) : '0.00'}
                      </span>
                      <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-900">Your Cost (Supplier Price)</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-slate-900">
                          ${product.supplier_price ? parseFloat(product.supplier_price).toFixed(2) : '0.00'}
                        </span>
                        <svg className="h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {product.margin_approved_at && (
                    <div className="pt-3 text-xs text-slate-500 flex items-center justify-between">
                      <span>Last updated: {new Date(product.margin_approved_at).toLocaleDateString()}</span>
                      <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  )}
                </div>
                
                <div className="mt-4 rounded-md bg-blue-50 border border-blue-200 p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> This margin breakdown is set by ICC administrators and cannot be modified. The distribution of margin between ICC and customer savings may be adjusted by admins to maintain competitive pricing.
                  </p>
                </div>
              </div>
            )}

            {/* Product Image - Display Admin Approved Label Only */}
            {(product?.admin_label_url || product?.label_url) && (
              <div>
                <span className="block text-sm font-medium text-slate-700">Product Image</span>
                <div className="mt-2">
                  <Image
                    src={getImageProxyUrl(product.admin_label_url || product.label_url) || product.admin_label_url || product.label_url || ''}
                    alt="Product Label"
                    width={200}
                    height={200}
                    className="rounded-lg object-cover border border-slate-200"
                    unoptimized
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Product label approved by administrators. Contact support if changes are needed.
                  </p>
                </div>
              </div>
            )}

            {/* SDS - View Only */}
            <div>
              <span className="block text-sm font-medium text-slate-700">SDS (Safety Data Sheet)</span>
              {sdsUrl ? (
                <div className="mt-2 flex items-center space-x-4">
                  <a
                    href={getDocumentProxyUrl(sdsUrl) || sdsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-sm text-green-600 hover:text-green-800"
                  >
                    <FileText className="h-4 w-4" />
                    <span>View SDS</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No SDS document uploaded</p>
              )}
              <p className="mt-2 text-xs text-slate-500">SDS documents are managed by administrators</p>
            </div>

            {/* Product Label Display */}
            {product?.label_url && (
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-2">Product Label</span>
                <div className="rounded-md bg-slate-50 p-3 border border-slate-200">
                  <div className="flex items-center space-x-3">
                    <Image
                      src={getImageProxyUrl(product.label_url) || product.label_url}
                      alt="Product Label"
                      width={80}
                      height={80}
                      className="rounded-lg object-cover"
                      unoptimized
                    />
                    <a
                      href={getDocumentProxyUrl(product.label_url) || product.label_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 hover:text-green-800 underline"
                    >
                      View Full Label
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Label Display (if different from template label) */}
            {product?.admin_label_url && (
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-2">Admin Modified Label</span>
                <div className="rounded-md bg-blue-50 p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Admin Modified Label:</strong>{' '}
                    <a
                      href={getDocumentProxyUrl(product.admin_label_url) || product.admin_label_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View Admin Label
                    </a>
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
              <input
                type="checkbox"
                id="restricted_use"
                checked={formData.restricted_use}
                className="h-4 w-4 rounded border-slate-300 text-slate-400 cursor-not-allowed"
                disabled
                readOnly
              />
              <label htmlFor="restricted_use" className="text-sm text-slate-700 flex items-center gap-2">
                Restricted Use Product
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </label>
              <p className="text-xs text-slate-500">(Managed by administrators)</p>
            </div>

            {/* Navigation for Basic Tab */}
            <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={goToNextTab}
                className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Technical Tab */}
        {activeTab === 'technical' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> All technical details are managed by administrators. 
                Please contact support if you notice any errors.
              </p>
            </div>
            
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="active-ingredients" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Active Ingredients
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="active-ingredients"
                  type="text"
                  value={attributes.activeIngredients || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
              </div>

              <div>
                <label htmlFor="epa-signal-word" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  EPA Signal Word
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="epa-signal-word"
                  type="text"
                  value={attributes.epaSignalWord || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
              </div>

              <div>
                <label htmlFor="epa-registration-number" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  EPA Registration Number
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="epa-registration-number"
                  type="text"
                  value={attributes.epaRegistrationNumber || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
              </div>

              <div>
                <label htmlFor="application-rate-range" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Application Rate Range
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="application-rate-range"
                  type="text"
                  value={attributes.applicationRateRange || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
              </div>

              <div>
                <label htmlFor="availability-date" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Availability Date
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </label>
                <input
                  id="availability-date"
                  type="text"
                  value={attributes.availabilityDate || ''}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 cursor-not-allowed"
                  disabled
                  readOnly
                />
              </div>
            </div>

            {/* Navigation for Technical Tab */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={goToPreviousTab}
                className="flex items-center space-x-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={goToNextTab}
                className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* States Tab */}
        {activeTab === 'states' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Approved states are determined by administrators based on 
                product registration and regulatory requirements.
              </p>
            </div>
            
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-slate-700">
                States where this product is approved for sale ({approvedStates.length} states)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {US_STATES.map((state) => (
                <label
                  key={state}
                  className={`flex items-center space-x-2 rounded-md border p-3 ${
                    approvedStates.includes(state)
                      ? 'border-green-300 bg-green-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={approvedStates.includes(state)}
                    className="h-4 w-4 rounded border-slate-300 cursor-not-allowed"
                    disabled
                    readOnly
                  />
                  <span className="text-sm text-slate-700">{state}</span>
                </label>
              ))}
            </div>

            {/* Navigation for States Tab */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={goToPreviousTab}
                className="flex items-center space-x-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={goToNextTab}
                className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-2">
                Product Warehouses *
              </span>
              {loadingWarehouses ? (
                <div className="mt-1 text-sm text-slate-500">Loading warehouses...</div>
              ) : warehouses.length === 0 ? (
                <div className="mt-1 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    No warehouses found. Please{' '}
                    <Link href="/supplier/warehouses" className="underline hover:text-yellow-900">
                      add a warehouse
                    </Link>{' '}
                    before creating a product.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {productWarehouses.map((pw, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                      <div className="flex-1">
                        <select
                          value={pw.warehouse_id}
                          onChange={(e) => {
                            const updated = [...productWarehouses];
                            updated[index].warehouse_id = e.target.value;
                            setProductWarehouses(updated);
                          }}
                          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
                        >
                          <option value="">Select warehouse...</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name} {warehouse.is_primary && '(Primary)'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          min="0"
                          value={pw.inventory_count}
                          onChange={(e) => {
                            const updated = [...productWarehouses];
                            // Allow empty string for clearing, otherwise parse as number
                            updated[index].inventory_count = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                            setProductWarehouses(updated);
                          }}
                          placeholder="Qty"
                          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProductWarehouses(productWarehouses.filter((_, i) => i !== index));
                        }}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                        title="Remove warehouse"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setProductWarehouses([...productWarehouses, { warehouse_id: '', inventory_count: '' }]);
                    }}
                    disabled={productWarehouses.length >= warehouses.length}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4" />
                    Add Warehouse
                  </button>
                  {productWarehouses.length === 0 && (
                    <div className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                      <p className="text-sm text-yellow-800">
                        Please add at least one warehouse for this product.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Add one or more warehouses where this product is stored. You can distribute inventory across multiple warehouses.
              </p>
            </div>

            <div>
              <div className="block text-sm font-medium text-slate-700">
                ICC Available Quantity (Auto-calculated)
              </div>
              <div className="mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-slate-900">
                    {(() => {
                      const validWarehouses = productWarehouses.filter(
                        pw => pw.warehouse_id && pw.warehouse_id.trim() !== ''
                      );
                      const total = validWarehouses.reduce(
                        (sum, pw) => sum + (typeof pw.inventory_count === 'string' ? parseInt(pw.inventory_count) || 0 : pw.inventory_count || 0),
                        0
                      );
                      return total;
                    })()}
                  </span>
                  <span className="text-sm text-slate-500">units</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Automatically calculated from warehouse quantities
              </p>
            </div>

            {/* Navigation and Submit for Inventory Tab */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={goToPreviousTab}
                className="flex items-center space-x-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <div className="flex items-center space-x-4">
                <Link
                  href="/supplier/products"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>{product?.id ? 'Update Product' : 'Create Product'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

