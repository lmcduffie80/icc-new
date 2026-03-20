import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters, checkRateLimit, createRateLimitResponse } from '@/lib/rate-limit';
import { taxCalculateSchema } from '@/lib/validation';
import { calculateTax, getTaxRateForState } from '@/lib/tax';

/**
 * POST /api/tax/calculate - Calculate tax for a given subtotal and state
 * 
 * Public endpoint used during checkout flow
 * Rate limited to 10 requests per minute (lenient)
 * 
 * Request body:
 * {
 *   subtotal: number,  // Product subtotal in dollars
 *   state: string      // Two-letter US state code (e.g., 'CA', 'NY')
 * }
 * 
 * Response:
 * {
 *   tax: number,       // Tax amount in dollars
 *   rate: number,      // Tax rate as decimal (e.g., 0.021 for 2.1%)
 *   state: string      // State code
 * }
 */
export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const body = await request.json();
    
    // Validate input
    const result = taxCalculateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const { subtotal, state } = result.data;

    // Calculate tax
    const taxAmount = await calculateTax(subtotal, state);
    const taxRate = await getTaxRateForState(state);

    return NextResponse.json({
      tax: taxAmount,
      rate: taxRate,
      state: state,
    });
  } catch (error) {
    console.error('Error calculating tax:', error);
    return NextResponse.json(
      { error: 'Failed to calculate tax' },
      { status: 500 }
    );
  }
}
