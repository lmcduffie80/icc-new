import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupplierSession } from './supplier-auth';
import { checkRateLimit, rateLimiters, createRateLimitResponse, getClientIp } from './rate-limit';
import { securityLogger } from './security-logger';

export interface SupplierAuthResult {
  authorized: boolean;
  response?: NextResponse | Response;
  session?: Awaited<ReturnType<typeof getSupplierSession>>;
}

/**
 * Verify supplier session with rate limiting
 */
export async function verifySupplierAuth(request: NextRequest): Promise<SupplierAuthResult> {
  const ip = getClientIp(request);

  try {
    // Check rate limit for supplier routes (moderate rate limiting)
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, request.url, request.method);
      return {
        authorized: false,
        response: createRateLimitResponse(rateLimitResult.reset),
      };
    }

    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('supplier_session')?.value;

    if (!sessionToken) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ),
      };
    }

    // Get supplier session directly
    const supplierSession = await getSupplierSession();

    if (!supplierSession) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Session expired or invalid' },
          { status: 401 }
        ),
      };
    }

    return {
      authorized: true,
      session: supplierSession,
    };
  } catch (error) {
    securityLogger.logError('Supplier auth verification failed', error, ip);
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }
}

/**
 * Verify supplier session WITHOUT rate limiting
 * Use this when you want to apply custom rate limiting before auth
 */
export async function verifySupplierAuthWithoutRateLimit(request: NextRequest): Promise<SupplierAuthResult> {
  const ip = getClientIp(request);

  try {
    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('supplier_session')?.value;

    if (!sessionToken) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ),
      };
    }

    // Get supplier session directly
    const supplierSession = await getSupplierSession();

    if (!supplierSession) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Session expired or invalid' },
          { status: 401 }
        ),
      };
    }

    return {
      authorized: true,
      session: supplierSession,
    };
  } catch (error) {
    securityLogger.logError('Supplier auth verification failed', error, ip);
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }
}

