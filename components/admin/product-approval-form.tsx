'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, CheckCircle, XCircle, Upload, Loader2, ExternalLink } from 'lucide-react';

interface ProductAttributes {
  activeIngredients?: string;
  epaSignalWord?: string;
  epaRegistrationNumber?: string;
  applicationRateRange?: string;
  containerSizes?: string;
  availabilityDate?: string;
  weight?: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  full_description: string | null;
  sku: string | null;
  price: string;
  supplier_price: string | null;
  unit_of_measure: string | null;
  image: string | null;
  label_url: string | null;
  sds_url: string | null;
  admin_label_url: string | null;
  approval_status: string;
  supplier_id: string | null;
  supplier_company: string | null;
  supplier_email: string | null;
  icc_available_quantity: number;
  attributes: ProductAttributes | null;
  approved_states: string[] | null;
  features: string[] | null;
  specifications: Record<string, string> | null;
  documents: Array<{name: string; url: string}> | null;
  restricted_use: boolean;
}

interface ProductApprovalFormProps {
  product: Product;
}

export function ProductApprovalForm({ product }: ProductApprovalFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'basic' | 'technical' | 'states' | 'inventory' | 'sds' | 'label'>('basic');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [adminLabelUrl, setAdminLabelUrl] = useState(product.admin_label_url || '');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showMinimumOrderQtyPrompt, setShowMinimumOrderQtyPrompt] = useState(false);
  const [minimumOrderQty, setMinimumOrderQty] = useState('');
  const [updatingQty, setUpdatingQty] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const attributes = product.attributes || {};
  const approvedStates = product.approved_states || [];

  const handleLabelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Allowed: PDF, JPEG, PNG');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/products/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type,
          fileName: file.name,
          size: file.size,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await response.json();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      setAdminLabelUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!action) {
      setError('Please select an action');
      return;
    }

    if (action === 'approve' && adminLabelUrl && !confirm('This will modify the label and require supplier approval. Continue?')) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/products/${product.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          admin_label_url: adminLabelUrl || undefined,
          approval_notes: approvalNotes || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process approval');
      }

      // If product needs minimum order quantity, show prompt
      if (data.needsMinimumOrderQty && action === 'approve') {
        setShowMinimumOrderQtyPrompt(true);
      } else {
        router.push('/admin/products');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process approval');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMinimumOrderQty = async () => {
    if (!minimumOrderQty || isNaN(parseInt(minimumOrderQty)) || parseInt(minimumOrderQty) < 0) {
      setError('Please enter a valid minimum order quantity');
      return;
    }

    setUpdatingQty(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minimum_order_qty: parseInt(minimumOrderQty),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update minimum order quantity');
      }

      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update minimum order quantity');
    } finally {
      setUpdatingQty(false);
    }
  };

  const handleSkipMinimumOrderQty = () => {
    router.push('/admin/products');
    router.refresh();
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.includes('s3.amazonaws.com') || url.includes('.s3.')) {
      return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const getDocumentUrl = (url: string | null) => {
    if (!url) return null;
    // Use proxy for S3 URLs to avoid access denied errors
    if (url.includes('s3.amazonaws.com') || url.includes('.s3.')) {
      return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/products"
        className="flex items-center space-x-2 text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Products</span>
      </Link>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Supplier Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Supplier Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="block text-sm font-medium text-slate-700">Supplier Company</div>
            <p className="mt-1 text-slate-900">{product.supplier_company || 'Unknown'}</p>
          </div>
          {product.supplier_email && (
            <div>
              <div className="block text-sm font-medium text-slate-700">Email</div>
              <p className="mt-1 text-slate-900">{product.supplier_email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {(['basic', 'technical', 'states', 'inventory', 'sds', 'label'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                  activeTab === tab
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="block text-sm font-medium text-slate-700">Product Name</div>
                  <p className="mt-1 text-slate-900">{product.name}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">Category</div>
                  <p className="mt-1 text-slate-900">{product.category}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">SKU</div>
                  <p className="mt-1 text-slate-900">{product.sku || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">Unit of Measure</div>
                  <p className="mt-1 text-slate-900">{product.unit_of_measure || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">
                    {product.unit_of_measure?.toLowerCase() === 'tote' ? 'Total Store Price' : 'Price (Store Price)'}
                  </div>
                  <p className="mt-1 text-slate-900">${parseFloat(product.price).toFixed(2)}</p>
                  {product.unit_of_measure?.toLowerCase() === 'tote' && parseFloat(product.price) > 0 && (
                    <p className="mt-1 text-xs text-emerald-600 font-medium">
                      ${(parseFloat(product.price) / 265).toFixed(4)}/gal (265 gallons)
                    </p>
                  )}
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">
                    {product.unit_of_measure?.toLowerCase() === 'tote' ? 'Total Supplier Price' : 'Supplier Price'}
                  </div>
                  <p className="mt-1 text-slate-900">
                    {product.supplier_price ? `$${parseFloat(product.supplier_price).toFixed(2)}` : 'N/A'}
                  </p>
                  {product.unit_of_measure?.toLowerCase() === 'tote' && product.supplier_price && parseFloat(product.supplier_price) > 0 && (
                    <p className="mt-1 text-xs text-slate-600 font-medium">
                      ${(parseFloat(product.supplier_price) / 265).toFixed(4)}/gal (265 gallons)
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <div className="block text-sm font-medium text-slate-700">Description</div>
                  <p className="mt-1 text-slate-900 whitespace-pre-wrap">{product.description || 'No description'}</p>
                </div>
                {product.full_description && (
                  <div className="sm:col-span-2">
                    <div className="block text-sm font-medium text-slate-700">Full Description</div>
                    <p className="mt-1 text-slate-900 whitespace-pre-wrap">{product.full_description}</p>
                  </div>
                )}
                <div>
                  <div className="block text-sm font-medium text-slate-700">Restricted Use</div>
                  <p className="mt-1 text-slate-900">{product.restricted_use ? 'Yes' : 'No'}</p>
                </div>
              </div>
              {product.image && (
                <div>
                  <div className="block text-sm font-medium text-slate-700">Product Image</div>
                  <div className="mt-2">
                    {getImageUrl(product.image) ? (
                      <Image
                        src={getImageUrl(product.image)!}
                        alt={product.name}
                        width={200}
                        height={200}
                        className="rounded-lg object-cover"
                        unoptimized={product.image.includes('s3.amazonaws.com') || product.image.includes('.s3.')}
                      />
                    ) : (
                      <Image
                        src={product.image}
                        alt={product.name}
                        width={200}
                        height={200}
                        className="rounded-lg object-cover"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Technical Tab */}
          {activeTab === 'technical' && (
            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="block text-sm font-medium text-slate-700">Active Ingredients</div>
                  <p className="mt-1 text-slate-900">{attributes.activeIngredients || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">EPA Signal Word</div>
                  <p className="mt-1 text-slate-900">{attributes.epaSignalWord || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">EPA Registration Number</div>
                  <p className="mt-1 text-slate-900">{attributes.epaRegistrationNumber || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">Application Rate Range</div>
                  <p className="mt-1 text-slate-900">{attributes.applicationRateRange || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">Container Sizes</div>
                  <p className="mt-1 text-slate-900">{attributes.containerSizes || 'N/A'}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">Availability Date</div>
                  <p className="mt-1 text-slate-900">{formatDate(attributes.availabilityDate)}</p>
                </div>
                <div>
                  <div className="block text-sm font-medium text-slate-700">Net Content Weight (lbs)</div>
                  <p className="mt-1 text-slate-900">{attributes.weight || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {/* States Tab */}
          {activeTab === 'states' && (
            <div className="space-y-6">
              <div>
                <div className="block text-sm font-medium text-slate-700 mb-4">Approved States</div>
                {approvedStates.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {approvedStates.map((state) => (
                      <div
                        key={state}
                        className="flex items-center space-x-2 rounded-md border border-green-200 bg-green-50 p-3"
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-slate-900">{state}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">No states selected</p>
                )}
              </div>
            </div>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div>
                <div className="block text-sm font-medium text-slate-700">ICC Available Quantity</div>
                <p className="mt-1 text-lg font-semibold text-slate-900">{product.icc_available_quantity}</p>
                <p className="mt-1 text-xs text-slate-500">
                  The quantity available for ICC to sell to customers
                </p>
              </div>
            </div>
          )}

          {/* SDS Tab */}
          {activeTab === 'sds' && (
            <div className="space-y-6">
              {(() => {
                // Check dedicated sds_url field first
                if (product.sds_url) {
                  return (
                    <div>
                      <div className="block text-sm font-medium text-slate-700 mb-4">Safety Data Sheet (SDS)</div>
                      <a
                        href={getDocumentUrl(product.sds_url) || product.sds_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>View SDS Document</span>
                      </a>
                    </div>
                  );
                }
                
                // Fallback: check documents array for SDS
                const sdsDoc = product.documents?.find(doc => 
                  doc.name?.toLowerCase().includes('sds') || 
                  doc.name?.toLowerCase().includes('safety data sheet')
                );
                
                if (sdsDoc) {
                  return (
                    <div>
                      <div className="block text-sm font-medium text-slate-700 mb-4">Safety Data Sheet (SDS)</div>
                      <a
                        href={getDocumentUrl(sdsDoc.url) || sdsDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>View SDS Document</span>
                      </a>
                    </div>
                  );
                }
                
                // No SDS found in either location
                return (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-500">No SDS document uploaded</p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Label Tab */}
          {activeTab === 'label' && (
            <div className="space-y-6">
              {product.label_url && (
                <div>
                  <div className="block text-sm font-medium text-slate-700 mb-4">Original Label (Supplier Uploaded)</div>
                  <a
                    href={getDocumentUrl(product.label_url) || product.label_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 mb-4"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>View Original Label</span>
                  </a>
                </div>
              )}
              
              {product.admin_label_url && (
                <div>
                  <div className="block text-sm font-medium text-slate-700 mb-4">Modified Label (Admin Uploaded)</div>
                  <a
                    href={getDocumentUrl(product.admin_label_url) || product.admin_label_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 mb-4"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>View Modified Label</span>
                  </a>
                </div>
              )}

              {!product.label_url && !product.admin_label_url && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="text-slate-500">No label document uploaded</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approval Actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Approval Decision</h2>

        <div className="space-y-4">
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setAction('approve')}
              className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                action === 'approve'
                  ? 'border-green-500 bg-green-50'
                  : 'border-slate-200 hover:border-green-300'
              }`}
            >
              <CheckCircle
                className={`mb-2 h-6 w-6 ${
                  action === 'approve' ? 'text-green-600' : 'text-slate-400'
                }`}
              />
              <p className="font-semibold text-slate-900">Approve</p>
              <p className="mt-1 text-sm text-slate-600">
                Approve and publish this product
              </p>
            </button>

            <button
              type="button"
              onClick={() => setAction('reject')}
              className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                action === 'reject'
                  ? 'border-red-500 bg-red-50'
                  : 'border-slate-200 hover:border-red-300'
              }`}
            >
              <XCircle
                className={`mb-2 h-6 w-6 ${
                  action === 'reject' ? 'text-red-600' : 'text-slate-400'
                }`}
              />
              <p className="font-semibold text-slate-900">Reject</p>
              <p className="mt-1 text-sm text-slate-600">
                Reject this product submission
              </p>
            </button>
          </div>

          {action === 'approve' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="block text-sm font-medium text-slate-700 mb-2">
                Upload Modified Label (Optional)
              </div>
              <p className="mb-3 text-sm text-slate-600">
                If you modify the label, the supplier will need to approve it before the product is published.
              </p>
              {adminLabelUrl ? (
                <div className="flex items-center space-x-4">
                  <a
                    href={adminLabelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-sm text-green-600 hover:text-green-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>View Modified Label</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setAdminLabelUrl('')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={labelInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleLabelUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => labelInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center space-x-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span>Upload Modified Label</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="product-approval-notes" className="block text-sm font-medium text-slate-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              id="product-approval-notes"
              rows={4}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              placeholder="Add any notes about your decision..."
            />
          </div>

          <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-6">
            <Link
              href="/admin/products"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={!action || submitting}
              className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  {action === 'approve' ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Approve Product</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>Reject Product</span>
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Minimum Order Quantity Prompt Modal */}
      {showMinimumOrderQtyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Update Minimum Order Quantity
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              This product doesn&apos;t have a minimum order quantity set. Please set a minimum order quantity before continuing.
            </p>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="product-minimum-order-qty" className="block text-sm font-medium text-slate-700 mb-2">
                Minimum Order Quantity
              </label>
              <input
                id="product-minimum-order-qty"
                type="number"
                min="0"
                value={minimumOrderQty}
                onChange={(e) => setMinimumOrderQty(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                placeholder="Enter minimum order quantity"
              />
              <p className="mt-1 text-xs text-slate-500">
                The minimum quantity customers must order for this product
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={handleSkipMinimumOrderQty}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Skip for Now
              </button>
              <button
                type="button"
                onClick={handleUpdateMinimumOrderQty}
                disabled={updatingQty || !minimumOrderQty}
                className="flex items-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {updatingQty ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Update & Continue</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
