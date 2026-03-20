'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuditLogEntry, formatAuditAction, AuditAction, ResourceType } from '@/lib/audit-types';
import { ChevronLeft, ChevronRight, Filter, X, Clock, User } from 'lucide-react';

interface AdminUser {
  id: string;
  user_email: string | null;
  user_name: string | null;
}

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  admins: AdminUser[];
  currentPage: number;
  totalPages: number;
  totalEntries: number;
  filters: {
    action?: string;
    resource_type?: string;
    admin_user_id?: string;
  };
}

const actions: AuditAction[] = [
  'create',
  'update',
  'delete',
  'status_change',
  'refund',
  'permission_change',
  'role_change',
  'publish',
  'unpublish',
];

const resourceTypes: ResourceType[] = [
  'product',
  'order',
  'user',
  'admin_user',
  'admin_role',
  'content',
  'settings',
];

export function AuditLogTable({
  entries,
  admins,
  currentPage,
  totalPages,
  totalEntries,
  filters,
}: AuditLogTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const updateFilters = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1'); // Reset to first page
    router.push(`/admin/audit-log?${params.toString()}`);
  };

  const changePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`/admin/audit-log?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push('/admin/audit-log');
  };

  const hasActiveFilters = filters.action || filters.resource_type || filters.admin_user_id;

  const formatDate = (date: string) =>
    new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800',
    status_change: 'bg-purple-100 text-purple-800',
    refund: 'bg-orange-100 text-orange-800',
    permission_change: 'bg-yellow-100 text-yellow-800',
    role_change: 'bg-indigo-100 text-indigo-800',
    publish: 'bg-green-100 text-green-800',
    unpublish: 'bg-slate-100 text-slate-800',
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                Active
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
              Clear filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
            <div>
              <label htmlFor="audit-action-filter" className="block text-sm font-medium text-slate-700">Action</label>
              <select
                id="audit-action-filter"
                value={filters.action || ''}
                onChange={(e) => updateFilters('action', e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">All actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-resource-filter" className="block text-sm font-medium text-slate-700">Resource Type</label>
              <select
                id="audit-resource-filter"
                value={filters.resource_type || ''}
                onChange={(e) => updateFilters('resource_type', e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">All types</option>
                {resourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-admin-filter" className="block text-sm font-medium text-slate-700">Admin User</label>
              <select
                id="audit-admin-filter"
                value={filters.admin_user_id || ''}
                onChange={(e) => updateFilters('admin_user_id', e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">All admins</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.user_name || admin.user_email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No audit log entries found
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <div key={entry.id} className="hover:bg-slate-50">
                <button
                  onClick={() =>
                    setExpandedEntry(expandedEntry === entry.id ? null : entry.id)
                  }
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">
                        {entry.admin_name || entry.admin_email || 'System'}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        actionColors[entry.action] || 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {formatAuditAction(entry.action as AuditAction, entry.resource_type as ResourceType)}
                    </span>
                    {entry.resource_id && (
                      <span className="text-sm text-slate-500">
                        #{entry.resource_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Clock className="h-4 w-4" />
                    {formatDate(entry.created_at)}
                  </div>
                </button>

                {/* Expanded Details */}
                {expandedEntry === entry.id && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {entry.before_value && (
                        <div>
                          <h4 className="mb-2 text-sm font-medium text-slate-700">Before</h4>
                          <pre className="overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-100">
                            {JSON.stringify(entry.before_value, null, 2)}
                          </pre>
                        </div>
                      )}
                      {entry.after_value && (
                        <div>
                          <h4 className="mb-2 text-sm font-medium text-slate-700">After</h4>
                          <pre className="overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-100">
                            {JSON.stringify(entry.after_value, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                      {entry.ip_address && <span>IP: {entry.ip_address}</span>}
                      {entry.user_agent && (
                        <span className="truncate max-w-xs" title={entry.user_agent}>
                          UA: {entry.user_agent.slice(0, 50)}...
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(currentPage - 1) * 25 + 1} to {Math.min(currentPage * 25, totalEntries)} of{' '}
            {totalEntries} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

