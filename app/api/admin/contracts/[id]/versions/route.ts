import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query, queryOne } from '@/lib/db';

/**
 * GET /api/admin/contracts/[id]/versions
 * Returns the version history chain for a given contract.
 * Traces back via parent_contract_id to find the root, then returns all versions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);

  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasPermission = session.permissions.includes('admins.view');
  if (!hasPermission) {
    securityLogger.logPermissionDenied(
      session.user.id,
      session.user.email,
      '/api/admin/contracts/[id]/versions',
      'admins.view',
      ip
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Get the current contract to find its supplier and root
    const current = await queryOne<{
      id: string;
      supplier_id: string;
      parent_contract_id: string | null;
    }>(`
      SELECT id, supplier_id, parent_contract_id FROM supplier_contracts WHERE id = $1
    `, [id]);

    if (!current) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Find the root contract by tracing back parent_contract_id
    let rootId = current.id;
    if (current.parent_contract_id) {
      let parentId: string | null = current.parent_contract_id;
      while (parentId) {
        const ancestor: { id: string; parent_contract_id: string | null } | null =
          await queryOne<{ id: string; parent_contract_id: string | null }>(`
            SELECT id, parent_contract_id FROM supplier_contracts WHERE id = $1
          `, [parentId]);
        if (ancestor) {
          rootId = ancestor.id;
          parentId = ancestor.parent_contract_id;
        } else {
          break;
        }
      }
    }

    // Now get all contracts in this chain:
    // The root (parent_contract_id IS NULL with id = rootId)
    // Plus all descendants that trace back to rootId
    const versions = await query<{
      id: string;
      version: number;
      status: string;
      created_at: string;
      contract_date: string;
    }>(`
      WITH RECURSIVE version_chain AS (
        SELECT id, version, status, created_at, contract_date, parent_contract_id
        FROM supplier_contracts
        WHERE id = $1
        UNION ALL
        SELECT sc.id, sc.version, sc.status, sc.created_at, sc.contract_date, sc.parent_contract_id
        FROM supplier_contracts sc
        INNER JOIN version_chain vc ON sc.parent_contract_id = vc.id
      )
      SELECT id, version, status, created_at, contract_date
      FROM version_chain
      ORDER BY version DESC
    `, [rootId]);

    return NextResponse.json({ versions });
  } catch (error) {
    console.error('Error fetching contract versions:', error);
    securityLogger.logError('Failed to fetch contract versions', error, ip);
    return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
  }
}
