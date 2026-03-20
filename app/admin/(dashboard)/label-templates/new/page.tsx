'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Save, Upload, Loader2, X } from 'lucide-react';

export default function NewLabelTemplatePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [formData, setFormData] = useState({
    product_name: '',
    template_name: '',
    label_image_url: '',
    short_description: '',
    long_description: '',
  });

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to S3
    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('product_name', formData.product_name || 'temp');

      const response = await fetch('/api/admin/label-templates/upload', {
        method: 'POST',
        body: uploadFormData,
      });

      if (response.ok) {
        const data = await response.json();
        setFormData((prev) => ({ ...prev, label_image_url: data.url }));
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to upload image');
        setImagePreview('');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
      setImagePreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.label_image_url) {
      alert('Please upload a label image');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/label-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/admin/label-templates');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create template');
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/label-templates"
          className="flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">New Label Template</h1>
          <p className="mt-1 text-slate-600">Create a reusable label template for products</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
        {/* Product Name */}
        <div>
          <label htmlFor="product_name" className="block text-sm font-medium text-slate-700">
            Product Name *
          </label>
          <input
            type="text"
            id="product_name"
            required
            value={formData.product_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, product_name: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
            placeholder="e.g., Premium Nitrogen Fertilizer"
          />
          <p className="mt-1 text-sm text-slate-500">
            The product name this template applies to
          </p>
        </div>

        {/* Template Name */}
        <div>
          <label htmlFor="template_name" className="block text-sm font-medium text-slate-700">
            Template Name *
          </label>
          <input
            type="text"
            id="template_name"
            required
            value={formData.template_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, template_name: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
            placeholder="e.g., Standard Label - 50lb Bag"
          />
          <p className="mt-1 text-sm text-slate-500">
            A descriptive name for this template
          </p>
        </div>

        {/* Label Image Upload */}
        <div>
          <div className="block text-sm font-medium text-slate-700 mb-2">
            Label Image *
          </div>

          {imagePreview ? (
            <div className="relative">
              <div className="relative h-64 bg-slate-100 rounded-lg border-2 border-slate-300 overflow-hidden">
                <Image
                  src={imagePreview}
                  alt="Label preview"
                  fill
                  className="object-contain p-4"
                  unoptimized
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setImagePreview('');
                  setFormData((prev) => ({ ...prev, label_image_url: '' }));
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-green-500 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                id="label-image"
              />
              <label
                htmlFor="label-image"
                className="cursor-pointer flex flex-col items-center"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-12 w-12 text-green-500 animate-spin" />
                    <p className="mt-2 text-sm text-slate-600">Uploading...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      Click to upload label image
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PNG, JPG, GIF up to 5MB
                    </p>
                  </>
                )}
              </label>
            </div>
          )}
        </div>

        {/* Short Description */}
        <div>
          <label htmlFor="short_description" className="block text-sm font-medium text-slate-700">
            Short Description *
          </label>
          <textarea
            id="short_description"
            required
            rows={3}
            value={formData.short_description}
            onChange={(e) => setFormData((prev) => ({ ...prev, short_description: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
            placeholder="Brief product description (10-500 characters)"
            minLength={10}
            maxLength={500}
          />
          <p className="mt-1 text-sm text-slate-500">
            {formData.short_description.length}/500 characters
          </p>
        </div>

        {/* Long Description */}
        <div>
          <label htmlFor="long_description" className="block text-sm font-medium text-slate-700">
            Long Description (Optional)
          </label>
          <textarea
            id="long_description"
            rows={6}
            value={formData.long_description}
            onChange={(e) => setFormData((prev) => ({ ...prev, long_description: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
            placeholder="Detailed product description (up to 5000 characters)"
            maxLength={5000}
          />
          <p className="mt-1 text-sm text-slate-500">
            {formData.long_description.length}/5000 characters
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Template Usage</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Templates must be approved before suppliers can use them</li>
            <li>Suppliers will be able to select this template when creating products</li>
            <li>Descriptions will auto-populate when a template is selected</li>
            <li>Templates can be reused across multiple products</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-200">
          <Link
            href="/admin/label-templates"
            className="px-6 py-2 text-slate-700 hover:text-slate-900"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={loading || uploading || !formData.label_image_url}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Create Template
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
