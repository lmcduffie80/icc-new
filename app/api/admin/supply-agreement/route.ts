import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { termsSchema } from '@/lib/validation';
import { rateLimiters, checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface SupplyAgreementRecord {
  id: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  admin_name?: string;
  content_length?: number;
}

// GET /api/admin/supply-agreement - Get active template and version history
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canView =
    session.permissions.includes('contracts.view') ||
    session.permissions.includes('contracts.manage_template') ||
    session.permissions.includes('settings.manage');

  if (!canView) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const activeTemplate = await queryOne<SupplyAgreementRecord>(
      `SELECT id, title, content, version, is_active, updated_by, created_at, updated_at
       FROM supply_agreement_templates
       WHERE is_active = true`
    );

    const versionHistory = await query<SupplyAgreementRecord>(
      `SELECT
        t.id, t.title, t.version, t.is_active, t.updated_by, t.created_at, t.updated_at,
        LENGTH(t.content) as content_length,
        COALESCE(au.name, 'System') as admin_name
       FROM supply_agreement_templates t
       LEFT JOIN admin_users au ON au.id = t.updated_by
       ORDER BY t.version DESC
       LIMIT 5`
    );

    return NextResponse.json({ activeTemplate, versionHistory });
  } catch (error) {
    console.error('Error fetching supply agreement template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supply agreement template' },
      { status: 500 }
    );
  }
}

// POST /api/admin/supply-agreement - Save new version
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canUpdate =
    session.permissions.includes('contracts.manage_template') ||
    session.permissions.includes('settings.manage');

  if (!canUpdate) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const ip = getClientIp(request);

  try {
    const body = await request.json();

    const validation = termsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, content } = validation.data;

    const currentTemplate = await queryOne<{ version: number }>(
      'SELECT version FROM supply_agreement_templates WHERE is_active = true'
    );
    const nextVersion = (currentTemplate?.version || 0) + 1;

    const newTemplate = await withTransaction(async (client) => {
      await client.query(
        'UPDATE supply_agreement_templates SET is_active = false WHERE is_active = true'
      );

      const { rows } = await client.query<SupplyAgreementRecord>(
        `INSERT INTO supply_agreement_templates (title, content, version, is_active, updated_by)
         VALUES ($1, $2, $3, true, $4)
         RETURNING id, title, content, version, is_active, updated_by, created_at, updated_at`,
        [title, content, nextVersion, session.user.id]
      );

      return rows[0] ?? null;
    });

    securityLogger.logAdminAction(
      session.user.id,
      session.user.email,
      'update_supply_agreement_template',
      newTemplate?.id || 'unknown',
      ip,
      { version: nextVersion, title, contentLength: content.length }
    );

    return NextResponse.json({
      success: true,
      template: newTemplate,
      message: `Version ${nextVersion} saved successfully`,
    });
  } catch (error) {
    console.error('Error saving supply agreement template:', error);
    securityLogger.logError('Failed to save supply agreement template', error, ip);
    return NextResponse.json(
      { error: 'Failed to save supply agreement template' },
      { status: 500 }
    );
  }
}
