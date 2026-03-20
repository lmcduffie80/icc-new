'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ContractUploadFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ContractUploadForm({ onSuccess, onCancel }: ContractUploadFormProps) {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; company_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  const [formData, setFormData] = useState<{
    supplierId: string;
    contractType: 'Supply Agreement' | 'Service Agreement' | 'NDA' | 'Pricing Agreement' | 'Other';
    contractDate: string;
    expiryDate: string;
    notes: string;
    version: number;
  }>({
    supplierId: '',
    contractType: 'Supply Agreement',
    contractDate: '',
    expiryDate: '',
    notes: '',
    version: 1,
  });

  const [file, setFile] = useState<File | null>(null);

  // Fetch suppliers on mount
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(res => res.json())
      .then(data => setSuppliers(Array.isArray(data) ? data : (data.suppliers || [])))
      .catch(err => console.error('Failed to fetch suppliers:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !formData.supplierId) {
      setError('Please select a supplier and upload a file');
      return;
    }

    setLoading(true);
    setError('');
    setUploadProgress('Preparing upload...');

    try {
      // Step 1: Get presigned URL
      setUploadProgress('Getting upload URL...');
      const uploadResponse = await fetch('/api/admin/contracts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'application/pdf',
          fileName: file.name,
          size: file.size,
          supplierId: formData.supplierId,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await uploadResponse.json();

      // Step 2: Upload file to S3
      setUploadProgress('Uploading file...');
      const s3Response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });

      if (!s3Response.ok) {
        throw new Error('Failed to upload file');
      }

      // Step 3: Create contract record
      setUploadProgress('Creating contract record...');
      const createResponse = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: formData.supplierId,
          fileUrl: publicUrl,
          filename: file.name,
          fileSize: file.size,
          contractType: formData.contractType,
          contractDate: formData.contractDate,
          expiryDate: formData.expiryDate || null,
          notes: formData.notes || null,
          version: formData.version,
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create contract');
      }

      setUploadProgress('Contract uploaded successfully!');
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload contract');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-2xl font-bold">Upload Contract</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {uploadProgress && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          {uploadProgress}
        </div>
      )}

      <div>
        <label htmlFor="supplier-select" className="block text-sm font-medium mb-1">Supplier *</label>
        <select
          id="supplier-select"
          required
          className="w-full border rounded px-3 py-2"
          value={formData.supplierId}
          onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
        >
          <option value="">Select a supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.company_name} ({s.name})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="contract-type-select" className="block text-sm font-medium mb-1">Contract Type *</label>
        <select
          id="contract-type-select"
          required
          className="w-full border rounded px-3 py-2"
          value={formData.contractType}
          onChange={(e) => setFormData({ ...formData, contractType: e.target.value as typeof formData.contractType })}
        >
          <option value="Supply Agreement">Supply Agreement</option>
          <option value="Service Agreement">Service Agreement</option>
          <option value="NDA">NDA</option>
          <option value="Pricing Agreement">Pricing Agreement</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div>
        <label htmlFor="contract-date" className="block text-sm font-medium mb-1">Contract Date *</label>
        <input
          id="contract-date"
          type="date"
          required
          className="w-full border rounded px-3 py-2"
          value={formData.contractDate}
          onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="expiry-date" className="block text-sm font-medium mb-1">Expiry Date</label>
        <input
          id="expiry-date"
          type="date"
          className="w-full border rounded px-3 py-2"
          value={formData.expiryDate}
          onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="contract-notes" className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          id="contract-notes"
          className="w-full border rounded px-3 py-2"
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Contract PDF *</label>
        <input
          id="contract-file"
          type="file"
          required
          accept="application/pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <label
          htmlFor="contract-file"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded cursor-pointer hover:bg-gray-50 text-sm font-medium text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload PDF
        </label>
        {file ? (
          <p className="text-sm text-gray-600 mt-2">
            <span className="font-medium">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        ) : (
          <p className="text-sm text-gray-400 mt-2">No file chosen</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Uploading...' : 'Upload Contract'}
        </Button>
        {onCancel && (
          <Button type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
