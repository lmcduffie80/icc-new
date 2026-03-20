import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

export const dynamic = 'force-dynamic';

const VALID_CROPS = ['corn', 'soybeans', 'wheat', 'cotton'] as const;
type Crop = typeof VALID_CROPS[number];

export interface AcrePackProduct {
  id: string;
  name: string;
  price: string;
  image: string | null;
  unit_of_measure: string | null;
  in_stock: boolean;
  approved_states: string[];
  truckload_eligible: boolean;
  gallons_per_case: number | null;
  cases_per_pallet: number | null;
  bulk_density_lbs_per_gallon: number | null;
  // Pass-specific fields
  pass_product_id: number;
  is_recommended: boolean;
  default_rate_per_acre: number;
  min_rate: number;
  max_rate: number;
  rate_unit: string;
  unit_size: number;
  unit_size_unit: string | null;
  lbs_per_gallon: number | null;
  label_scenarios: Array<{ label: string; rate: number }> | null;
  sort_order: number;
}

export interface AcrePackPass {
  id: number;
  name: string;
  timing_label: string | null;
  category: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  products: AcrePackProduct[];
}

export interface AcrePackProgram {
  id: number;
  crop: string;
  name: string;
  description: string | null;
  image_url: string | null;
  passes: AcrePackPass[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ crop: string }> }
) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/acre-pack/[crop]', 'GET');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const { crop } = await params;
  const cropLower = crop.toLowerCase() as Crop;

  if (!VALID_CROPS.includes(cropLower)) {
    return NextResponse.json(
      { error: 'Invalid crop. Must be one of: corn, soybeans, wheat, cotton' },
      { status: 400 }
    );
  }

  try {
    // Fetch program
    const programRows = await query<{
      id: number;
      crop: string;
      name: string;
      description: string | null;
      image_url: string | null;
    }>(
      `SELECT id, crop, name, description, image_url
       FROM acre_pack_programs
       WHERE crop = $1 AND is_active = true
       LIMIT 1`,
      [cropLower]
    );

    if (programRows.length === 0) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    const program = programRows[0];

    // Fetch passes with their products in one query
    const rows = await query<{
      pass_id: number;
      pass_name: string;
      timing_label: string | null;
      category: string;
      pass_description: string | null;
      is_required: boolean;
      pass_sort_order: number;
      product_id: string | null;
      product_name: string | null;
      price: string | null;
      image: string | null;
      unit_of_measure: string | null;
      in_stock: boolean | null;
      approved_states: string[] | null;
      truckload_eligible: boolean | null;
      gallons_per_case: number | null;
      cases_per_pallet: number | null;
      bulk_density_lbs_per_gallon: number | null;
      pass_product_id: number | null;
      is_recommended: boolean | null;
      default_rate_per_acre: string | null;
      min_rate: string | null;
      max_rate: string | null;
      rate_unit: string | null;
      unit_size: string | null;
      unit_size_unit: string | null;
      lbs_per_gallon: string | null;
      label_scenarios: Array<{ label: string; rate: number }> | null;
      product_sort_order: number | null;
    }>(
      `SELECT
         ap.id              AS pass_id,
         ap.name            AS pass_name,
         ap.timing_label,
         ap.category,
         ap.description     AS pass_description,
         ap.is_required,
         ap.sort_order      AS pass_sort_order,
         p.id               AS product_id,
         p.name             AS product_name,
         p.price,
         p.image,
         p.unit_of_measure,
         p.in_stock,
         p.approved_states,
         p.truckload_eligible,
         p.gallons_per_case,
         p.cases_per_pallet,
         p.bulk_density_lbs_per_gallon,
         app.id             AS pass_product_id,
         app.is_recommended,
         app.default_rate_per_acre,
         app.min_rate,
         app.max_rate,
         app.rate_unit,
         app.unit_size,
         app.unit_size_unit,
         app.lbs_per_gallon,
         app.label_scenarios,
         app.sort_order     AS product_sort_order
       FROM acre_pack_passes ap
       LEFT JOIN acre_pack_pass_products app ON app.pass_id = ap.id
       LEFT JOIN products p ON p.id = app.product_id
         AND p.deleted_at IS NULL
         AND p.approval_status = 'published'
       WHERE ap.program_id = $1
       ORDER BY ap.sort_order, app.sort_order`,
      [program.id]
    );

    // Group into passes
    const passMap = new Map<number, AcrePackPass>();
    for (const row of rows) {
      if (!passMap.has(row.pass_id)) {
        passMap.set(row.pass_id, {
          id: row.pass_id,
          name: row.pass_name,
          timing_label: row.timing_label,
          category: row.category,
          description: row.pass_description,
          is_required: row.is_required,
          sort_order: row.pass_sort_order,
          products: [],
        });
      }

      if (row.product_id && row.pass_product_id !== null) {
        passMap.get(row.pass_id)!.products.push({
          id: row.product_id,
          name: row.product_name!,
          price: row.price!,
          image: row.image,
          unit_of_measure: row.unit_of_measure,
          in_stock: row.in_stock ?? true,
          approved_states: row.approved_states ?? [],
          truckload_eligible: row.truckload_eligible ?? false,
          gallons_per_case: row.gallons_per_case ?? null,
          cases_per_pallet: row.cases_per_pallet ?? null,
          bulk_density_lbs_per_gallon: row.bulk_density_lbs_per_gallon ?? null,
          pass_product_id: row.pass_product_id,
          is_recommended: row.is_recommended ?? false,
          default_rate_per_acre: parseFloat(row.default_rate_per_acre ?? '1'),
          min_rate: parseFloat(row.min_rate ?? '0.5'),
          max_rate: parseFloat(row.max_rate ?? '4'),
          rate_unit: row.rate_unit ?? 'fl oz',
          unit_size: parseFloat(row.unit_size ?? '1'),
          unit_size_unit: row.unit_size_unit ?? null,
          lbs_per_gallon: row.lbs_per_gallon ? parseFloat(row.lbs_per_gallon) : null,
          label_scenarios: row.label_scenarios ?? null,
          sort_order: row.product_sort_order ?? 0,
        });
      }
    }

    const result: AcrePackProgram = {
      id: program.id,
      crop: program.crop,
      name: program.name,
      description: program.description,
      image_url: program.image_url,
      passes: Array.from(passMap.values()),
    };

    return NextResponse.json(result);
  } catch (error) {
    securityLogger.logError('AcrePack program fetch failed', error, ip);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
