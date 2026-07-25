import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getRequiredTenantId, MissingTenantError } from '@/lib/tenant';

const DEFAULT_CATEGORIES = [
  'Herbicides',
  'Fungicides',
  'Insecticides',
  'Plant-Growth Regulators',
  'Adjuvants',
];

interface CategoriesSetting {
  key: string;
  value: {
    categories: string[];
  };
}

// GET /api/categories - Public endpoint for fetching product categories
export async function GET(request: NextRequest) {
  try {
    const tenantId = getRequiredTenantId(request);

    const setting = await queryOne<CategoriesSetting>(
      "SELECT * FROM site_settings WHERE key = 'categories' AND tenant_id = $1",
      [tenantId]
    );

    const categories = setting?.value?.categories || DEFAULT_CATEGORIES;

    return NextResponse.json({ categories }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=1209600',
      },
    });
  } catch (error) {
    if (error instanceof MissingTenantError) {
      // Categories feed site navigation and must never break it, so a
      // missing tenant falls back to defaults instead of erroring.
      return NextResponse.json({ categories: DEFAULT_CATEGORIES }, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=1209600',
        },
      });
    }
    console.error('Error fetching categories:', error);
    // Return defaults on error to ensure frontend always works
    return NextResponse.json({ categories: DEFAULT_CATEGORIES }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=1209600',
      },
    });
  }
}
