'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

interface ContentData {
  text?: string;
  link?: string;
  image?: string;
  body?: string;
  backgroundColor?: string;
  textColor?: string;
}

interface Content {
  id: string;
  type: string;
  title: string | null;
  slug: string | null;
  content: ContentData;
  is_active: boolean;
  display_order: number;
  starts_at: string | null;
  ends_at: string | null;
}

interface ContentFormProps {
  content?: Content;
}

const contentTypes = [
  { value: 'banner', label: 'Banner', description: 'Hero banners and promotional images' },
  { value: 'announcement', label: 'Announcement', description: 'Site-wide announcements and notices' },
  { value: 'page', label: 'Page', description: 'Custom pages with rich content' },
];

export function ContentForm({ content }: ContentFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    type: content?.type || 'banner',
    title: content?.title || '',
    slug: content?.slug || '',
    is_active: content?.is_active ?? false,
    display_order: content?.display_order ?? 0,
    starts_at: content?.starts_at?.slice(0, 16) || '',
    ends_at: content?.ends_at?.slice(0, 16) || '',
    // Content fields
    text: (content?.content as ContentData)?.text || '',
    link: (content?.content as ContentData)?.link || '',
    image: (content?.content as ContentData)?.image || '',
    body: (content?.content as ContentData)?.body || '',
    backgroundColor: (content?.content as ContentData)?.backgroundColor || '#10b981',
    textColor: (content?.content as ContentData)?.textColor || '#ffffff',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const contentPayload: ContentData = {};
      
      if (formData.type === 'banner') {
        contentPayload.text = formData.text;
        contentPayload.link = formData.link;
        contentPayload.image = formData.image;
        contentPayload.backgroundColor = formData.backgroundColor;
        contentPayload.textColor = formData.textColor;
      } else if (formData.type === 'announcement') {
        contentPayload.text = formData.text;
        contentPayload.link = formData.link;
        contentPayload.backgroundColor = formData.backgroundColor;
        contentPayload.textColor = formData.textColor;
      } else if (formData.type === 'page') {
        contentPayload.body = formData.body;
      }

      const url = content
        ? `/api/admin/content/${content.id}`
        : '/api/admin/content';
      const method = content ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          title: formData.title || null,
          slug: formData.slug || null,
          content: contentPayload,
          is_active: formData.is_active,
          display_order: formData.display_order,
          starts_at: formData.starts_at || null,
          ends_at: formData.ends_at || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save content');
      }

      router.push('/admin/content');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Content Type */}
        {!content && (
          <div className="mb-6">
            <p className="block text-sm font-medium text-slate-700 mb-2">
              Content Type *
            </p>
            <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Content type selection">
              {contentTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    formData.type === type.value
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="font-medium text-slate-900">{type.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{type.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Title */}
          <div>
            <label htmlFor="content-title" className="block text-sm font-medium text-slate-700">Title</label>
            <input
              id="content-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Content title"
            />
          </div>

          {/* Slug (for pages) */}
          {formData.type === 'page' && (
            <div>
              <label htmlFor="content-slug" className="block text-sm font-medium text-slate-700">Slug</label>
              <input
                id="content-slug"
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="url-friendly-slug"
              />
            </div>
          )}

          {/* Display Order */}
          <div>
            <label htmlFor="content-display-order" className="block text-sm font-medium text-slate-700">
              Display Order
            </label>
            <input
              id="content-display-order"
              type="number"
              value={formData.display_order}
              onChange={(e) =>
                setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
              Published
            </label>
          </div>
        </div>

        {/* Date Range */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="content-start-date" className="block text-sm font-medium text-slate-700">
              Start Date (optional)
            </label>
            <input
              id="content-start-date"
              type="datetime-local"
              value={formData.starts_at}
              onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="content-end-date" className="block text-sm font-medium text-slate-700">
              End Date (optional)
            </label>
            <input
              id="content-end-date"
              type="datetime-local"
              value={formData.ends_at}
              onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Type-specific content fields */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-slate-900">Content Details</h3>

        {(formData.type === 'banner' || formData.type === 'announcement') && (
          <div className="space-y-4">
            <div>
              <label htmlFor="content-text" className="block text-sm font-medium text-slate-700">Text</label>
              <input
                id="content-text"
                type="text"
                value={formData.text}
                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Banner or announcement text"
              />
            </div>
            <div>
              <label htmlFor="content-link" className="block text-sm font-medium text-slate-700">Link URL</label>
              <input
                id="content-link"
                type="url"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="https://..."
              />
            </div>
            {formData.type === 'banner' && (
              <div>
                <label htmlFor="content-image" className="block text-sm font-medium text-slate-700">
                  Image URL
                </label>
                <input
                  id="content-image"
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="https://..."
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="content-bg-color" className="block text-sm font-medium text-slate-700">
                  Background Color
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.backgroundColor}
                    onChange={(e) =>
                      setFormData({ ...formData, backgroundColor: e.target.value })
                    }
                    className="h-10 w-10 cursor-pointer rounded border border-slate-200"
                    aria-label="Background color picker"
                  />
                  <input
                    id="content-bg-color"
                    type="text"
                    value={formData.backgroundColor}
                    onChange={(e) =>
                      setFormData({ ...formData, backgroundColor: e.target.value })
                    }
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="content-text-color" className="block text-sm font-medium text-slate-700">
                  Text Color
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.textColor}
                    onChange={(e) =>
                      setFormData({ ...formData, textColor: e.target.value })
                    }
                    className="h-10 w-10 cursor-pointer rounded border border-slate-200"
                    aria-label="Text color picker"
                  />
                  <input
                    id="content-text-color"
                    type="text"
                    value={formData.textColor}
                    onChange={(e) =>
                      setFormData({ ...formData, textColor: e.target.value })
                    }
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {formData.type === 'page' && (
          <div>
            <label htmlFor="content-body" className="block text-sm font-medium text-slate-700">
              Page Content (HTML)
            </label>
            <textarea
              id="content-body"
              rows={10}
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="<h1>Page Title</h1>\n<p>Your content here...</p>"
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/content"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Content
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Content'}
        </button>
      </div>
    </form>
  );
}

