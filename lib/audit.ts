import { headers } from 'next/headers';
import { query, queryOne } from './db';
import {
  AuditLogEntry,
  AuditAction,
  ResourceType,
  AuditLogFilter,
  formatAuditAction,
} from './audit-types';

// Re-export types and utilities for convenience
export type { AuditLogEntry, AuditAction, ResourceType, AuditLogFilter };
export { formatAuditAction };

interface LogActionParams {
  adminUserId: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

// Log an admin action
export async function logAction({
  adminUserId,
  action,
  resourceType,
  resourceId,
  before,
  after,
}: LogActionParams): Promise<AuditLogEntry> {
  // Get IP and user agent from headers
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || headersList.get('x-real-ip') || null;
  const userAgent = headersList.get('user-agent') || null;

  const result = await queryOne<AuditLogEntry>(
    `INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, before_value, after_value, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      adminUserId,
      action,
      resourceType,
      resourceId || null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      ipAddress,
      userAgent,
    ]
  );

  return result!;
}

// Get audit log entries with filtering
export async function getAuditLog(filter: AuditLogFilter = {}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter.adminUserId) {
    conditions.push(`al.admin_user_id = $${paramIndex++}`);
    params.push(filter.adminUserId);
  }

  if (filter.action) {
    conditions.push(`al.action = $${paramIndex++}`);
    params.push(filter.action);
  }

  if (filter.resourceType) {
    conditions.push(`al.resource_type = $${paramIndex++}`);
    params.push(filter.resourceType);
  }

  if (filter.resourceId) {
    conditions.push(`al.resource_id = $${paramIndex++}`);
    params.push(filter.resourceId);
  }

  if (filter.startDate) {
    conditions.push(`al.created_at >= $${paramIndex++}`);
    params.push(filter.startDate.toISOString());
  }

  if (filter.endDate) {
    conditions.push(`al.created_at <= $${paramIndex++}`);
    params.push(filter.endDate.toISOString());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM admin_audit_log al ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.count || '0', 10);

  // Get entries with pagination
  const limit = filter.limit || 50;
  const offset = filter.offset || 0;

  const entries = await query<AuditLogEntry>(
    `SELECT 
      al.*,
      u.email as admin_email,
      u.name as admin_name
    FROM admin_audit_log al
    LEFT JOIN admin_users au ON au.id = al.admin_user_id
    LEFT JOIN "user" u ON u.id = au.user_id
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  return { entries, total };
}

// Get audit log for a specific resource
export async function getResourceAuditLog(
  resourceType: ResourceType,
  resourceId: string
): Promise<AuditLogEntry[]> {
  return query<AuditLogEntry>(
    `SELECT 
      al.*,
      u.email as admin_email,
      u.name as admin_name
    FROM admin_audit_log al
    LEFT JOIN admin_users au ON au.id = al.admin_user_id
    LEFT JOIN "user" u ON u.id = au.user_id
    WHERE al.resource_type = $1 AND al.resource_id = $2
    ORDER BY al.created_at DESC`,
    [resourceType, resourceId]
  );
}

// Get recent activity for dashboard
export async function getRecentActivity(limit: number = 10): Promise<AuditLogEntry[]> {
  return query<AuditLogEntry>(
    `SELECT 
      al.*,
      u.email as admin_email,
      u.name as admin_name
    FROM admin_audit_log al
    LEFT JOIN admin_users au ON au.id = al.admin_user_id
    LEFT JOIN "user" u ON u.id = au.user_id
    ORDER BY al.created_at DESC
    LIMIT $1`,
    [limit]
  );
}


