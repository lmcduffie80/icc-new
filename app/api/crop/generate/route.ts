import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { generateFarmerPlan } from '@/lib/ai';
import type { ProductForAI, ApprovedProductRate } from '@/lib/ai';

export const maxDuration = 60;

const generateSchema = z.object({
  crop: z.enum(['corn', 'soybeans', 'wheat', 'cotton']),
  acres: z.number().positive().max(1000000),
  targetWeeds: z.array(z.string().max(100)).min(1).max(20),
  weedPressure: z.enum(['light', 'moderate', 'heavy']),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/crop/generate', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI features are not configured. Please contact support.' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const { crop, targetWeeds, weedPressure } = parsed.data;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const products = await query<{
      id: string;
      name: string;
      category: string;
      price: string;
      unit_of_measure: string | null;
      attributes: Record<string, string> | null;
      features: string[] | null;
      specifications: Record<string, string> | null;
    }>(
      `SELECT id, name, category, price, unit_of_measure, attributes, features, specifications
       FROM products
       WHERE deleted_at IS NULL
         AND in_stock = true
         AND category IN ('Herbicides', 'Fungicides', 'Insecticides', 'Adjuvants', 'Plant-Growth Regulators')
       ORDER BY category, name`
    );

    if (products.length === 0) {
      return NextResponse.json(
        { error: 'No products are currently available to build a plan.' },
        { status: 404 }
      );
    }

    const productsForAI: ProductForAI[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit_of_measure: p.unit_of_measure,
      active_ingredients: p.attributes?.activeIngredients ?? null,
      application_rate_range: p.attributes?.applicationRateRange ?? null,
      container_sizes: p.attributes?.containerSizes ?? null,
      package_type: p.attributes?.packageType ?? null,
      lbs_per_gallon: p.attributes?.lbsPerGallon ?? null,
      epa_registration_number: p.attributes?.epaRegistrationNumber ?? null,
      epa_signal_word: p.attributes?.epaSignalWord ?? null,
      features: p.features,
      specifications: p.specifications,
    }));

    // Fetch admin-approved rates from acre_pack_pass_products for this crop
    // Use the crop-specific program so rates match what ICC has configured
    const approvedRateRows = await query<{
      product_id: string;
      default_rate_per_acre: string;
      min_rate: string;
      max_rate: string;
      rate_unit: string;
      unit_size: string;
      unit_size_unit: string | null;
      lbs_per_gallon: string | null;
    }>(
      `SELECT DISTINCT ON (app.product_id)
         app.product_id,
         app.default_rate_per_acre,
         app.min_rate,
         app.max_rate,
         app.rate_unit,
         app.unit_size,
         app.unit_size_unit,
         app.lbs_per_gallon
       FROM acre_pack_pass_products app
       JOIN acre_pack_passes ap ON ap.id = app.pass_id
       JOIN acre_pack_programs prog ON prog.id = ap.program_id
       WHERE prog.crop = $1
         AND prog.is_active = true
       ORDER BY app.product_id, app.sort_order`,
      [crop]
    );

    const approvedRates = new Map<string, ApprovedProductRate>(
      approvedRateRows.map((r) => [
        r.product_id,
        {
          default_rate_per_acre: parseFloat(r.default_rate_per_acre),
          min_rate: parseFloat(r.min_rate),
          max_rate: parseFloat(r.max_rate),
          rate_unit: r.rate_unit,
          unit_size: parseFloat(r.unit_size),
          unit_size_unit: r.unit_size_unit,
          lbs_per_gallon: r.lbs_per_gallon ? parseFloat(r.lbs_per_gallon) : null,
        },
      ])
    );

    const draft = await generateFarmerPlan(crop, targetWeeds, weedPressure, productsForAI, approvedRates);

    return NextResponse.json({ draft });
  } catch (error) {
    securityLogger.logError('Farmer AI plan generation failed', error, ip);

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
    }
    if (message.includes('unknown product_id')) {
      return NextResponse.json(
        { error: 'AI generated an invalid plan. Please try again.' },
        { status: 422 }
      );
    }

    // Handle Anthropic SDK-specific errors
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json({ error: 'AI service is not configured correctly. Please contact support.' }, { status: 503 });
      }
      if (error.status === 429) {
        return NextResponse.json({ error: 'AI service is temporarily busy. Please try again in a moment.' }, { status: 503 });
      }
      if (error.status === 529 || error.status === 500) {
        return NextResponse.json({ error: 'AI service is temporarily unavailable. Please try again.' }, { status: 503 });
      }
    }

    // Timeout (request exceeded maxDuration or Anthropic SDK timeout)
    if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out')) {
      return NextResponse.json({ error: 'Plan generation timed out. Please try again.' }, { status: 503 });
    }

    return NextResponse.json({ error: 'Failed to generate plan. Please try again.' }, { status: 500 });
  }
}
