import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

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
export async function GET() {
  try {
    const setting = await queryOne<CategoriesSetting>(
      "SELECT * FROM site_settings WHERE key = 'categories'"
    );

    const categories = setting?.value?.categories || DEFAULT_CATEGORIES;

    return NextResponse.json({ categories }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=1209600',
      },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    // Return defaults on error to ensure frontend always works
    return NextResponse.json({ categories: DEFAULT_CATEGORIES }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=1209600',
      },
    });
  }
}
