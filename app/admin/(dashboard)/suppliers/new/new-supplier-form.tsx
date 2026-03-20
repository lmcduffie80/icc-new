'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2, Eye, EyeOff, Mail, User, Building2, Phone, Lock, MapPin } from 'lucide-react';

export function NewSupplierForm() {
  const router = useRouter();
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

      router.push('/admin/suppliers');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Account Details Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Account Information</h2>
        
        <div className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email Address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="supplier@company.com"
                required
                disabled={saving}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This email will be used for supplier portal login
            </p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="John Doe"
                required
                disabled={saving}
              />
            </div>
          </div>

          {/* Company Name */}
          <div>
            <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-slate-700">
              Company Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Acme Corporation"
                required
                disabled={saving}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This company name determines which products this user can access
            </p>
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
              Phone Number <span className="text-slate-400">(Optional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="(555) 123-4567"
                disabled={saving}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-12 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                disabled={saving}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                disabled={saving}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Minimum 8 characters. Supplier will use this to log in to the portal.
            </p>
          </div>

          {/* Tax Exempt */}
          <div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={taxExempt}
                onChange={(e) => setTaxExempt(e.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-slate-700">Tax Exempt</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Check this if the supplier is tax exempt. Tax exempt suppliers will not be charged tax on purchase orders.
            </p>
          </div>
        </div>
      </div>

      {/* Address Information Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Address Information
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Supplier address that will appear on Purchase Orders (optional)
        </p>
        <div className="space-y-4">
          {/* Street Address */}
          <div>
            <label htmlFor="addressStreet" className="mb-1 block text-sm font-medium text-slate-700">
              Street Address <span className="text-slate-400">(Optional)</span>
            </label>
            <input
              id="addressStreet"
              type="text"
              value={addressStreet}
              onChange={(e) => setAddressStreet(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="123 Main St"
              disabled={saving}
            />
          </div>

          {/* City, State, ZIP */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="addressCity" className="mb-1 block text-sm font-medium text-slate-700">
                City <span className="text-slate-400">(Optional)</span>
              </label>
              <input
                id="addressCity"
                type="text"
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="City"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="addressState" className="mb-1 block text-sm font-medium text-slate-700">
                State <span className="text-slate-400">(Optional)</span>
              </label>
              <input
                id="addressState"
                type="text"
                value={addressState}
                onChange={(e) => setAddressState(e.target.value.toUpperCase())}
                maxLength={2}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                placeholder="GA"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="addressZip" className="mb-1 block text-sm font-medium text-slate-700">
                ZIP Code <span className="text-slate-400">(Optional)</span>
              </label>
              <input
                id="addressZip"
                type="text"
                value={addressZip}
                onChange={(e) => setAddressZip(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="31794"
                disabled={saving}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-6">
        <Link
          href="/admin/suppliers"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Create Supplier User
            </>
          )}
        </button>
      </div>
    </form>
  );
}

