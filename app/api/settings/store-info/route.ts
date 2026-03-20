import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

// Store info interface
interface StoreInfo {
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
const DEFAULT_STORE_INFO: StoreInfo = {
  store_name: 'Innovative Crop Care',
  phone: '1-800-CROP-CARE',
  email: 'info@innovativecropcare.com',
  support_email: 'support@innovativecropcare.com',
  address_street: '1234 Agriculture Way',
  address_city: 'Fresno',
  address_state: 'CA',
  address_zip: '93650',
  business_hours: 'Mon-Fri, 8AM-6PM EST',
};

/**
 * GET /api/settings/store-info
 * Get public store information (no authentication required)
 */
export async function GET() {
  try {
    const result = await queryOne<{ value: StoreInfo }>(
      'SELECT value FROM site_settings WHERE key = $1',
      ['store_info']
    );

    const storeInfo = result?.value
      ? { ...DEFAULT_STORE_INFO, ...result.value }
      : DEFAULT_STORE_INFO;

    return NextResponse.json(storeInfo, {
      headers: {
        // Cache for 5 minutes on CDN, revalidate in background
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error fetching store info:', error);
    // Return defaults on error to ensure the site still works
    return NextResponse.json(DEFAULT_STORE_INFO);
  }
}
