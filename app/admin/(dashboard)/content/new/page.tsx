import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { ContentForm } from '../content-form';

export default async function NewContentPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('content.create')) {
    redirect('/admin/content');
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create New Content</h1>
        <p className="mt-1 text-slate-500">Add a new banner, announcement, or page</p>
      </div>

      <ContentForm />
    </div>
  );
}

