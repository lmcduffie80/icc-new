import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

const DEFAULT_UNITS_OF_MEASURE = [
  'unit',
  'lb',
  'gallon',
  'case',
  'bag',
  'oz',
  'quart',
];

interface UnitsOfMeasureSetting {
  key: string;
  value: {
    units_of_measure: string[];
  };
}

// GET /api/units-of-measure - Public endpoint for fetching units of measure
export async function GET() {
  try {
    const setting = await queryOne<UnitsOfMeasureSetting>(
      "SELECT * FROM site_settings WHERE key = 'units_of_measure'"
    );

    const unitsOfMeasure = setting?.value?.units_of_measure || DEFAULT_UNITS_OF_MEASURE;

    return NextResponse.json({ unitsOfMeasure });
  } catch (error) {
    console.error('Error fetching units of measure:', error);
    // Return defaults on error to ensure frontend always works
    return NextResponse.json({ unitsOfMeasure: DEFAULT_UNITS_OF_MEASURE });
  }
}
