'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, UserCheck, UserX, ChevronDown, ChevronUp, Loader2, FileText, Upload, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DistributorUser {
  user_id: string;
  name: string | null;
  email: string;
  customer_number: string | null;
  is_distributor: boolean;
  distributor_notes: string | null;
  distributor_company_name: string | null;
  distributor_ein: string | null;
  distributor_w9_url: string | null;
  distributor_w9_filename: string | null;
  distributor_w9_uploaded_at: string | null;
  distributor_approved_at: string | null;
  created_at: string;
}

interface EditState {
  notes: string;
  company_name: string;
  ein: string;
}

export function DistributorsTable() {
  const [users, setUsers] = useState<DistributorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyDistributors, setOnlyDistributors] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, EditState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (onlyDistributors) params.set('only_distributors', '1');
    try {
      const res = await fetch(`/api/admin/distributors?${params}`);
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search, onlyDistributors]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchUsers, search]);

  const getEdit = (user: DistributorUser): EditState =>
    editState[user.user_id] ?? {
      notes: user.distributor_notes ?? '',
      company_name: user.distributor_company_name ?? '',
      ein: user.distributor_ein ?? '',
    };

  const setField = (userId: string, field: keyof EditState, value: string) => {
    setEditState((prev) => ({
      ...prev,
      [userId]: { ...getEdit(users.find((u) => u.user_id === userId)!), ...prev[userId], [field]: value },
    }));
  };

  const saveProfile = async (user: DistributorUser) => {
    setSaving(user.user_id);
    setActionError(null);
    const edit = getEdit(user);
    try {
      const res = await fetch(`/api/admin/distributors/${user.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_distributor: user.is_distributor,
          distributor_notes: edit.notes || null,
          distributor_company_name: edit.company_name || null,
          distributor_ein: edit.ein || null,
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === user.user_id
              ? {
                  ...u,
                  distributor_notes: edit.notes || null,
                  distributor_company_name: edit.company_name || null,
                  distributor_ein: edit.ein || null,
                }
              : u
          )
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? `Failed to save profile (${res.status})`);
      }
    } finally {
      setSaving(null);
    }
  };

  const toggleDistributor = async (user: DistributorUser) => {
    setSaving(user.user_id);
    setActionError(null);
    const edit = getEdit(user);
    try {
      const res = await fetch(`/api/admin/distributors/${user.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_distributor: !user.is_distributor,
          distributor_notes: edit.notes || null,
          distributor_company_name: edit.company_name || null,
          distributor_ein: edit.ein || null,
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === user.user_id ? { ...u, is_distributor: !u.is_distributor } : u
          )
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(
          res.status === 401
            ? 'Your admin session has expired. Please sign out and sign back in, then try again.'
            : data.error ?? `Failed to update distributor access (${res.status})`
        );
      }
    } catch {
      setActionError('Network error — could not reach the server. Make sure the dev server is running.');
    } finally {
      setSaving(null);
    }
  };

  const handleW9Upload = async (userId: string, file: File) => {
    setUploading(userId);
    try {
      const formData = new FormData();
      formData.append('w9', file);
      const res = await fetch(`/api/admin/distributors/${userId}/w9`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json() as { w9_url: string; filename: string };
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId
              ? {
                  ...u,
                  distributor_w9_url: data.w9_url,
                  distributor_w9_filename: data.filename,
                  distributor_w9_uploaded_at: new Date().toISOString(),
                }
              : u
          )
        );
      } else {
        const err = await res.json() as { error: string };
        alert(err.error ?? 'Upload failed');
      }
    } finally {
      setUploading(null);
      setUploadTargetId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadTargetId) handleW9Upload(uploadTargetId, file);
          e.target.value = '';
        }}
      />

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, email, or customer #"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyDistributors}
            onChange={(e) => setOnlyDistributors(e.target.checked)}
            className="rounded"
          />
          Show distributors only
        </label>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-500">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Company</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Approved</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const edit = getEdit(user);
                return (
                  <>
                    <tr key={user.user_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{user.name ?? '—'}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                        {user.customer_number && (
                          <div className="text-xs text-slate-400">#{user.customer_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700 font-medium">{user.distributor_company_name ?? '—'}</div>
                        {user.distributor_ein && (
                          <div className="text-xs text-slate-400">EIN: {user.distributor_ein}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.is_distributor ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                            Distributor
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {user.distributor_approved_at
                          ? new Date(user.distributor_approved_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setExpanded(expanded === user.user_id ? null : user.user_id)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:cursor-pointer"
                            title="Edit details"
                          >
                            {expanded === user.user_id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          <Button
                            size="sm"
                            variant={user.is_distributor ? 'outline' : 'default'}
                            onClick={() => toggleDistributor(user)}
                            disabled={saving === user.user_id}
                            className={
                              user.is_distributor
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }
                          >
                            {saving === user.user_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : user.is_distributor ? (
                              <>
                                <UserX className="h-3 w-3 mr-1" />
                                Revoke
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3 w-3 mr-1" />
                                Grant Access
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable detail / edit row */}
                    {expanded === user.user_id && (
                      <tr key={`${user.user_id}-detail`} className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

                            {/* Company Name */}
                            <div>
                              <label className="text-xs font-medium text-slate-600 mb-1 block">
                                Company Name
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Acme Distributors LLC"
                                value={edit.company_name}
                                onChange={(e) => setField(user.user_id, 'company_name', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* EIN */}
                            <div>
                              <label className="text-xs font-medium text-slate-600 mb-1 block">
                                EIN Number
                              </label>
                              <input
                                type="text"
                                placeholder="XX-XXXXXXX"
                                value={edit.ein}
                                onChange={(e) => {
                                  // Auto-format: insert dash after 2 digits
                                  let val = e.target.value.replace(/[^0-9]/g, '');
                                  if (val.length > 2) val = val.slice(0, 2) + '-' + val.slice(2, 9);
                                  setField(user.user_id, 'ein', val);
                                }}
                                maxLength={10}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Internal Notes */}
                            <div>
                              <label className="text-xs font-medium text-slate-600 mb-1 block">
                                Internal Notes
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Verified by sales, Account #12345"
                                value={edit.notes}
                                onChange={(e) => setField(user.user_id, 'notes', e.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* W9 Upload */}
                            <div className="sm:col-span-2 lg:col-span-1">
                              <label className="text-xs font-medium text-slate-600 mb-1 block">
                                W9 Document
                              </label>
                              {user.distributor_w9_url ? (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={user.distributor_w9_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                                  >
                                    <FileText className="h-4 w-4 flex-shrink-0" />
                                    <span className="truncate max-w-[160px]">
                                      {user.distributor_w9_filename ?? 'View W9'}
                                    </span>
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                  <button
                                    onClick={() => {
                                      setUploadTargetId(user.user_id);
                                      fileInputRef.current?.click();
                                    }}
                                    className="text-xs text-slate-400 hover:text-slate-600 hover:cursor-pointer underline"
                                  >
                                    Replace
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setUploadTargetId(user.user_id);
                                    fileInputRef.current?.click();
                                  }}
                                  disabled={uploading === user.user_id}
                                  className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:cursor-pointer transition-colors disabled:opacity-50"
                                >
                                  {uploading === user.user_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                  Upload W9 (PDF, JPG, PNG)
                                </button>
                              )}
                              {user.distributor_w9_uploaded_at && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Uploaded {new Date(user.distributor_w9_uploaded_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Save button */}
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              onClick={() => saveProfile(user)}
                              disabled={saving === user.user_id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {saving === user.user_id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : null}
                              Save Profile
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Showing {users.length} user{users.length !== 1 ? 's' : ''}.
      </p>
    </div>
  );
}
