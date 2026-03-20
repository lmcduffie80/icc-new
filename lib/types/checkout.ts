export type CheckoutStep = 'order-summary' | 'invoice-verification' | 'license-verification' | 'address' | 'payment';

export interface CheckoutAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
}

export interface DeliveryOption {
  id: string;
  name: string;
  price: number;
  estimatedDays: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isPrimary: boolean;
}

export interface ProfileData {
  phone: string | null;
  name: string | null;
  email: string;
}

export interface NMFCInfo {
  number?: string; // NMFC number for LTL, or 'TL' for truckload
  shippingType: 'TL' | 'LTL'; // Truckload or Less Than Truckload
}

export interface InvoiceMetadata {
  invoice_url?: string;
  invoice_state?: string;
  invoice_uploaded_at?: string;
  invoice_filename?: string;
  invoice_file_type?: string;
  // Additional metadata fields for order management
  warehouse_id?: string | null;
  warehouse_allocations?: Array<{ warehouse_id: string; items: Array<{ product_id: string; quantity: number }> }>;
  manual_shipping?: boolean;
  partially_fulfilled?: boolean;
  partial_fulfillment_date?: string;
  partial_fulfillment_warnings?: string[];
  // NMFC information - can be single (backward compatible) or array for multiple warehouses
  nmfcNumber?: string; // Legacy: single NMFC number
  nmfcInfo?: NMFCInfo[]; // New: array of NMFC info (up to 2 for multiple warehouses)
}

export interface LicenseMetadata {
  license_url?: string;
  license_state?: string | null;
  license_uploaded_at?: string;
  license_filename?: string | null;
  license_file_type?: string | null;
}

export const DEFAULT_DELIVERY_OPTIONS: DeliveryOption[] = [
  { id: 'standard', name: 'Standard Shipping', price: 9.99, estimatedDays: '5-7 business days' },
  { id: 'express', name: 'Express Shipping', price: 19.99, estimatedDays: '2-3 business days' },
];

export const EMPTY_ADDRESS: CheckoutAddress = {
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  email: '',
};
