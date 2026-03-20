'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, MapPin, Save, Loader2 } from 'lucide-react';

interface VendorCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vendorId: number) => void;
}

export function VendorCreationModal({ isOpen, onClose, onSuccess }: VendorCreationModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [name, setName] = useState('');
  const [taxExempt, setTaxExempt] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('United States');

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
      const response = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tax_exempt: taxExempt,
          default_payment_terms: paymentTerms || null,
          notes: notes.trim() || null,
          is_active: true,
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
        throw new Error(data.error || 'Failed to create vendor');
      }

      const data = await response.json();
      onSuccess(data.id);
      
      // Reset form
      setName('');
      setTaxExempt(false);
      setPaymentTerms('');
      setNotes('');
      setAddress1('');
      setAddress2('');
      setCity('');
      setState('');
      setZipCode('');
      setCountry('United States');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-white border-b border-slate-200 p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create New Vendor</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="p-6">
            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Vendor Details */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="vendor-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Vendor Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="vendor-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Enter vendor name"
                    required
                    disabled={saving}
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
                    disabled={saving}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Tax Exempt</span>
                </label>
              </div>

              {/* Payment Terms */}
              <div>
                <label htmlFor="vendor-payment-terms" className="block text-sm font-medium text-slate-700 mb-1">
                  Default Payment Terms
                </label>
                <select
                  id="vendor-payment-terms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  disabled={saving}
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

              {/* Address Section */}
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-3">Address (Optional)</h3>
                
                <div className="space-y-3">
                  {/* Address Line 1 */}
                  <div>
                    <label htmlFor="vendor-address1" className="block text-xs font-medium text-slate-600 mb-1">
                      Address Line 1
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="vendor-address1"
                        type="text"
                        value={address1}
                        onChange={(e) => setAddress1(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Street address"
                      />
                    </div>
                  </div>

                  {/* Address Line 2 */}
                  <div>
                    <label htmlFor="vendor-address2" className="block text-xs font-medium text-slate-600 mb-1">
                      Address Line 2
                    </label>
                    <input
                      id="vendor-address2"
                      type="text"
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                      disabled={saving}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Suite, unit, etc."
                    />
                  </div>

                  {/* City, State, Zip */}
                  <div className="grid gap-3 grid-cols-3">
                    <div>
                      <label htmlFor="vendor-city" className="block text-xs font-medium text-slate-600 mb-1">
                        City
                      </label>
                      <input
                        id="vendor-city"
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label htmlFor="vendor-state" className="block text-xs font-medium text-slate-600 mb-1">
                        State
                      </label>
                      <input
                        id="vendor-state"
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        maxLength={2}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 uppercase"
                        placeholder="GA"
                      />
                    </div>

                    <div>
                      <label htmlFor="vendor-zip" className="block text-xs font-medium text-slate-600 mb-1">
                        ZIP
                      </label>
                      <input
                        id="vendor-zip"
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="31794"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="vendor-notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="vendor-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={saving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Additional notes about this vendor..."
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Create Vendor
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
