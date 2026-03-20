import { queryOne } from '@/lib/db';

/**
 * Store Information Management
 * 
 * IMPORTANT: The business address here should match the BILL_TO address in the
 * addresses table. These two systems serve different purposes but should use
 * the same physical address:
 * 
 * - Business Address (here): Used for customer invoices and public website pages
 * - Bill-To Address (addresses table): Used for purchase orders to vendors
 * 
 * Current Address:
 *   Innovative CropCare, LLC
 *   3800 Camp Creek Pkwy, Building 1400
 *   Atlanta, GA 30331
 * 
 * If updating the address, update BOTH:
 * 1. site_settings table (key='store_info')
 * 2. addresses table (type='BILL_TO')
 */

// Store info interface
export interface StoreInfo {
  store_name: string;
  phone: string;
  email: string;
  support_email: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  business_hours: string;
}

// Default store info if not configured
export const DEFAULT_STORE_INFO: StoreInfo = {
  store_name: 'Innovative Crop Care',
  phone: '1-800-CROP-CARE',
  email: 'info@innovativecropcare.com',
  support_email: 'support@innovativecropcare.com',
  address_street: '3800 Camp Creek Pkwy, Building 1400',
  address_city: 'Atlanta',
  address_state: 'GA',
  address_zip: '30331',
  business_hours: 'Mon-Fri, 8AM-6PM EST',
};

/**
 * Get store info from database (for server components)
 */
export async function getStoreInfo(): Promise<StoreInfo> {
  try {
    const result = await queryOne<{ value: StoreInfo }>(
      'SELECT value FROM site_settings WHERE key = $1',
      ['store_info']
    );

    return result?.value
      ? { ...DEFAULT_STORE_INFO, ...result.value }
      : DEFAULT_STORE_INFO;
  } catch (error) {
    console.error('Error fetching store info:', error);
    return DEFAULT_STORE_INFO;
  }
}

/**
 * Format phone number for tel: href
 * Removes all non-digit characters except +
 */
export function formatPhoneHref(phone: string): string {
  // Keep + at the start if present, remove all other non-digits
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

/**
 * Format full address as a single line
 */
export function formatAddress(storeInfo: StoreInfo): string {
  return `${storeInfo.address_street}, ${storeInfo.address_city}, ${storeInfo.address_state} ${storeInfo.address_zip}`;
}
