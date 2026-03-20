'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

export default function NewWarehousePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    address_street: '',
    address_city: '',
    address_state: 'GA',
    address_zip: '',
    phone: '',
    email: '',
    is_primary: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const response = await fetch('/api/supplier/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          phone: formData.phone || null,
          email: formData.email || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create warehouse');
      }

      router.push('/supplier/warehouses');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create warehouse');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/supplier/warehouses"
            className="mb-4 flex items-center space-x-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Warehouses</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Add New Warehouse</h1>
          <p className="mt-1 text-slate-500">Create a new warehouse location</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="warehouse-name" className="block text-sm font-medium text-slate-700">
                Warehouse Name <span className="text-red-500">*</span>
              </label>
              <input
                id="warehouse-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
                placeholder="e.g., Main Warehouse"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="address-street" className="block text-sm font-medium text-slate-700">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                id="address-street"
                type="text"
                required
                value={formData.address_street}
                onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              />
            </div>

            <div>
              <label htmlFor="address-city" className="block text-sm font-medium text-slate-700">
                City <span className="text-red-500">*</span>
              </label>
              <input
                id="address-city"
                type="text"
                required
                value={formData.address_city}
                onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              />
            </div>

            <div>
              <label htmlFor="address-state" className="block text-sm font-medium text-slate-700">
                State <span className="text-red-500">*</span>
              </label>
              <select
                id="address-state"
                required
                value={formData.address_state}
                onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              >
                {US_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="address-zip" className="block text-sm font-medium text-slate-700">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                id="address-zip"
                type="text"
                required
                value={formData.address_zip}
                onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              />
            </div>

            <div>
              <label htmlFor="warehouse-phone" className="block text-sm font-medium text-slate-700">Phone</label>
              <PhoneInput
                id="warehouse-phone"
                value={formData.phone}
                onChange={(value) => setFormData({ ...formData, phone: value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              />
            </div>

            <div>
              <label htmlFor="warehouse-email" className="block text-sm font-medium text-slate-700">Email</label>
              <input
                id="warehouse-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_primary"
              checked={formData.is_primary}
              onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="is_primary" className="ml-2 text-sm text-slate-700">
              Set as primary warehouse
            </label>
          </div>

          <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-6">
            <Link
              href="/supplier/warehouses"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Create Warehouse</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

