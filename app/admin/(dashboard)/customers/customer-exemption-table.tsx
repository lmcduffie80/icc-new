'use client';

import { useState, useTransition } from 'react';
import { User, Mail, Search } from 'lucide-react';
import type { CustomerWithExemption } from './page';

interface CustomerExemptionTableProps {
  customers: CustomerWithExemption[];
}

export function CustomerExemptionTable({ customers }: CustomerExemptionTableProps) {
  const [exemptions, setExemptions] = useState<Record<string, boolean>>(
    Object.fromEntries(customers.map((c) => [c.user_id, c.invoice_exempt]))
  );
  const [pending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const handleToggle = (userId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setLoadingId(userId);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${userId}/invoice-exempt`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_exempt: newValue }),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Failed to update');
        } else {
          setExemptions((prev) => ({ ...prev, [userId]: newValue }));
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoadingId(null);
      }
    });
  };

  const filtered = customers.filter(
    (c) =>
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-slate-200">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-600">Customer</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
              <th className="px-4 py-3 text-center font-medium text-slate-600">
                Invoice Required
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  No customers found
                </td>
              </tr>
            ) : (
              filtered.map((customer) => {
                const isExempt = exemptions[customer.user_id] ?? customer.invoice_exempt;
                const isLoading = loadingId === customer.user_id && pending;

                return (
                  <tr key={customer.user_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="font-medium text-slate-900">{customer.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="text-slate-600">{customer.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-3">
                        {/* Toggle switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!isExempt}
                          aria-label={`Invoice required for ${customer.name || customer.email}`}
                          disabled={isLoading}
                          onClick={() => handleToggle(customer.user_id, isExempt)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer ${
                            !isExempt ? 'bg-emerald-600' : 'bg-slate-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              !isExempt ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span
                          className={`text-xs font-medium w-16 ${
                            !isExempt ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {isLoading ? 'Saving...' : !isExempt ? 'Required' : 'Exempt'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
