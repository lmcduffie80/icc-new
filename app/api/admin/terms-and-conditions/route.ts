import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { termsSchema } from '@/lib/validation';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface TermsRecord {
  id: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  admin_name?: string;
}

// GET /api/admin/terms-and-conditions - Get active terms and version history
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check permission - allow view if user has any of these permissions
  const canView = session.permissions.includes('settings.manage') ||
                  session.permissions.includes('terms.view') ||
                  session.permissions.includes('terms.update');

  if (!canView) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Apply rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    // Get active terms
    const activeTerms = await queryOne<TermsRecord>(
      `SELECT id, title, content, version, is_active, updated_by, created_at, updated_at
       FROM terms_and_conditions
       WHERE is_active = true`
    );

    // Get version history (last 5 versions)
    const versionHistory = await query<TermsRecord>(
      `SELECT 
        t.id, t.title, t.version, t.is_active, t.updated_by, t.created_at, t.updated_at,
        LENGTH(t.content) as content_length,
        COALESCE(au.name, 'System') as admin_name
       FROM terms_and_conditions t
       LEFT JOIN admin_users au ON au.id = t.updated_by
       ORDER BY t.version DESC
       LIMIT 5`
    );

    return NextResponse.json({
      activeTerms,
      versionHistory,
    });
  } catch (error) {
    console.error('Error fetching terms and conditions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch terms and conditions' },
      { status: 500 }
    );
  }
}

// POST /api/admin/terms-and-conditions - Create new version
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check permission - allow update if user has settings.manage or terms.update
  const canUpdate = session.permissions.includes('settings.manage') ||
                    session.permissions.includes('terms.update');

  if (!canUpdate) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Apply rate limiting
  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const ip = getClientIp(request);

  try {
    const body = await request.json();
    
    // Validate input
    const validation = termsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, content } = validation.data;

    // Get current active version to determine next version number
    const currentTerms = await queryOne<{ version: number }>(
      'SELECT version FROM terms_and_conditions WHERE is_active = true'
    );
    const nextVersion = (currentTerms?.version || 0) + 1;

    // Begin transaction: deactivate old version and insert new one
    await query('BEGIN');

    try {
      // Deactivate current version
      await query(
        'UPDATE terms_and_conditions SET is_active = false WHERE is_active = true'
      );

      // Insert new version
      const newTerms = await queryOne<TermsRecord>(
        `INSERT INTO terms_and_conditions (title, content, version, is_active, updated_by)
         VALUES ($1, $2, $3, true, $4)
         RETURNING id, title, content, version, is_active, updated_by, created_at, updated_at`,
        [title, content, nextVersion, session.user.id]
      );

      await query('COMMIT');

      // Log admin action
      securityLogger.logAdminAction(
        session.user.id,
        session.user.email,
        'update_terms_and_conditions',
        newTerms?.id || 'unknown',
        ip,
        {
          version: nextVersion,
          title,
          contentLength: content.length,
        }
      );

      return NextResponse.json({
        success: true,
        terms: newTerms,
        message: `Version ${nextVersion} saved successfully`,
      });
    } catch (error) {
      // Rollback on error
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error saving terms and conditions:', error);
    securityLogger.logError('Failed to save terms and conditions', error, ip);
    
    return NextResponse.json(
      { error: 'Failed to save terms and conditions' },
      { status: 500 }
    );
  }
}
