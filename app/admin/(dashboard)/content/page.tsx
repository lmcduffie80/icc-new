import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentTable } from './content-table';

interface Content {
  id: string;
  type: string;
  title: string | null;
  slug: string | null;
  content: object;
  is_active: boolean;
  display_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

async function getContent(): Promise<Content[]> {
  return query<Content>('SELECT * FROM site_content ORDER BY type, display_order ASC, created_at DESC');
}

export default async function ContentPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('content.view')) {
    redirect('/admin');
  }

  const content = await getContent();
  const canCreate = session.permissions.includes('content.create');

  // Group content by type
  const banners = content.filter((c) => c.type === 'banner');
  const announcements = content.filter((c) => c.type === 'announcement');
  const pages = content.filter((c) => c.type === 'page');

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Content Management</h1>
          <p className="mt-1 text-slate-500">Manage banners, announcements, and pages</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/content/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Content
          </Link>
        )}
      </div>

      {/* Content Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Banners</h3>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              {banners.filter((b) => b.is_active).length} active
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{banners.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Announcements</h3>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
              {announcements.filter((a) => a.is_active).length} active
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{announcements.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Pages</h3>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              {pages.filter((p) => p.is_active).length} active
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{pages.length}</p>
        </div>
      </div>

      <ContentTable content={content} permissions={session.permissions} />
    </div>
  );
}

