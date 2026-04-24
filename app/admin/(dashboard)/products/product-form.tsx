'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Save, Loader2, Plus, X, FileText, Upload, ImageIcon, Trash2, ExternalLink, Sparkles } from 'lucide-react';
import { ProductWarehousesSection } from './product-warehouses-section';
import { MarginManagementTable } from '@/components/admin/margin-management-table';
import imageCompression from 'browser-image-compression';
import { getGallonsFromContainerSize } from '@/lib/utils';

// All US states for the approved states selector
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

// Container size options for technical details
const CONTAINER_SIZES = [
  '265 gal tote',
  '135 gal tote',
  '30 gal drum',
  '2x2.5 gal',
  '4x1 gal',
  '2x1 gal',
  '1 gal',
  '1 qt',
  '1 lb',
  '25 lb bag',
  '50 lb bag',
];

const PACKAGE_TYPES = ['Tote', 'Case', 'Drum', 'Jug', 'Bag', 'Pallet', 'Bottle', 'Bucket', 'Other'];

// Helper function to convert S3 URLs to proxy URLs for document viewing
const getDocumentProxyUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.includes('/api/images/proxy')) return url;
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

interface ProductAttributes {
  activeIngredients: string;
  epaSignalWord: string;
  epaRegistrationNumber: string;
  applicationRateRange: string;
  containerSizes: string;
  availabilityDate: string;
  weight?: string;
  packageType?: string;
  lbsPerGallon?: string;
}

interface ProductDocument {
  name: string;
  url: string;
}

interface LabelTemplate {
  id: string;
  product_name: string;
  template_name: string;
  label_image_url: string;
  short_description: string;
  long_description: string | null;
}

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  full_description: string | null;
  sku: string | null;
  price: string;
  original_price: string | null;
  msrp: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  rating: string | null;
  review_count: number | null;
  minimum_order_qty: number | null;
  next_available_quantity: number | null;
  next_available_date: string | null;
  nmfc_number: string | null;
  carton_length: string | null;
  carton_width: string | null;
  carton_height: string | null;
  carton_weight_lbs: string | null;
  truckload_eligible: boolean;
  gallons_per_case: number | null;
  cases_per_pallet: number | null;
  bulk_density_lbs_per_gallon: number | null;
  attributes: ProductAttributes | null;
  approved_states: string[] | null;
  features: string[] | null;
  specifications: Record<string, string> | null;
  documents: ProductDocument[] | null;
  sds_url?: string | null;
  restricted_use: boolean;
  supplier_id?: string | null;
  supplier_price?: string | null;
  icc_margin_percent?: string | null;
  icc_margin_amount?: string | null;
  customer_margin_percent?: string | null;
  customer_margin_amount?: string | null;
  margin_split_percentage?: string | null;
  margin_approval_status?: string;
  margin_approved_at?: string | null;
  margin_approved_by?: string | null;
  margin_notes?: string | null;
  admin_proposed_margin_percent?: string | null;
  margin_proposal_source?: string | null;
  supplier_margin_approval_status?: string | null;
  label_template_id?: string | null;
  compared_to?: string | null;
  nmfc_ai_suggestion?: string | null;
  nmfc_ai_reasoning?: string | null;
  nmfc_ai_status?: string | null;
  freight_class?: string | null;
  freight_class_ai_suggestion?: string | null;
}

interface ProductFormProps {
  product?: Product;
}

const DEFAULT_CATEGORIES = ['Herbicides', 'Fungicides', 'Insecticides', 'Plant-Growth Regulators', 'Adjuvants'];
const epaSignalWords = ['Not Applicable', 'CAUTION', 'WARNING', 'DANGER'];

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const imageInputId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [skuError, setSkuError] = useState('');
  const [marginError, setMarginError] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'technical' | 'states' | 'content'>('basic');

  // Margin proposal state — lifted from MarginManagementTable so Save Product can trigger it
  const [marginPercent, setMarginPercent] = useState<string>(
    product?.admin_proposed_margin_percent ?? product?.margin_split_percentage ?? '0'
  );
  const [marginNotes, setMarginNotes] = useState('');
  
  // Document upload state
  const [documentUploading, setDocumentUploading] = useState<Record<number, boolean>>({});
  const [documentUploadError, setDocumentUploadError] = useState<Record<number, string>>({});
  const documentInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // SDS upload state
  const [sdsUrl, setSdsUrl] = useState<string>(product?.sds_url || '');
  const [sdsUploading, setSdsUploading] = useState(false);
  const [sdsUploadError, setSdsUploadError] = useState('');
  const sdsInputRef = useRef<HTMLInputElement>(null);

  // NMFC AI suggestion state
  const [nmfcAiSuggestion, setNmfcAiSuggestion] = useState<string | null>(product?.nmfc_ai_suggestion ?? null);
  const [nmfcAiReasoning, setNmfcAiReasoning] = useState<string | null>(product?.nmfc_ai_reasoning ?? null);
  const [nmfcAiStatus, setNmfcAiStatus] = useState<string | null>(product?.nmfc_ai_status ?? null);
  const [freightClassAiSuggestion, setFreightClassAiSuggestion] = useState<string | null>(product?.freight_class_ai_suggestion ?? null);
  const [nmfcAiLoading, setNmfcAiLoading] = useState(false);
  const [nmfcAiError, setNmfcAiError] = useState<string | null>(null);

  // Categories state
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  // Fetch categories from API
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

  // Fetch units of measure from API
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

  // Supplier ID state for assignment
  const [supplierId, setSupplierId] = useState<string>(product?.supplier_id || '');

  // Track if product has warehouses
  const [hasWarehouses, setHasWarehouses] = useState(false);

  // Check for warehouses and sync inventory_count
  useEffect(() => {
    if (!product) return;
    
    const currentProduct = product; // Capture for closure
    
    if (currentProduct.id) {
      async function checkWarehouses() {
        try {
          const response = await fetch(`/api/admin/products/${currentProduct.id}/warehouses`);
          if (response.ok) {
            const data = await response.json();
            const warehouses = data.warehouses || [];
            const hasWarehouseEntries = warehouses.length > 0;
            setHasWarehouses(hasWarehouseEntries);
            
            if (hasWarehouseEntries) {
              // Calculate total from warehouses
              const total = warehouses.reduce((sum: number, pw: { inventory_count: number }) =>
                sum + (pw.inventory_count || 0), 0
              );
              // Update form data with warehouse total
              setFormData(prev => ({
                ...prev,
                inventory_count: total,
                in_stock: total > 0,
              }));
            } else {
              // No warehouses - use product inventory_count
              const calculatedInStock = (currentProduct.inventory_count ?? 0) > 0;
              setFormData(prev => ({
                ...prev,
                in_stock: calculatedInStock,
                inventory_count: currentProduct.inventory_count ?? 0,
              }));
            }
          }
        } catch (error) {
          console.error('Error checking warehouses:', error);
        }
      }
      checkWarehouses();
    } else {
      // Product exists but no ID yet (new product) - initialize from product data
      const calculatedInStock = (currentProduct.inventory_count ?? 0) > 0;
      setFormData(prev => ({
        ...prev,
        in_stock: calculatedInStock,
        inventory_count: currentProduct.inventory_count ?? 0,
      }));
      setHasWarehouses(false);
    }
  }, [product?.id, product?.inventory_count, product]);

  // Image upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [compressionStatus, setCompressionStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Label templates
  const [labelTemplates, setLabelTemplates] = useState<LabelTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Supplier selection for assignment
  const [suppliers, setSuppliers] = useState<Array<{
    id: string;
    company_name: string;
    email: string;
    supplier_number: string;
    is_active: boolean;
  }>>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Basic info
  const [formData, setFormData] = useState({
    name: product?.name || '',
    category: product?.category || DEFAULT_CATEGORIES[0],
    supplier_id: product?.supplier_id || '',
    description: product?.description || '',
    full_description: product?.full_description || '',
    sku: product?.sku || '',
    price: product?.price || '',
    original_price: product?.original_price || '',
    msrp: product?.msrp || '',
    unit_of_measure: product?.unit_of_measure || '',
    image: product?.image || '',
    in_stock: (product?.inventory_count ?? 0) > 0, // Automatically set based on inventory
    inventory_count: product?.inventory_count ?? 0,
    rating: product?.rating || '',
    review_count: product?.review_count ?? 0,
    minimum_order_qty: product?.minimum_order_qty ?? null,
    next_available_quantity: product?.next_available_quantity ?? null,
    next_available_date: product?.next_available_date 
      ? (() => {
          const date = product.next_available_date;
          // pg-types parses DATE columns as JS Date objects at runtime even though
          // the interface types the field as string | null. Cast through unknown to
          // call toISOString() safely and get a stable YYYY-MM-DD string.
          if ((date as unknown) instanceof Date) {
            return (date as unknown as Date).toISOString().split('T')[0];
          }
          if (typeof date === 'string') {
            // Handle ISO string (YYYY-MM-DDTHH:mm:ss.sssZ) or date string (YYYY-MM-DD)
            return date.split('T')[0];
          }
          return '';
        })()
      : '',
    restricted_use: product?.restricted_use ?? false,
    icc_margin_percent: product?.icc_margin_percent || '',
    margin_notes: product?.margin_notes || '',
    label_template_id: product?.label_template_id || '',
    compared_to: product?.compared_to || '',
    nmfc_number: product?.nmfc_number || '',
    freight_class: product?.freight_class ||
      (product?.nmfc_ai_status === 'accepted' ? (product?.freight_class_ai_suggestion || '') : '') ||
      '',
    carton_length: product?.carton_length || '',
    carton_width: product?.carton_width || '',
    carton_height: product?.carton_height || '',
    carton_weight_lbs: product?.carton_weight_lbs || '',
    truckload_eligible: product?.truckload_eligible ?? false,
    gallons_per_case: product?.gallons_per_case ?? null,
    cases_per_pallet: product?.cases_per_pallet ?? null,
    bulk_density_lbs_per_gallon: product?.bulk_density_lbs_per_gallon ?? null,
  });

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

  // Price display state - for containers with gallon pricing, we show per-gallon input
  const [pricePerGallon, setPricePerGallon] = useState<string>(
    calculatePerGallonFromTotal(product?.price || '', product?.attributes?.containerSizes || null)
  );
  const [originalPricePerGallon, setOriginalPricePerGallon] = useState<string>(
    calculatePerGallonFromTotal(product?.original_price || '', product?.attributes?.containerSizes || null)
  );
  const [msrpPerGallon, setMsrpPerGallon] = useState<string>(
    calculatePerGallonFromTotal(product?.msrp || '', product?.attributes?.containerSizes || null)
  );

  // Update per-gallon values when container size changes or when loading existing product
  useEffect(() => {
    if (product && getGallonsFromContainerSize(product.attributes?.containerSizes)) {
      setPricePerGallon(calculatePerGallonFromTotal(product.price, product.attributes?.containerSizes || null));
      if (product.original_price) {
        setOriginalPricePerGallon(calculatePerGallonFromTotal(product.original_price, product.attributes?.containerSizes || null));
      }
      if (product.msrp) {
        setMsrpPerGallon(calculatePerGallonFromTotal(product.msrp, product.attributes?.containerSizes || null));
      }
    }
  }, [product?.price, product?.original_price, product?.msrp, product?.attributes?.containerSizes]);

  // Technical attributes
  const [attributes, setAttributes] = useState<ProductAttributes>({
    activeIngredients: product?.attributes?.activeIngredients || '',
    epaSignalWord: product?.attributes?.epaSignalWord || 'Not Applicable',
    epaRegistrationNumber: product?.attributes?.epaRegistrationNumber || '',
    applicationRateRange: product?.attributes?.applicationRateRange || '',
    containerSizes: product?.attributes?.containerSizes || '',
    availabilityDate: product?.attributes?.availabilityDate || '',
    weight: product?.attributes?.weight || '',
    packageType: product?.attributes?.packageType || '',
    lbsPerGallon: product?.attributes?.lbsPerGallon || '',
  });

  // State to track if we're displaying per-gallon input based on container size
  const hasGallonPricing = getGallonsFromContainerSize(attributes.containerSizes) !== null;
  const gallons = getGallonsFromContainerSize(attributes.containerSizes);

  // Approved states
  const [approvedStates, setApprovedStates] = useState<string[]>(
    product?.approved_states || []
  );

  // Features (array of strings) - ensure it's always an array
  const [features, setFeatures] = useState<string[]>(
    Array.isArray(product?.features) ? product.features : ['']
  );

  // Specifications (key-value pairs) - ensure it's always an array
  const [specifications, setSpecifications] = useState<{ key: string; value: string }[]>(
    product?.specifications && typeof product.specifications === 'object' && !Array.isArray(product.specifications)
      ? Object.entries(product.specifications).map(([key, value]) => ({ key, value: String(value) }))
      : [{ key: '', value: '' }]
  );

    // Documents - ensure it's always an array
  const [documents, setDocuments] = useState<ProductDocument[]>(
    Array.isArray(product?.documents) ? product.documents : [{ name: '', url: '' }]
  );

  // Fetch label templates when product name changes
  useEffect(() => {
    if (formData.name && formData.name.length >= 3) {
      setLoadingTemplates(true);
      fetch(`/api/admin/label-templates?product_name=${encodeURIComponent(formData.name)}&approval_status=approved`)
        .then(res => res.json())
        .then(data => {
          setLabelTemplates(data.templates || []);
          setLoadingTemplates(false);
        })
        .catch(error => {
          console.error('Error fetching label templates:', error);
          setLabelTemplates([]);
          setLoadingTemplates(false);
        });
    } else {
      setLabelTemplates([]);
    }
  }, [formData.name]);

  // Fetch active suppliers for assignment
  useEffect(() => {
    setLoadingSuppliers(true);
    fetch('/api/admin/suppliers/list')
      .then(res => res.json())
      .then(data => {
        setSuppliers(data.suppliers || []);
        setLoadingSuppliers(false);
      })
      .catch(error => {
        console.error('Error fetching suppliers:', error);
        setSuppliers([]);
        setLoadingSuppliers(false);
      });
  }, []);

  const handleNmfcClassify = async () => {
    if (!formData.name) return;
    setNmfcAiLoading(true);
    try {
      // Always use the stateless endpoint with current form data — works for both new and existing products
      const res = await fetch('/api/admin/products/nmfc-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          category: formData.category || null,
          unit_of_measure: formData.unit_of_measure || null,
          carton_length: formData.carton_length ? parseFloat(formData.carton_length) : null,
          carton_width: formData.carton_width ? parseFloat(formData.carton_width) : null,
          carton_height: formData.carton_height ? parseFloat(formData.carton_height) : null,
          carton_weight_lbs: formData.carton_weight_lbs
            ? parseFloat(formData.carton_weight_lbs)
            : (attributes.weight ? parseFloat(attributes.weight) : null),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNmfcAiSuggestion(data.nmfc_number);
        setNmfcAiReasoning(data.reasoning);
        setNmfcAiStatus('pending');
        setFreightClassAiSuggestion(data.freight_class ?? null);

        // For existing products, persist the suggestion to the DB (fire-and-forget)
        if (product?.id) {
          fetch(`/api/admin/products/${product.id}/nmfc-classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nmfc_number: data.nmfc_number,
              reasoning: data.reasoning,
              freight_class: data.freight_class ?? null,
            }),
          }).catch(() => {});
        }
      }
    } catch {
      // Silently fail
    } finally {
      setNmfcAiLoading(false);
    }
  };

  const handleNmfcAccept = async () => {
    if (!nmfcAiSuggestion) return;
    setNmfcAiLoading(true);
    setNmfcAiError(null);
    try {
      if (product?.id) {
        // Existing product — persist acceptance to DB.
        // Pass inline suggestion so accept works even if the fire-and-forget DB save hadn't completed.
        const res = await fetch(`/api/admin/products/${product.id}/nmfc-classify/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'accept',
            nmfc_number: nmfcAiSuggestion,
            reasoning: nmfcAiReasoning ?? '',
            freight_class: freightClassAiSuggestion ?? null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setFormData((prev) => ({
            ...prev,
            nmfc_number: nmfcAiSuggestion,
            freight_class: data.freight_class ?? freightClassAiSuggestion ?? prev.freight_class,
          }));
          setNmfcAiStatus('accepted');
        } else {
          const err = await res.json().catch(() => ({}));
          setNmfcAiError((err as { error?: string }).error ?? `Failed to accept (${res.status})`);
        }
      } else {
        // New product — apply directly to form state (no DB record yet)
        setFormData((prev) => ({
          ...prev,
          nmfc_number: nmfcAiSuggestion,
          freight_class: freightClassAiSuggestion ?? prev.freight_class,
        }));
        setNmfcAiStatus('accepted');
      }
    } catch (err) {
      setNmfcAiError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setNmfcAiLoading(false);
    }
  };

  const handleNmfcReject = async () => {
    setNmfcAiLoading(true);
    try {
      if (product?.id) {
        // Existing product — persist rejection to DB
        const res = await fetch(`/api/admin/products/${product.id}/nmfc-classify/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject' }),
        });
        if (res.ok) {
          setNmfcAiStatus('rejected');
        }
      } else {
        // New product — just clear the suggestion from state
        setNmfcAiStatus('rejected');
      }
    } catch {
      // Silently fail
    } finally {
      setNmfcAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSkuError('');
    setSaving(true);

    // Check required fields
    if (!formData.supplier_id) {
      setError('Please select a supplier');
      setSaving(false);
      return;
    }

    try {
      const url = product
        ? `/api/admin/products/${product.id}`
        : '/api/admin/products';
      const method = product ? 'PUT' : 'POST';

      // Convert specifications array to object
      const specsObject: Record<string, string> = {};
      specifications.forEach((spec) => {
        if (spec.key.trim()) {
          specsObject[spec.key.trim()] = spec.value;
        }
      });

      // Filter empty features
      const filteredFeatures = features.filter((f) => f.trim());

      // Filter empty documents
      const filteredDocuments = documents.filter((d) => d.name.trim() && d.url.trim());

      // For container sizes with gallon pricing, convert per-gallon price to total price before saving
      const hasGallonPricingForSubmit = getGallonsFromContainerSize(attributes.containerSizes) !== null;
      const finalPrice = hasGallonPricingForSubmit && pricePerGallon
        ? parseFloat(calculateTotalFromPerGallon(pricePerGallon, attributes.containerSizes))
        : parseFloat(formData.price);
      
      const finalOriginalPrice = hasGallonPricingForSubmit && originalPricePerGallon
        ? parseFloat(calculateTotalFromPerGallon(originalPricePerGallon, attributes.containerSizes))
        : (formData.original_price ? parseFloat(formData.original_price) : null);

      const finalMsrp = hasGallonPricingForSubmit && msrpPerGallon
        ? parseFloat(calculateTotalFromPerGallon(msrpPerGallon, attributes.containerSizes))
        : (formData.msrp ? parseFloat(formData.msrp) : null);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          supplier_id: formData.supplier_id || undefined,
          price: finalPrice,
          original_price: finalOriginalPrice,
          msrp: finalMsrp,
          unit_of_measure: formData.unit_of_measure || null,
          rating: formData.rating ? parseFloat(formData.rating) : null,
          minimum_order_qty: formData.minimum_order_qty || null,
          next_available_quantity: formData.next_available_quantity || null,
          next_available_date: formData.next_available_date && formData.next_available_date.trim() !== '' 
            ? formData.next_available_date.trim() 
            : null,
          attributes,
          approved_states: approvedStates,
          features: filteredFeatures,
          specifications: specsObject,
          documents: filteredDocuments,
          sds_url: sdsUrl || null,
          label_template_id: formData.label_template_id || undefined,
          nmfc_number: formData.nmfc_number || null,
          carton_length: formData.carton_length ? parseFloat(formData.carton_length) : null,
          carton_width: formData.carton_width ? parseFloat(formData.carton_width) : null,
          carton_height: formData.carton_height ? parseFloat(formData.carton_height) : null,
          carton_weight_lbs: formData.carton_weight_lbs ? parseFloat(formData.carton_weight_lbs) : null,
          gallons_per_case: formData.gallons_per_case ?? null,
          cases_per_pallet: formData.cases_per_pallet ?? null,
          bulk_density_lbs_per_gallon: formData.bulk_density_lbs_per_gallon ?? null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 409) {
          setSkuError(data.error || 'This SKU is already in use.');
          setSaving(false);
          return;
        }
        throw new Error(data.error || 'Failed to save product');
      }

      const savedProduct = await response.json();
      const savedProductId = product?.id || savedProduct?.id;

      // If a supplier is assigned and a margin percent is set, propose the margin
      const effectiveSupplierId = formData.supplier_id || product?.supplier_id;
      const marginPercentNum = parseFloat(marginPercent);
      if (effectiveSupplierId && savedProductId && !isNaN(marginPercentNum) && marginPercentNum >= 0) {
        const existingMargin = parseFloat(
          product?.admin_proposed_margin_percent ?? product?.margin_split_percentage ?? '0'
        );
        const marginChanged = marginPercentNum.toFixed(2) !== existingMargin.toFixed(2);

        if (marginChanged || !product) {
          try {
            const marginRes = await fetch(`/api/admin/products/${savedProductId}/margin/propose`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                margin_percent: marginPercentNum,
                notes: marginNotes.trim() || undefined,
              }),
            });
            if (!marginRes.ok) {
              const marginData = await marginRes.json();
              setMarginError(marginData.error || 'Product saved, but margin proposal failed.');
            }
          } catch {
            setMarginError('Product saved, but margin proposal could not be sent.');
          }
        }
      }

      // Redirect to products list after successful save
      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const toggleState = (state: string) => {
    setApprovedStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  const selectAllStates = () => setApprovedStates([...US_STATES]);
  const clearAllStates = () => setApprovedStates([]);

  const addFeature = () => setFeatures([...features, '']);
  const removeFeature = (index: number) =>
    setFeatures(features.filter((_, i) => i !== index));
  const updateFeature = (index: number, value: string) => {
    const updated = [...features];
    updated[index] = value;
    setFeatures(updated);
  };

  const addSpecification = () => setSpecifications([...specifications, { key: '', value: '' }]);
  const removeSpecification = (index: number) =>
    setSpecifications(specifications.filter((_, i) => i !== index));
  const updateSpecification = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...specifications];
    updated[index][field] = value;
    setSpecifications(updated);
  };

  const addDocument = () => setDocuments([...documents, { name: '', url: '' }]);
  const removeDocument = (index: number) =>
    setDocuments(documents.filter((_, i) => i !== index));
  const updateDocument = (index: number, field: 'name' | 'url', value: string) => {
    const updated = [...documents];
    updated[index][field] = value;
    setDocuments(updated);
  };

  // Label template selection handler
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    
    if (!templateId) {
      return;
    }

    const template = labelTemplates.find(t => t.id === templateId);
    if (template) {
      setFormData(prev => ({
        ...prev,
        description: template.short_description,
        full_description: template.long_description || '',
        label_template_id: templateId,
      }));
    }
  };

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    setUploadError('');
    setCompressionStatus('');

    try {
      // Step 1: Compress image before upload
      const originalSize = (file.size / 1024 / 1024).toFixed(2);
      setCompressionStatus(`Optimizing image (${originalSize}MB)...`);

      const options = {
        maxSizeMB: 1, // Compress to max 1MB
        maxWidthOrHeight: 2048, // Max dimension 2048px
        useWebWorker: true, // Use web worker for better performance
        fileType: 'image/jpeg', // Convert to JPEG for smaller size
      };
      
      const compressedFile = await imageCompression(file, options);
      const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
      
      // Show compression results
      console.log(`Image compressed: ${originalSize}MB → ${compressedSize}MB`);
      setCompressionStatus(`Optimized: ${originalSize}MB → ${compressedSize}MB`);

      // Step 2: Get presigned URL from API
      setCompressionStatus('Getting upload URL...');
      const response = await fetch('/api/admin/products/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: compressedFile.type,
          fileName: compressedFile.name || file.name,
          size: compressedFile.size,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await response.json();

      // Step 3: Upload compressed file directly to S3
      setCompressionStatus(`Uploading ${compressedSize}MB to S3...`);
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: compressedFile,
        headers: {
          'Content-Type': compressedFile.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      // Step 4: Update form with the public URL
      setCompressionStatus('Upload complete!');
      setFormData({ ...formData, image: publicUrl });
      
      // Clear success message after 3 seconds
      setTimeout(() => setCompressionStatus(''), 3000);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err instanceof Error ? err.message : 'Failed to upload image');
      setCompressionStatus('');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = () => {
    setFormData({ ...formData, image: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Document upload handler
  const handleDocumentUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate PDF
    if (file.type !== 'application/pdf') {
      setDocumentUploadError({ ...documentUploadError, [index]: 'Only PDF files are allowed' });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setDocumentUploadError({ ...documentUploadError, [index]: 'File must be less than 10MB' });
      return;
    }
    
    setDocumentUploading({ ...documentUploading, [index]: true });
    setDocumentUploadError({ ...documentUploadError, [index]: '' });
    
    try {
      // Step 1: Get presigned URL from new endpoint
      const response = await fetch('/api/admin/products/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type,
          fileName: file.name,
          size: file.size,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get upload URL');
      }
      
      const { uploadUrl, publicUrl } = await response.json();
      
      // Step 2: Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload document');
      }
      
      // Step 3: Update document URL in form
      const updatedDocs = [...documents];
      updatedDocs[index] = { ...updatedDocs[index], url: publicUrl };
      setDocuments(updatedDocs);
    } catch (err) {
      setDocumentUploadError({
        ...documentUploadError,
        [index]: err instanceof Error ? err.message : 'Failed to upload document'
      });
    } finally {
      setDocumentUploading({ ...documentUploading, [index]: false });
      // Reset file input
      if (documentInputRefs.current[index]) {
        documentInputRefs.current[index]!.value = '';
      }
    }
  };

  const handleSdsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate PDF
    if (file.type !== 'application/pdf') {
      setSdsUploadError('Only PDF files are allowed');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setSdsUploadError('File must be less than 10MB');
      return;
    }
    
    setSdsUploading(true);
    setSdsUploadError('');
    
    try {
      // Step 1: Get presigned URL
      const response = await fetch('/api/admin/products/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type,
          fileName: file.name,
          size: file.size,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get upload URL');
      }
      
      const { uploadUrl, publicUrl } = await response.json();
      
      // Step 2: Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload SDS');
      }
      
      // Step 3: Update SDS URL in form
      setSdsUrl(publicUrl);
    } catch (err) {
      setSdsUploadError(err instanceof Error ? err.message : 'Failed to upload SDS');
    } finally {
      setSdsUploading(false);
      // Reset file input
      if (sdsInputRef.current) {
        sdsInputRef.current.value = '';
      }
    }
  };

  const tabs = [
    { id: 'basic' as const, label: 'Basic Info' },
    { id: 'technical' as const, label: 'Technical Details' },
    { id: 'states' as const, label: 'Approved States' },
    { id: 'content' as const, label: 'Features & Docs' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {marginError && (
          <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
            {marginError}
          </div>
        )}

        {product?.margin_approval_status === 'approved' && (
          <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <strong>Approved margin:</strong> This product has an approved margin. Changing the price will reset margin approval to pending and require re-approval before the new margin takes effect.
          </div>
        )}

        {/* Basic Info Tab */}
        {activeTab === 'basic' && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Name */}
            <div className="md:col-span-2">
              <label htmlFor="product-name" className="block text-sm font-medium text-slate-700">
                Product Name *
              </label>
              <input
                id="product-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Enter product name"
              />
            </div>

            {/* Compared To */}
            <div className="md:col-span-2">
              <label htmlFor="product-compared-to" className="block text-sm font-medium text-slate-700">
                Compared to
              </label>
              <input
                id="product-compared-to"
                type="text"
                value={formData.compared_to}
                onChange={(e) => setFormData({ ...formData, compared_to: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Name of a comparable or competing product"
              />
              <p className="mt-1 text-xs text-slate-500">Displayed on the storefront for customer comparison</p>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="product-category" className="block text-sm font-medium text-slate-700">
                Category *
              </label>
              <select
                id="product-category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Assignment */}
            <div>
              <label htmlFor="product-supplier" className="block text-sm font-medium text-slate-700">
                Assign to Supplier <span className="text-red-500">*</span>
              </label>
              <select
                id="product-supplier"
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                disabled={loadingSuppliers || !!product?.id}
                required
              >
                <option value="">Select a supplier...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.company_name} ({supplier.supplier_number})
                  </option>
                ))}
              </select>
              {product?.id && formData.supplier_id && (
                <p className="mt-1 text-sm text-amber-600">
                  Supplier assignment cannot be changed after product creation
                </p>
              )}
            </div>

            {/* SKU */}
            <div>
              <label htmlFor="product-sku" className="block text-sm font-medium text-slate-700">
                SKU
              </label>
              <input
                id="product-sku"
                type="text"
                value={formData.sku}
                onChange={(e) => {
                  setSkuError('');
                  setFormData({ ...formData, sku: e.target.value });
                }}
                className={`mt-1 w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-1 ${
                  skuError
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500'
                }`}
                placeholder="e.g., PROD-001"
              />
              {skuError && (
                <p className="mt-1 text-sm text-red-600">{skuError}</p>
              )}
            </div>

            {/* Supplier Assignment */}
            <div>
              <label htmlFor="product-supplier" className="block text-sm font-medium text-slate-700">
                Assign to Supplier
              </label>
              <select
                id="product-supplier"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setFormData({ ...formData, supplier_id: e.target.value });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">None (Direct Product)</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.company_name} ({supplier.supplier_number})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {supplierId
                  ? 'Product will be linked to this supplier and trigger the approval workflow.'
                  : 'Leave as "None" for products not associated with a supplier.'}
              </p>
            </div>

            {/* Product Image Upload */}
            <div className="md:col-span-2">
              <div className="block text-sm font-medium text-slate-700 mb-2">
                Product Image
              </div>
              
              {/* Hidden file input */}
              <input
                id={imageInputId}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {formData.image ? (
                /* Image preview */
                <div className="relative inline-block">
                  <div className="relative w-48 h-48 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    {(formData.image.includes('s3.amazonaws.com') || formData.image.includes('.s3.')) ? (
                      // Use proxy URL for S3 images to avoid 403 errors
                      <Image
                        src={`/api/images/proxy?url=${encodeURIComponent(formData.image)}`}
                        alt="Product preview"
                        fill
                        sizes="192px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Image
                        src={formData.image}
                        alt="Product preview"
                        fill
                        sizes="192px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <label
                      htmlFor={imageInputId}
                      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <Upload className="h-4 w-4" />
                      Change
                    </label>
                    <button
                      type="button"
                      onClick={removeImage}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          removeImage();
                        }
                      }}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                // Upload dropzone - keyboard handlers for accessibility
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                <label
                  htmlFor={imageInputId}
                  className={`block w-full max-w-md rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById(imageInputId)?.click();
                    }
                  }}
                  tabIndex={uploading ? -1 : 0}
                  aria-label="Upload product image"
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-10 w-10 text-emerald-500 animate-spin" />
                      <span className="text-sm text-slate-600">{compressionStatus || 'Processing...'}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="rounded-full bg-emerald-100 p-3">
                        <ImageIcon className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-emerald-600">Click to upload</span>
                        <p className="text-xs text-slate-500 mt-1">JPEG, PNG, GIF, or WebP (max 5MB)</p>
                      </div>
                    </div>
                  )}
                </label>
              )}

              {uploadError && (
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              )}
              {!uploading && compressionStatus && !uploadError && (
                <p className="mt-2 text-sm text-emerald-600">{compressionStatus}</p>
              )}
            </div>

            {/* Price */}
            <div>
              <label htmlFor="product-price" className="block text-sm font-medium text-slate-700">
                {hasGallonPricing ? 'Price Per Gallon *' : 'Price *'}
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  $
                </span>
                <input
                  id="product-price"
                  type="number"
                  required
                  step={hasGallonPricing ? "0.0001" : "0.01"}
                  min="0"
                  value={hasGallonPricing ? pricePerGallon : formData.price}
                  onChange={(e) => {
                    if (hasGallonPricing) {
                      setPricePerGallon(e.target.value);
                      // Calculate and store total price
                      const total = calculateTotalFromPerGallon(e.target.value, attributes.containerSizes);
                      setFormData({ ...formData, price: total || e.target.value });
                    } else {
                      setFormData({ ...formData, price: e.target.value });
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-4 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder={hasGallonPricing ? "0.0000" : "0.00"}
                />
              </div>
              {hasGallonPricing && pricePerGallon && parseFloat(pricePerGallon) > 0 && (
                <div className="mt-2 space-y-1 bg-emerald-50 px-3 py-2 rounded-md border border-emerald-200">
                  <p className="text-lg font-bold text-emerald-700">
                    ${parseFloat(pricePerGallon).toFixed(4)}/gallon
                  </p>
                  <p className="text-sm text-slate-600">
                    Total Price: ${calculateTotalFromPerGallon(pricePerGallon, attributes.containerSizes)} ({gallons} gallons)
                  </p>
                </div>
              )}
            </div>

            {/* MSRP (Compare At Price) */}
            <div>
              <label htmlFor="product-msrp" className="block text-sm font-medium text-slate-700">
                {hasGallonPricing ? 'MSRP Per Gallon (Optional)' : 'MSRP (Optional)'}
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Manufacturer Suggested Retail Price - shown crossed out to customers
              </p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  $
                </span>
                <input
                  id="product-msrp"
                  type="number"
                  step={hasGallonPricing ? "0.0001" : "0.01"}
                  min="0"
                  value={hasGallonPricing ? msrpPerGallon : formData.msrp}
                  onChange={(e) => {
                    if (hasGallonPricing) {
                      setMsrpPerGallon(e.target.value);
                      // Calculate and store total MSRP
                      const total = calculateTotalFromPerGallon(e.target.value, attributes.containerSizes);
                      setFormData({ ...formData, msrp: total || e.target.value });
                    } else {
                      setFormData({ ...formData, msrp: e.target.value });
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-4 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder={hasGallonPricing ? "0.0000" : "0.00"}
                />
              </div>
              {hasGallonPricing && msrpPerGallon && parseFloat(msrpPerGallon) > 0 && (
                <div className="mt-2 space-y-1 bg-blue-50 px-3 py-2 rounded-md border border-blue-200">
                  <p className="text-lg font-bold text-blue-700">
                    ${parseFloat(msrpPerGallon).toFixed(4)}/gallon
                  </p>
                  <p className="text-sm text-slate-600">
                    Total MSRP: ${calculateTotalFromPerGallon(msrpPerGallon, attributes.containerSizes)} ({gallons} gallons)
                  </p>
                </div>
              )}
            </div>

            {/* Supplier Price */}
            <div>
              <label htmlFor="product-original-price" className="block text-sm font-medium text-slate-700">
                {hasGallonPricing ? 'Supplier Price Per Gallon (for sale items)' : 'Supplier Price (for sale items)'}
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  $
                </span>
                <input
                  id="product-original-price"
                  type="number"
                  step={hasGallonPricing ? "0.0001" : "0.01"}
                  min="0"
                  value={hasGallonPricing ? originalPricePerGallon : formData.original_price}
                  onChange={(e) => {
                    if (hasGallonPricing) {
                      setOriginalPricePerGallon(e.target.value);
                      // Calculate and store total original price
                      const total = calculateTotalFromPerGallon(e.target.value, attributes.containerSizes);
                      setFormData({ ...formData, original_price: total || e.target.value });
                    } else {
                      setFormData({ ...formData, original_price: e.target.value });
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-4 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder={hasGallonPricing ? "0.0000" : "0.00"}
                />
              </div>
              {hasGallonPricing && originalPricePerGallon && parseFloat(originalPricePerGallon) > 0 && (
                <div className="mt-2 space-y-1 bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
                  <p className="text-lg font-bold text-slate-700">
                    ${parseFloat(originalPricePerGallon).toFixed(4)}/gallon
                  </p>
                  <p className="text-sm text-slate-600">
                    Total Supplier Price: ${calculateTotalFromPerGallon(originalPricePerGallon, attributes.containerSizes)} ({gallons} gallons)
                  </p>
                </div>
              )}
            </div>

            {/* Unit of Measure */}
            <div>
              <label htmlFor="product-uom" className="block text-sm font-medium text-slate-700">
                Unit of Measure
              </label>
              <select
                id="product-uom"
                value={formData.unit_of_measure}
                onChange={(e) =>
                  setFormData({ ...formData, unit_of_measure: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">None (no unit displayed)</option>
                {unitsOfMeasure.map((unit) => (
                  <option key={unit} value={unit}>
                    /{unit}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Displayed after price (e.g., $99.99/lb)
              </p>
            </div>

            {/* Net Content Weight */}
            <div>
              <label htmlFor="product-weight-per-unit" className="block text-sm font-medium text-slate-700">
                Net Content Weight (lbs)
              </label>
              <input
                id="product-weight-per-unit"
                type="number"
                min="0"
                step="0.01"
                value={attributes.weight || ''}
                onChange={(e) =>
                  setAttributes({ ...attributes, weight: e.target.value || '' })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g., 2650"
              />
              <p className="mt-1 text-xs text-slate-500">
                Net content weight per unit of measure (in pounds). This will be multiplied by quantity on the Bill of Lading to calculate total net weight.
              </p>
            </div>

            {/* Active Ingredient Weight per Gallon */}
            <div>
              <label htmlFor="product-lbs-per-gallon" className="block text-sm font-medium text-slate-700">
                Active Ingredient Weight (lbs/gal)
              </label>
              <input
                id="product-lbs-per-gallon"
                type="number"
                min="0"
                step="0.01"
                value={attributes.lbsPerGallon || ''}
                onChange={(e) =>
                  setAttributes({ ...attributes, lbsPerGallon: e.target.value || '' })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g., 5.4"
              />
              <p className="mt-1 text-xs text-slate-500">
                Weight of active ingredient per gallon (e.g., 5.4 lbs/gal). Displayed on the product detail page.
              </p>
            </div>

            {/* Shipping & Freight */}
            <div className="col-span-2 border-t border-slate-100 pt-4">
              {(() => {
                const isTote = ['tote', 'tank'].some(t =>
                  formData.unit_of_measure?.toLowerCase().includes(t)
                );
                return (
                  <>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Shipping &amp; Freight</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* NMFC Number */}
                      <div className="col-span-2">
                        {/* AI NMFC Suggestion Banner */}
                        {nmfcAiStatus === 'pending' && nmfcAiSuggestion && (
                          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">AI Suggestion</span>
                                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">Pending Review</span>
                                </div>
                                <p className="text-sm font-semibold text-amber-900">
                                  NMFC: <span className="font-mono">{nmfcAiSuggestion}</span>
                                  {freightClassAiSuggestion && (
                                    <span className="ml-2 text-amber-700">· Class <span className="font-mono">{freightClassAiSuggestion}</span></span>
                                  )}
                                </p>
                                {nmfcAiReasoning && (
                                  <p className="mt-1 text-xs text-amber-700 leading-relaxed">{nmfcAiReasoning}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={handleNmfcAccept}
                                  disabled={nmfcAiLoading}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 hover:cursor-pointer"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={handleNmfcReject}
                                  disabled={nmfcAiLoading}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 hover:cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {nmfcAiError && (
                          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            Accept failed: {nmfcAiError}
                          </div>
                        )}
                        {nmfcAiStatus === 'accepted' && (
                          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            AI suggestion accepted — NMFC number and freight class updated.
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <label htmlFor="product-nmfc-number" className="block text-sm font-medium text-slate-700">
                            NMFC Number
                          </label>
                          {formData.name && (
                            <button
                              type="button"
                              onClick={handleNmfcClassify}
                              disabled={nmfcAiLoading}
                              className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 hover:cursor-pointer"
                            >
                              {nmfcAiLoading
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Classifying...</>
                                : <><Sparkles className="h-3 w-3" /> Run AI Classification</>
                              }
                            </button>
                          )}
                        </div>
                        <input
                          id="product-nmfc-number"
                          type="text"
                          value={formData.nmfc_number}
                          onChange={(e) => setFormData({ ...formData, nmfc_number: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="e.g., 46120"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          National Motor Freight Classification number. Displayed per line item on the Bill of Lading.
                          {isTote ? (
                            <span className="block mt-0.5 text-sky-600">Totes ship as-is on pallets — carton dimensions do not apply.</span>
                          ) : (!formData.carton_length && !formData.carton_weight_lbs && (
                            <span className="block mt-0.5 text-amber-600">Add carton dimensions below to enable AI classification.</span>
                          ))}
                        </p>
                      </div>

                      {/* Freight Class */}
                      <div>
                        <label htmlFor="product-freight-class" className="block text-sm font-medium text-slate-700">
                          Freight Class
                        </label>
                        <input
                          id="product-freight-class"
                          type="text"
                          value={formData.freight_class}
                          onChange={(e) => setFormData({ ...formData, freight_class: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="e.g., 65"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          LTL freight class (50–500). Used to auto-populate the shipping type on orders.
                        </p>
                      </div>

                      {/* Truckload Eligible */}
                      <div className="col-span-2">
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Eligible for Truckload Shipping</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              When enabled, orders of this product meeting the minimum tote quantity will automatically use truckload (TL) shipping at checkout.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={formData.truckload_eligible}
                            onClick={() => setFormData({ ...formData, truckload_eligible: !formData.truckload_eligible })}
                            className={`relative ml-4 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              formData.truckload_eligible ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                formData.truckload_eligible ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Case Goods Fields — shown when truckload eligible */}
                      {formData.truckload_eligible && (
                        <>
                          <div>
                            <label htmlFor="product-gallons-per-case" className="block text-sm font-medium text-slate-700">
                              Gallons Per Case
                            </label>
                            <input
                              id="product-gallons-per-case"
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.gallons_per_case ?? ''}
                              onChange={(e) => setFormData({ ...formData, gallons_per_case: e.target.value ? parseFloat(e.target.value) : null })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g., 5"
                            />
                            <p className="mt-1 text-xs text-slate-500">Number of gallons per case (for pallet weight calculation).</p>
                          </div>
                          <div>
                            <label htmlFor="product-cases-per-pallet" className="block text-sm font-medium text-slate-700">
                              Cases Per Pallet
                            </label>
                            <input
                              id="product-cases-per-pallet"
                              type="number"
                              min="0"
                              step="1"
                              value={formData.cases_per_pallet ?? ''}
                              onChange={(e) => setFormData({ ...formData, cases_per_pallet: e.target.value ? parseInt(e.target.value) : null })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g., 36"
                            />
                            <p className="mt-1 text-xs text-slate-500">Number of cases that fit on one pallet.</p>
                          </div>
                          <div>
                            <label htmlFor="product-bulk-density" className="block text-sm font-medium text-slate-700">
                              Bulk Density (lbs/gal)
                            </label>
                            <input
                              id="product-bulk-density"
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.bulk_density_lbs_per_gallon ?? ''}
                              onChange={(e) => setFormData({ ...formData, bulk_density_lbs_per_gallon: e.target.value ? parseFloat(e.target.value) : null })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g., 10"
                            />
                            <p className="mt-1 text-xs text-slate-500">Weight in lbs per gallon (used to calculate pallet weight).</p>
                          </div>
                        </>
                      )}

                      {/* Carton dimensions — hidden for totes */}
                      {!isTote && (
                        <>
                          {/* Carton Length */}
                          <div>
                            <label htmlFor="product-carton-length" className="block text-sm font-medium text-slate-700">
                              Carton Length (in)
                            </label>
                            <input
                              id="product-carton-length"
                              type="number"
                              min="0"
                              step="0.1"
                              value={formData.carton_length}
                              onChange={(e) => setFormData({ ...formData, carton_length: e.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g., 12"
                            />
                          </div>

                          {/* Carton Width */}
                          <div>
                            <label htmlFor="product-carton-width" className="block text-sm font-medium text-slate-700">
                              Carton Width (in)
                            </label>
                            <input
                              id="product-carton-width"
                              type="number"
                              min="0"
                              step="0.1"
                              value={formData.carton_width}
                              onChange={(e) => setFormData({ ...formData, carton_width: e.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g., 8"
                            />
                          </div>

                          {/* Carton Height */}
                          <div>
                            <label htmlFor="product-carton-height" className="block text-sm font-medium text-slate-700">
                              Carton Height (in)
                            </label>
                            <input
                              id="product-carton-height"
                              type="number"
                              min="0"
                              step="0.1"
                              value={formData.carton_height}
                              onChange={(e) => setFormData({ ...formData, carton_height: e.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              placeholder="e.g., 6"
                            />
                          </div>
                        </>
                      )}

                      {/* Carton Weight — non-totes only */}
                      {!isTote && (
                        <div>
                          <label htmlFor="product-carton-weight" className="block text-sm font-medium text-slate-700">
                            Carton Weight (lbs)
                          </label>
                          <input
                            id="product-carton-weight"
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.carton_weight_lbs}
                            onChange={(e) => setFormData({ ...formData, carton_weight_lbs: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="e.g., 45"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Gross weight per carton/unit as shipped. Used for live freight rate calculations.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Inventory Count */}
            <div>
              <label htmlFor="product-inventory" className="block text-sm font-medium text-slate-700">
                Inventory Count
                {hasWarehouses && (
                  <span className="ml-2 text-xs text-slate-500 font-normal">
                    (calculated from warehouses)
                  </span>
                )}
              </label>
              <input
                id="product-inventory"
                type="number"
                min="0"
                value={formData.inventory_count}
                onChange={(e) => {
                  if (!hasWarehouses) {
                    // Only allow editing if no warehouses exist
                    const newInventory = parseInt(e.target.value) || 0;
                    setFormData({ 
                      ...formData, 
                      inventory_count: newInventory,
                      in_stock: newInventory > 0 // Automatically update in_stock based on inventory
                    });
                  }
                }}
                disabled={hasWarehouses}
                readOnly={hasWarehouses}
                className={`mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 ${
                  hasWarehouses 
                    ? 'bg-slate-100 text-slate-600 cursor-not-allowed' 
                    : 'focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'
                }`}
              />
              <p className="mt-1 text-xs text-slate-500">
                {hasWarehouses 
                  ? 'Inventory count is automatically calculated from warehouse inventories. Update warehouse inventory below to change this value.'
                  : 'Overall inventory count. Use Warehouse Inventory section below to manage per-warehouse inventory.'}
              </p>
            </div>

            {/* Rating */}
            <div>
              <label htmlFor="product-rating" className="block text-sm font-medium text-slate-700">
                Rating (0-5)
              </label>
              <input
                id="product-rating"
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="4.5"
              />
            </div>

            {/* Minimum Order Quantity */}
            <div>
              <label htmlFor="product-minimum-order-qty" className="block text-sm font-medium text-slate-700">
                Minimum Order Quantity
              </label>
              <input
                id="product-minimum-order-qty"
                type="number"
                min="1"
                value={formData.minimum_order_qty ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, minimum_order_qty: e.target.value ? parseInt(e.target.value) || null : null })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Leave empty for no minimum"
              />
              <p className="mt-1 text-xs text-slate-500">
                If set, customers must order at least this quantity. Leave empty for no minimum requirement.
              </p>
            </div>

            {/* Next Available Quantity */}
            <div>
              <label htmlFor="product-next-available-quantity" className="block text-sm font-medium text-slate-700">
                Next Available Quantity
              </label>
              <input
                id="product-next-available-quantity"
                type="number"
                min="0"
                value={formData.next_available_quantity ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, next_available_quantity: e.target.value ? parseInt(e.target.value) || null : null })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Leave empty if not applicable"
              />
              <p className="mt-1 text-xs text-slate-500">
                Expected quantity that will be available on the next available date. Used for partial fulfillment when customers over-order.
              </p>
            </div>

            {/* Next Available Date */}
            <div>
              <label htmlFor="product-next-available-date" className="block text-sm font-medium text-slate-700">
                Next Available Date
              </label>
              <input
                id="product-next-available-date"
                type="date"
                value={formData.next_available_date || ''}
                onChange={(e) =>
                  setFormData({ ...formData, next_available_date: e.target.value || '' })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Expected date when the next available quantity will be in stock. Used to inform customers when additional inventory will be available.
              </p>
            </div>

            {/* In Stock - Automatically set based on inventory */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="in_stock"
                checked={formData.in_stock}
                disabled
                readOnly
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor="in_stock" className="text-sm font-medium text-slate-700">
                In Stock <span className="text-xs text-slate-500">(auto-updated based on inventory)</span>
              </label>
            </div>

            {/* Margin Management - Only for Supplier Products that are already saved */}
            {product && (product.supplier_id || supplierId) && (
              <div className="md:col-span-2">
                <MarginManagementTable
                  product={product}
                  hasGallonPricing={hasGallonPricing}
                  containerSizes={attributes.containerSizes}
                  currentPrice={formData.price}
                  currentOriginalPrice={formData.original_price}
                  marginPercent={marginPercent}
                  onMarginPercentChange={setMarginPercent}
                  marginNotes={marginNotes}
                  onMarginNotesChange={setMarginNotes}
                />
              </div>
            )}

            {/* Warehouse Inventory - Full Width */}
            {product?.id && (
              <div className="md:col-span-2">
                <ProductWarehousesSection productId={product.id} />
              </div>
            )}

            {/* Label Template Selector */}
            {labelTemplates.length > 0 && (
              <div className="md:col-span-2">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label htmlFor="label-template" className="block text-sm font-medium text-slate-700 mb-2">
                    Use Label Template (Optional)
                  </label>
                  <select
                    id="label-template"
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
                  >
                    <option value="">-- Select a template to auto-fill descriptions --</option>
                    {labelTemplates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.template_name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-blue-800">
                    Selecting a template will automatically populate the descriptions and label image below. You can still edit them after selecting.
                  </p>
                </div>
              </div>
            )}

            {loadingTemplates && formData.name && formData.name.length >= 3 && (
              <div className="md:col-span-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
                  <p className="mt-2 text-sm text-slate-600">Loading label templates...</p>
                </div>
              </div>
            )}

            {/* Short Description */}
            <div className="md:col-span-2">
              <label htmlFor="product-short-desc" className="block text-sm font-medium text-slate-700">
                Short Description
              </label>
              <textarea
                id="product-short-desc"
                rows={2}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Brief product description for listings..."
              />
            </div>

            {/* Full Description */}
            <div className="md:col-span-2">
              <label htmlFor="product-full-desc" className="block text-sm font-medium text-slate-700">
                Full Description
              </label>
              <textarea
                id="product-full-desc"
                rows={4}
                value={formData.full_description}
                onChange={(e) =>
                  setFormData({ ...formData, full_description: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Detailed product description for the product page..."
              />
            </div>
          </div>
        )}

        {/* Technical Details Tab */}
        {activeTab === 'technical' && (
          <div className="space-y-6">
            <div className="rounded-lg bg-slate-50 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-4">Technical Attributes</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Active Ingredients */}
                <div className="md:col-span-2">
                  <label htmlFor="product-ingredients" className="block text-sm font-medium text-slate-700">
                    Active Ingredients
                  </label>
                  <input
                    id="product-ingredients"
                    type="text"
                    value={attributes.activeIngredients}
                    onChange={(e) =>
                      setAttributes({ ...attributes, activeIngredients: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g., Glyphosate 41%"
                  />
                </div>

                {/* EPA Signal Word */}
                <div>
                  <label htmlFor="product-epa-signal" className="block text-sm font-medium text-slate-700">
                    EPA Signal Word
                  </label>
                  <select
                    id="product-epa-signal"
                    value={attributes.epaSignalWord}
                    onChange={(e) =>
                      setAttributes({ ...attributes, epaSignalWord: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {epaSignalWords.map((word) => (
                      <option key={word} value={word}>
                        {word}
                      </option>
                    ))}
                  </select>
                </div>

                {/* EPA Registration Number */}
                <div>
                  <label htmlFor="product-epa-reg" className="block text-sm font-medium text-slate-700">
                    EPA Registration Number
                  </label>
                  <input
                    id="product-epa-reg"
                    type="text"
                    value={attributes.epaRegistrationNumber}
                    onChange={(e) =>
                      setAttributes({ ...attributes, epaRegistrationNumber: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g., 524-549"
                  />
                </div>

                {/* Restricted Use Product */}
                <div className="md:col-span-2 flex flex-col gap-1 border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="restricted_use"
                      checked={formData.restricted_use}
                      onChange={(e) =>
                        setFormData({ ...formData, restricted_use: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="restricted_use" className="text-sm font-semibold text-amber-800">
                      Restricted Use Product (RUP)
                    </label>
                  </div>
                  <p className="text-xs text-amber-700 ml-6">
                    When checked, customers must upload their pesticide applicator license at checkout before purchasing this product.
                  </p>
                </div>

                {/* Application Rate Range */}
                <div>
                  <label htmlFor="product-app-rate" className="block text-sm font-medium text-slate-700">
                    Application Rate Range
                  </label>
                  <input
                    id="product-app-rate"
                    type="text"
                    value={attributes.applicationRateRange}
                    onChange={(e) =>
                      setAttributes({ ...attributes, applicationRateRange: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g., 22-32 fl oz per acre"
                  />
                </div>

                {/* Container Sizes */}
                <div>
                  <label htmlFor="product-container" className="block text-sm font-medium text-slate-700">
                    Container Size
                  </label>
                  <input
                    id="product-container"
                    type="text"
                    list="container-size-options"
                    value={attributes.containerSizes}
                    onChange={(e) =>
                      setAttributes({ ...attributes, containerSizes: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g., 265 gal tote"
                  />
                  <datalist id="container-size-options">
                    {CONTAINER_SIZES.map((size) => (
                      <option key={size} value={size} />
                    ))}
                  </datalist>
                </div>

                {/* Package Type */}
                <div>
                  <label htmlFor="product-package-type" className="block text-sm font-medium text-slate-700">
                    Package Type
                  </label>
                  <select
                    id="product-package-type"
                    value={attributes.packageType || ''}
                    onChange={(e) =>
                      setAttributes({ ...attributes, packageType: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select a package type</option>
                    {PACKAGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Availability Date */}
                <div>
                  <label htmlFor="product-availability" className="block text-sm font-medium text-slate-700">
                    Product Availability Date
                  </label>
                  <input
                    id="product-availability"
                    type="text"
                    value={attributes.availabilityDate}
                    onChange={(e) =>
                      setAttributes({ ...attributes, availabilityDate: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g., Year-round or September 2024"
                  />
                </div>
              </div>
            </div>

            {/* Specifications */}
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-700">Specifications</h3>
                <button
                  type="button"
                  onClick={addSpecification}
                  className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Specification
                </button>
              </div>
              <div className="space-y-3">
                {Array.isArray(specifications) && specifications.map((spec, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={spec.key}
                      onChange={(e) => updateSpecification(index, 'key', e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="Name (e.g., Weight)"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => updateSpecification(index, 'value', e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="Value (e.g., 50 lbs)"
                    />
                    {specifications.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSpecification(index)}
                        className="p-2 text-slate-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Approved States Tab */}
        {activeTab === 'states' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-700">States Approved for Sale</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {approvedStates.length} of {US_STATES.length} states selected
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllStates}
                  className="text-sm text-emerald-600 hover:text-emerald-700"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={clearAllStates}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {US_STATES.map((state) => (
                <label
                  key={state}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    approvedStates.includes(state)
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={approvedStates.includes(state)}
                    onChange={() => toggleState(state)}
                    className="sr-only"
                  />
                  <span className="font-medium">{state}</span>
                  <span className="text-xs text-slate-500 truncate">{STATE_NAMES[state]}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Features & Documents Tab */}
        {activeTab === 'content' && (
          <div className="space-y-6">
            {/* Features */}
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-700">Key Features</h3>
                <button
                  type="button"
                  onClick={addFeature}
                  className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Feature
                </button>
              </div>
              <div className="space-y-2">
                {Array.isArray(features) && features.map((feature, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={feature}
                      onChange={(e) => updateFeature(index, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="Enter a key feature..."
                    />
                    {features.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeFeature(index)}
                        className="p-2 text-slate-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Safety Data Sheet (SDS) */}
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-700">Safety Data Sheet (SDS)</h3>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2 items-start">
                  <FileText className="h-5 w-5 text-slate-400 mt-2" />
                  <div className="flex-1 space-y-2">
                    {/* URL input with upload button */}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={sdsUrl}
                        onChange={(e) => setSdsUrl(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Enter SDS URL or upload PDF file"
                      />
                      
                      {/* Upload button */}
                      <label className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 cursor-pointer transition-colors hover:cursor-pointer">
                        <input
                          type="file"
                          ref={sdsInputRef}
                          onChange={handleSdsUpload}
                          accept="application/pdf"
                          className="sr-only"
                          disabled={sdsUploading}
                        />
                        {sdsUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {sdsUploading ? 'Uploading...' : 'Upload PDF'}
                      </label>
                      
                      {/* View button */}
                      {sdsUrl && !sdsUploading && (
                        <a
                          href={getDocumentProxyUrl(sdsUrl) || sdsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="View SDS"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View
                        </a>
                      )}

                      {/* Clear button */}
                      {sdsUrl && !sdsUploading && (
                        <button
                          type="button"
                          onClick={() => setSdsUrl('')}
                          className="p-2 text-slate-400 hover:text-red-500"
                          title="Remove SDS"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    {/* Error message */}
                    {sdsUploadError && (
                      <p className="text-xs text-red-600">{sdsUploadError}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Documents */}
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-700">Product Documents</h3>
                <button
                  type="button"
                  onClick={addDocument}
                  className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Document
                </button>
              </div>
              <div className="space-y-3">
                {Array.isArray(documents) && documents.map((doc, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <FileText className="h-5 w-5 text-slate-400 mt-2" />
                    <div className="flex-1 space-y-2">
                      {/* Document name input */}
                      <input
                        type="text"
                        value={doc.name}
                        onChange={(e) => updateDocument(index, 'name', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Document name (e.g., Product Label, Safety Data Sheet)"
                      />
                      
                      {/* URL input with upload button */}
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={doc.url}
                          onChange={(e) => updateDocument(index, 'url', e.target.value)}
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="Enter URL or upload PDF file"
                        />
                        
                        {/* Upload button */}
                        <label className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 cursor-pointer transition-colors hover:cursor-pointer">
                          <input
                            type="file"
                            ref={(el) => { documentInputRefs.current[index] = el; }}
                            onChange={(e) => handleDocumentUpload(index, e)}
                            accept="application/pdf"
                            className="sr-only"
                            disabled={documentUploading[index]}
                          />
                          {documentUploading[index] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {documentUploading[index] ? 'Uploading...' : 'Upload PDF'}
                        </label>
                        
                        {/* View button */}
                        {doc.url && !documentUploading[index] && (
                          <a
                            href={getDocumentProxyUrl(doc.url) || doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title={`View ${doc.name || 'document'}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                            View
                          </a>
                        )}
                      </div>
                      
                      {/* Error message */}
                      {documentUploadError[index] && (
                        <p className="text-xs text-red-600">{documentUploadError[index]}</p>
                      )}
                    </div>
                    
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeDocument(index)}
                      className="p-2 text-slate-400 hover:text-red-500"
                      title="Remove document"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </form>
  );
}
