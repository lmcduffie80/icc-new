'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2, Mail, User, Building2, Phone, CheckCircle, XCircle, MapPin, Lock, Eye, EyeOff, Trash2, AlertTriangle } from 'lucide-react';

interface SupplierUser {
  id: string;
  email: string;
  name: string;
  company_name: string;
  phone: string | null;
  supplier_number: string | null;
  is_active: boolean;
  tax_exempt: boolean;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  created_at: string;
  updated_at: string;
}

interface EditSupplierFormProps {
  supplier: SupplierUser;
}

export function EditSupplierForm({ supplier }: EditSupplierFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState(supplier.email);
  const [name, setName] = useState(supplier.name);
  const [companyName, setCompanyName] = useState(supplier.company_name);
  const [phone, setPhone] = useState(supplier.phone || '');
  const [isActive, setIsActive] = useState(supplier.is_active);
  const [taxExempt, setTaxExempt] = useState(supplier.tax_exempt ?? false);
  const [addressStreet, setAddressStreet] = useState(supplier.address_street || '');
  const [addressCity, setAddressCity] = useState(supplier.address_city || '');
  const [addressState, setAddressState] = useState(supplier.address_state || '');
  const [addressZip, setAddressZip] = useState(supplier.address_zip || '');

  // Password update state
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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
    if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone)) {
      return 'Please enter a valid phone number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/admin/suppliers/${supplier.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          company_name: companyName.trim(),
          phone: phone.trim() || null,
          is_active: isActive,
          tax_exempt: taxExempt,
          address_street: addressStreet.trim() || null,
          address_city: addressCity.trim() || null,
          address_state: addressState.trim().toUpperCase() || null,
          address_zip: addressZip.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update supplier');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/suppliers');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update supplier');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setUpdatingPassword(true);

    try {
      const response = await fetch(`/api/admin/suppliers/${supplier.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update password');
      }

      setPasswordSuccess(true);
      setPassword('');
      setShowPassword(false);
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setPasswordSuccess(false);
      }, 5000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== 'DELETE') {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/admin/suppliers/${supplier.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete supplier');
      }

      // Redirect to suppliers list
      router.push('/admin/suppliers');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier');
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success Message */}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">Supplier updated successfully! Redirecting...</p>
          </div>
        )}

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
            {/* Supplier Number (Read-only) */}
            {supplier.supplier_number && (
              <div>
                <div className="mb-1 block text-sm font-medium text-slate-700">
                  Supplier Number
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                  {supplier.supplier_number}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Supplier number is auto-generated and cannot be changed
                </p>
              </div>
            )}

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
                This email is used for supplier portal login
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

            {/* Active Status */}
            <div>
              <div className="mb-1 block text-sm font-medium text-slate-700">
                Account Status
              </div>
              <div className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="isActive"
                    checked={isActive === true}
                    onChange={() => setIsActive(true)}
                    disabled={saving}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-slate-700">Active</span>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="isActive"
                    checked={isActive === false}
                    onChange={() => setIsActive(false)}
                    disabled={saving}
                    className="h-4 w-4 text-red-600 focus:ring-red-500"
                  />
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-slate-700">Inactive</span>
                  </div>
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Inactive suppliers cannot log in to the supplier portal
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
            disabled={saving || success}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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

      {/* Password Update Section */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-900">Password Management</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Update the supplier&apos;s password. This will log them out of all devices.
        </p>

        {/* Password Success Message */}
        {passwordSuccess && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">
              Password updated successfully! The supplier has been logged out of all devices.
            </p>
          </div>
        )}

        {/* Password Error Message */}
        {passwordError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{passwordError}</p>
          </div>
        )}

        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-12 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Enter new password"
                disabled={updatingPassword}
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                disabled={updatingPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Minimum 8 characters
            </p>
          </div>

          <button
            type="submit"
            disabled={updatingPassword || !password || password.length < 8}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updatingPassword ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating Password...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Update Password
              </>
            )}
          </button>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Updating the password will immediately log the supplier out of all devices. 
              They will need to log in with the new password.
            </p>
          </div>
        </form>
      </div>

      {/* Delete Supplier Section */}
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-700" />
          <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
        </div>
        <p className="mb-4 text-sm text-red-700">
          <strong>Warning:</strong> This action cannot be undone.
        </p>

        <div className="mb-4 rounded-lg border border-red-300 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-900">Deleting this supplier will:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            <li>Remove their access to the supplier portal</li>
            <li>Delete all their sessions and warehouse links</li>
            <li>Keep their products but unlink them from this supplier</li>
            <li>This action is permanent and cannot be reversed</li>
          </ul>
        </div>

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Delete Supplier Account
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="deleteConfirm" className="mb-1 block text-sm font-medium text-slate-900">
                Type <strong>DELETE</strong> to confirm deletion of <strong>{supplier.name}</strong>
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
