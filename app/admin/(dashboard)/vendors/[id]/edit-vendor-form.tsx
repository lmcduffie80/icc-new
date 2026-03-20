'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Building2, MapPin, Trash2, AlertTriangle } from 'lucide-react';

interface Vendor {
  id: number;
  vendor_number: string;
  name: string;
  address_id: number | null;
  tax_exempt: boolean;
  default_payment_terms: string | null;
  folder_path: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  address?: {
    id: number;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;
}

interface EditVendorFormProps {
  vendor: Vendor;
}

export function EditVendorForm({ vendor }: EditVendorFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [name, setName] = useState(vendor.name);
  const [taxExempt, setTaxExempt] = useState(vendor.tax_exempt);
  const [paymentTerms, setPaymentTerms] = useState(vendor.default_payment_terms || '');
  const [notes, setNotes] = useState(vendor.notes || '');
  const [address1, setAddress1] = useState(vendor.address?.address1 || '');
  const [address2, setAddress2] = useState(vendor.address?.address2 || '');
  const [city, setCity] = useState(vendor.address?.city || '');
  const [state, setState] = useState(vendor.address?.state || '');
  const [zipCode, setZipCode] = useState(vendor.address?.zip_code || '');
  const [country, setCountry] = useState(vendor.address?.country || 'United States');

  // Delete state
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const validateForm = (): string | null => {
    if (!name.trim()) {
      return 'Vendor name is required';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/admin/vendors/${vendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tax_exempt: taxExempt,
          default_payment_terms: paymentTerms || null,
          notes: notes.trim() || null,
          address1: address1.trim() || null,
          address2: address2.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip_code: zipCode.trim() || null,
          country: country.trim() || 'United States',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update vendor');
      }

      router.push('/admin/vendors');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== 'DELETE') {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/admin/vendors/${vendor.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete vendor');
      }

      // Redirect to vendors list
      router.push('/admin/vendors');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vendor');
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Vendor Details Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Vendor Information</h2>
        
        <div className="space-y-4">
          {/* Vendor Number (read-only) */}
          <div>
            <div className="block text-sm font-medium text-slate-700 mb-1">
              Vendor Number
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-slate-600">
              {vendor.vendor_number}
            </div>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Vendor Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Enter vendor name"
                required
              />
            </div>
          </div>

          {/* Tax Exempt */}
          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxExempt}
                onChange={(e) => setTaxExempt(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-slate-700">Tax Exempt</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Check if this vendor is tax exempt
            </p>
          </div>

          {/* Payment Terms */}
          <div>
            <label htmlFor="paymentTerms" className="block text-sm font-medium text-slate-700 mb-1">
              Default Payment Terms
            </label>
            <select
              id="paymentTerms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Select payment terms...</option>
              <option value="DUE_UPON_RECEIPT">Due Upon Receipt</option>
              <option value="NET_30">Net 30</option>
              <option value="NET_60">Net 60</option>
              <option value="NET_90">Net 90</option>
              <option value="NET_180">Net 180</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Additional notes about this vendor..."
            />
          </div>
        </div>
      </div>

      {/* Address Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Address</h2>
        
        <div className="space-y-4">
          {/* Address Line 1 */}
          <div>
            <label htmlFor="address1" className="block text-sm font-medium text-slate-700 mb-1">
              Address Line 1
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="address1"
                type="text"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Street address"
              />
            </div>
          </div>

          {/* Address Line 2 */}
          <div>
            <label htmlFor="address2" className="block text-sm font-medium text-slate-700 mb-1">
              Address Line 2
            </label>
            <input
              id="address2"
              type="text"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Apartment, suite, etc. (optional)"
            />
          </div>

          {/* City, State, Zip */}
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-slate-700 mb-1">
                City
              </label>
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="City"
              />
            </div>

            <div>
              <label htmlFor="state" className="block text-sm font-medium text-slate-700 mb-1">
                State
              </label>
              <input
                id="state"
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                maxLength={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 uppercase"
                placeholder="GA"
              />
            </div>

            <div>
              <label htmlFor="zipCode" className="block text-sm font-medium text-slate-700 mb-1">
                ZIP Code
              </label>
              <input
                id="zipCode"
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="31794"
              />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-slate-700 mb-1">
              Country
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="United States"
            />
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </form>

    {/* Delete Vendor Section */}
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-700" />
        <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
      </div>
      <p className="mb-4 text-sm text-red-700">
        <strong>Warning:</strong> This action cannot be undone.
      </p>

      <div className="mb-4 rounded-lg border border-red-300 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-slate-900">Deleting this vendor will:</p>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>Permanently remove the vendor from the system</li>
          <li>Remove the associated address information</li>
          <li><strong>Note:</strong> Vendors with existing purchase orders cannot be deleted</li>
        </ul>
      </div>

      {!showDeleteConfirm ? (
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <Trash2 className="h-4 w-4" />
          Delete Vendor
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="deleteConfirm" className="mb-1 block text-sm font-medium text-slate-900">
              Type <strong>DELETE</strong> to confirm deletion of <strong>{vendor.name}</strong>
            </label>
            <input
              id="deleteConfirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="Type DELETE to confirm"
              disabled={deleting}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || deleteConfirmText !== 'DELETE'}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Confirm Delete
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmText('');
              }}
              disabled={deleting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  </>
  );
}

