import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { securityLogger } from '@/lib/security-logger';
import { sendContractExpiryReminder } from '@/lib/email';
import { getEffectivePermissions } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';

interface ExpiringContract {
  id: string;
  contract_type: string;
  expiry_date: string;
  supplier_name: string;
  supplier_company_name: string;
  days_until_expiry: number;
}

interface AdminRow {
  id: string;
  email: string;
  name: string | null;
  role_permissions: Permission[];
  custom_permissions: { grant: Permission[]; revoke: Permission[] };
}

/**
 * POST /api/cron/contract-expiry-reminders
 *
 * Called daily by Vercel Cron at 8am UTC.
 * Finds active contracts expiring within 30 days and emails all admins
 * who hold the contracts.sign (Signature Authority) permission.
 *
 * Authenticated via Authorization: Bearer <CRON_SECRET> header.
 */
export async function POST(request: NextRequest) {
  // Authenticate the cron request
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[CRON] CRON_SECRET is not configured — skipping authentication check in dev');
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      path: '/api/cron/contract-expiry-reminders',
      method: 'POST',
      details: { reason: 'Invalid cron secret' },
      severity: 'high',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Find active contracts expiring within 30 days
    const expiringContracts = await query<ExpiringContract>(`
      SELECT
        sc.id,
        sc.contract_type,
        sc.expiry_date::text,
        su.name as supplier_name,
        su.company_name as supplier_company_name,
        (sc.expiry_date - CURRENT_DATE)::int as days_until_expiry
      FROM supplier_contracts sc
      JOIN supplier_users su ON sc.supplier_id = su.id
      WHERE sc.status = 'active'
        AND sc.expiry_date IS NOT NULL
        AND sc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY sc.expiry_date ASC
    `);

    if (expiringContracts.length === 0) {
      securityLogger.logEvent({
        type: 'admin_action',
        ip: 'system',
        path: '/api/cron/contract-expiry-reminders',
        method: 'POST',
        details: { action: 'cron_ran', contractsFound: 0 },
        severity: 'low',
      });
      return NextResponse.json({ sent: 0, contracts: 0, message: 'No expiring contracts found' });
    }

    // 2. Find all admins with the contracts.sign permission
    const allAdmins = await query<AdminRow>(`
      SELECT
        au.id,
        au.email,
        au.name,
        ar.permissions as role_permissions,
        au.custom_permissions
      FROM admin_users au
      JOIN admin_roles ar ON au.role_id = ar.id
      WHERE au.email IS NOT NULL
    `);

    const signingAdmins = allAdmins.filter((admin) => {
      const effective = getEffectivePermissions(
        admin.role_permissions || [],
        admin.custom_permissions || { grant: [], revoke: [] }
      );
      return effective.includes('contracts.sign');
    });

    if (signingAdmins.length === 0) {
      securityLogger.logEvent({
        type: 'admin_action',
        ip: 'system',
        path: '/api/cron/contract-expiry-reminders',
        method: 'POST',
        details: { action: 'cron_ran', contractsFound: expiringContracts.length, adminsNotified: 0, reason: 'No admins with contracts.sign permission' },
        severity: 'low',
      });
      return NextResponse.json({
        sent: 0,
        contracts: expiringContracts.length,
        message: 'No admins with contracts.sign permission found',
      });
    }

    // 3. Send one consolidated email per qualifying admin
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'https://app.innovativecropcare.com';
    const adminPortalUrl = `${baseUrl}/admin/partners/contracts`;

    let emailsSent = 0;
    for (const admin of signingAdmins) {
      const result = await sendContractExpiryReminder({
        to: admin.email,
        adminName: admin.name || 'Admin',
        contracts: expiringContracts.map((c) => ({
          id: c.id,
          supplierCompany: c.supplier_company_name,
          contractType: c.contract_type,
          expiryDate: c.expiry_date,
          daysUntilExpiry: c.days_until_expiry,
        })),
        adminPortalUrl,
      });

      if (result.success) {
        emailsSent++;
      } else {
        console.error(`[CRON] Failed to send expiry reminder to ${admin.email}:`, result.error);
      }
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/api/cron/contract-expiry-reminders',
      method: 'POST',
      details: {
        action: 'contract_expiry_reminders_sent',
        contractsFound: expiringContracts.length,
        adminsNotified: emailsSent,
      },
      severity: 'low',
    });

    return NextResponse.json({
      sent: emailsSent,
      contracts: expiringContracts.length,
      message: `Sent ${emailsSent} reminder email${emailsSent !== 1 ? 's' : ''} for ${expiringContracts.length} expiring contract${expiringContracts.length !== 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error('[CRON] Error running contract expiry reminders:', error);
    securityLogger.logError('Failed to run contract expiry reminders cron', error, 'system');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
