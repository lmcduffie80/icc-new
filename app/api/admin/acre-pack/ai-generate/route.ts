import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { securityLogger } from '@/lib/security-logger';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { generateAcrePackProgram } from '@/lib/ai';
import type { ProductForAI } from '@/lib/ai';

const generateSchema = z.object({
  crop: z.enum(['corn', 'soybeans', 'wheat', 'cotton']),
});

export async function POST(request: NextRequest) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ip = getClientIp(request);
  const session = authResult.session!;

  if (!session.permissions.includes('acrepack.manage_programs')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    securityLogger.logRateLimitExceeded(ip, '/api/admin/acre-pack/ai-generate', 'POST');
    return createRateLimitResponse(rateLimitResult.reset);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI features are not configured. Set ANTHROPIC_API_KEY to enable.' },
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

  const { crop } = parsed.data;

  try {
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
        { error: 'No applicable products found in the store to generate a program.' },
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

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_ai_generate_started',
      crop,
      ip,
      { productCount: productsForAI.length }
    );

    const draft = await generateAcrePackProgram(crop, productsForAI);

    securityLogger.logAdminAction(
      session.admin_user_id,
      session.admin_email,
      'acre_pack_ai_generate_completed',
      crop,
      ip,
      { passCount: draft.passes.length }
    );

    return NextResponse.json({ draft });
  } catch (error) {
    securityLogger.logError('AI AcrePack generation failed', error, ip);

    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
    }
    if (message.includes('unknown product_id')) {
      return NextResponse.json(
        { error: `AI generated an invalid program: ${message}. Please try again.` },
        { status: 422 }
      );
    }

    return NextResponse.json({ error: 'Failed to generate program. Please try again.' }, { status: 500 });
  }
}
