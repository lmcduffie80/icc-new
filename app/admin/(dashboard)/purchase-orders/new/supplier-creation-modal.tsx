'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, User, Building2, Phone, Lock, Eye, EyeOff, MapPin, Save, Loader2 } from 'lucide-react';

interface SupplierCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (supplierId: string) => void;
}

export function SupplierCreationModal({ isOpen, onClose, onSuccess }: SupplierCreationModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [taxExempt, setTaxExempt] = useState(false);
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');

  const validateForm = (): string | null => {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Please enter a valid email address';
    }
    if (!name.trim()) {
      return 'Name is required';
    }
    if (!companyName.trim()) {
      return 'Company name is required';
    }
    if (!password) {
      return 'Password is required';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone)) {
      return 'Please enter a valid phone number';
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
      const response = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          company_name: companyName.trim(),
          password,
          phone: phone.trim() || undefined,
          tax_exempt: taxExempt,
          address_street: addressStreet.trim() || undefined,
          address_city: addressCity.trim() || undefined,
          address_state: addressState.trim().toUpperCase() || undefined,
          address_zip: addressZip.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create supplier user');
      }

      const data = await response.json();
      onSuccess(data.id);
      
      // Reset form
      setEmail('');
      setName('');
      setCompanyName('');
      setPhone('');
      setPassword('');
      setTaxExempt(false);
      setAddressStreet('');
      setAddressCity('');
      setAddressState('');
      setAddressZip('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier user');
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
            <h2 className="text-xl font-semibold text-slate-900">Create New Supplier</h2>
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

            {/* Account Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Account Information</h3>
              
              {/* Email */}
              <div>
                <label htmlFor="supplier-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="supplier-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="supplier@company.com"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  This email will be used for supplier portal login
                </p>
              </div>

              {/* Name */}
              <div>
                <label htmlFor="supplier-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="supplier-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>

              {/* Company Name */}
              <div>
                <label htmlFor="supplier-company" className="block text-sm font-medium text-slate-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="supplier-company"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Acme Corporation"
                    required
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="supplier-phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="supplier-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="supplier-password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="supplier-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-12 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
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

              {/* Address Section */}
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-3">Address (Optional)</h3>
                
                <div className="space-y-3">
                  {/* Street Address */}
                  <div>
                    <label htmlFor="supplier-address-street" className="block text-xs font-medium text-slate-600 mb-1">
                      Street Address
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="supplier-address-street"
                        type="text"
                        value={addressStreet}
                        onChange={(e) => setAddressStreet(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="123 Main St"
                      />
                    </div>
                  </div>

                  {/* City, State, Zip */}
                  <div className="grid gap-3 grid-cols-3">
                    <div>
                      <label htmlFor="supplier-address-city" className="block text-xs font-medium text-slate-600 mb-1">
                        City
                      </label>
                      <input
                        id="supplier-address-city"
                        type="text"
                        value={addressCity}
                        onChange={(e) => setAddressCity(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label htmlFor="supplier-address-state" className="block text-xs font-medium text-slate-600 mb-1">
                        State
                      </label>
                      <input
                        id="supplier-address-state"
                        type="text"
                        value={addressState}
                        onChange={(e) => setAddressState(e.target.value.toUpperCase())}
                        maxLength={2}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 uppercase"
                        placeholder="GA"
                      />
                    </div>

                    <div>
                      <label htmlFor="supplier-address-zip" className="block text-xs font-medium text-slate-600 mb-1">
                        ZIP
                      </label>
                      <input
                        id="supplier-address-zip"
                        type="text"
                        value={addressZip}
                        onChange={(e) => setAddressZip(e.target.value)}
                        disabled={saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="31794"
                      />
                    </div>
                  </div>
                </div>
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
                    Create Supplier
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
