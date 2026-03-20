import { getAdminSession } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import { ContentForm } from '../content-form';

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

async function getContent(id: string): Promise<Content | null> {
  return queryOne<Content>('SELECT * FROM site_content WHERE id = $1', [id]);
}

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('content.update')) {
    redirect('/admin/content');
  }

  const { id } = await params;
  const content = await getContent(id);

  if (!content) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Edit Content</h1>
        <p className="mt-1 text-slate-500">Update {content.type} content</p>
      </div>

      <ContentForm content={content} />
    </div>
  );
}

