'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Building2 } from 'lucide-react';
import { US_STATES } from '@/components/ui/state-select';

interface BillToAddress {
  id: number;
  company_name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

interface BillToAddressFormProps {
  address: BillToAddress | null;
}

export function BillToAddressForm({ address }: BillToAddressFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formData, setFormData] = useState({
    company_name: address?.company_name ?? '',
    address1: address?.address1 ?? '',
    address2: address?.address2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    zip_code: address?.zip_code ?? '',
    country: address?.country ?? 'United States',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setStatus(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch('/api/admin/addresses/bill-to', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: 'Bill-to address updated successfully.' });
        router.refresh();
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to update address.' });
      }
    } catch {
      setStatus({ type: 'error', message: 'An unexpected error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  if (!address) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
        No default bill-to address was found in the database. Please contact a developer to create one.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
          <Building2 className="h-5 w-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Default Bill-to Address</h2>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-800">
              This address is used as the <strong>Bill-to Address</strong> on all purchase orders.
              Changes take effect on new POs immediately. Existing POs retain the address that was
              selected when they were created.
            </p>
          </div>

          {/* Company Name */}
          <div>
            <label htmlFor="company_name" className="block text-sm font-medium text-slate-700">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              id="company_name"
              name="company_name"
              type="text"
              required
              value={formData.company_name}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Innovative CropCare, LLC"
            />
          </div>

          {/* Address Line 1 */}
          <div>
            <label htmlFor="address1" className="block text-sm font-medium text-slate-700">
              Address Line 1 <span className="text-red-500">*</span>
            </label>
            <input
              id="address1"
              name="address1"
              type="text"
              required
              value={formData.address1}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="3800 Camp Creek Pkwy, Building 1400"
            />
          </div>

          {/* Address Line 2 */}
          <div>
            <label htmlFor="address2" className="block text-sm font-medium text-slate-700">
              Address Line 2{' '}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="address2"
              name="address2"
              type="text"
              value={formData.address2}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Suite 200"
            />
          </div>

          {/* City / State / ZIP */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-slate-700">
                City <span className="text-red-500">*</span>
              </label>
              <input
                id="city"
                name="city"
                type="text"
                required
                value={formData.city}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="state" className="block text-sm font-medium text-slate-700">
                State <span className="text-red-500">*</span>
              </label>
              <select
                id="state"
                name="state"
                required
                value={formData.state}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:cursor-pointer"
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="zip_code" className="block text-sm font-medium text-slate-700">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                id="zip_code"
                name="zip_code"
                type="text"
                required
                value={formData.zip_code}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-slate-700">
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              value={formData.country}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Status message */}
        {status && (
          <div
            className={`mx-6 mb-4 rounded-md p-3 text-sm ${
              status.type === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {status.message}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 px-6 py-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 hover:cursor-pointer"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      </div>
    </form>
  );
}
