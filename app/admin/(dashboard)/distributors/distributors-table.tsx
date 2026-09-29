'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, UserCheck, UserX, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DistributorUser {
  user_id: string;
  name: string | null;
  email: string;
  customer_number: string | null;
  is_distributor: boolean;
  distributor_notes: string | null;
  distributor_approved_at: string | null;
  created_at: string;
}

export function DistributorsTable() {
  const [users, setUsers] = useState<DistributorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyDistributors, setOnlyDistributors] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [notesEdit, setNotesEdit] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const toggleDistributor = async (user: DistributorUser) => {
    setSaving(user.user_id);
    try {
      const res = await fetch(`/api/admin/distributors/${user.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_distributor: !user.is_distributor,
          distributor_notes: notesEdit[user.user_id] ?? user.distributor_notes,
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === user.user_id ? { ...u, is_distributor: !u.is_distributor } : u
          )
        );
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Customer #</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Approved</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <>
                  <tr key={user.user_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{user.name ?? '—'}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.customer_number ?? '—'}</td>
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
                          title="Notes"
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
                  {/* Expandable notes row */}
                  {expanded === user.user_id && (
                    <tr key={`${user.user_id}-notes`} className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <label className="text-xs font-medium text-slate-600 mb-1 block">
                              Internal notes (saved on next grant/revoke)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Verified by sales team, Account #12345"
                              value={notesEdit[user.user_id] ?? user.distributor_notes ?? ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setNotesEdit((prev) => ({
                                  ...prev,
                                  [user.user_id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
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
