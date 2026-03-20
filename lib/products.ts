// Product type for shop listing page
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  originalPrice?: string;
  unitOfMeasure?: string | null;
  image: string;
  inStock: boolean;
  attributes?: {
    containerSizes?: string;
  } | null;
}

// Product attributes shape
export interface ProductAttributes {
  activeIngredients: string;
  epaSignalWord: string;
  epaRegistrationNumber: string;
  applicationRateRange: string;
  containerSizes: string;
  availabilityDate: string;
  weight: string;
  sdsInformation: string;
  packageType?: string;
  dotRegulated?: string; // "Yes" or "No" or "Not regulated by DOT"
  dotHazardClass?: string; // e.g., "N/A"
  dotUnNumber?: string; // e.g., "N/A"
  dotPackingGroup?: string; // e.g., "III"
  lbsPerGallon?: string; // Active ingredient weight per gallon (e.g., "5.4")
}

// Product document
export interface ProductDocument {
  name: string;
  url: string;
}

// Product as stored in database
export interface ProductDetailDB {
  id: string;
  name: string;
  category: string;
  description: string | null;
  full_description: string | null;
  price: string;
  original_price: string | null;
  msrp: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  sku: string | null;
  rating: string | null;
  review_count: number;
  attributes: ProductAttributes;
  approved_states: string[];
  features: string[];
  specifications: Record<string, string>;
  documents: ProductDocument[];
  sds_url: string | null;
  label_url: string | null;
  admin_label_url: string | null;
  label_template_id: string | null;
  restricted_use: boolean;
  next_available_quantity: number | null;
  next_available_date: string | null;
  created_at: string;
  updated_at: string;
  // Margin approval fields
  margin_split_percentage: number | null;
  margin_approval_status: string | null;
  margin_approval_notes: string | null;
  margin_approved_by: string | null;
  margin_approved_at: string | null;
  margin_submitted_at: string | null;
  compared_to: string | null;
  truckload_eligible: boolean;
  gallons_per_case: number | null;
  cases_per_pallet: number | null;
  bulk_density_lbs_per_gallon: number | null;
}

// Lightweight type for "similar products" cards on the detail page
export interface SimilarProduct {
  id: string;
  name: string;
  category: string;
  price: string;
  original_price: string | null;
  unit_of_measure: string | null;
  attributes: Record<string, string> | null;
  image: string | null;
  in_stock: boolean;
}

// Product detail view (formatted for UI display)
export interface ProductDetailView {
  id: string;
  name: string;
  category: string;
  description: string;
  fullDescription: string;
  price: string;
  originalPrice?: string;
  unitOfMeasure?: string | null;
  image: string;
  inStock: boolean;
  sku: string;
  rating: number;
  reviewCount: number;
  attributes: ProductAttributes;
  approvedStates: string[];
  features: string[];
  specifications: Record<string, string>;
  documents: ProductDocument[];
  restrictedUse: boolean;
  comparedTo?: string | null;
  truckloadEligible: boolean;
  casesPerPallet: number | null;
  bulkDensityLbsPerGallon: number | null;
  gallonsPerCase: number | null;
}
