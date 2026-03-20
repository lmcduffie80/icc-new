'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/data-table';
import { Permission } from '@/lib/permissions';
import { Edit, Trash2, Eye, EyeOff, Image as ImageIcon, MessageSquare, FileText } from 'lucide-react';

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

interface ContentTableProps {
  content: Content[];
  permissions: Permission[];
}

export function ContentTable({ content, permissions }: ContentTableProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);

  const canUpdate = permissions.includes('content.update');
  const canDelete = permissions.includes('content.delete');
  const canPublish = permissions.includes('content.publish');

  const handleTogglePublish = async (id: string) => {
    setProcessing(id);
    try {
      const response = await fetch(`/api/admin/content/${id}`, {
        method: 'POST',
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to toggle publish status');
      }
    } catch (error) {
      console.error('Error toggling publish:', error);
      alert('Failed to toggle publish status');
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this content?')) return;

    setProcessing(id);
    try {
      const response = await fetch(`/api/admin/content/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete content');
      }
    } catch (error) {
      console.error('Error deleting content:', error);
      alert('Failed to delete content');
    } finally {
      setProcessing(null);
    }
  };

  const typeIcons: Record<string, React.ReactNode> = {
    banner: <ImageIcon className="h-5 w-5 text-blue-500" />,
    announcement: <MessageSquare className="h-5 w-5 text-yellow-500" />,
    page: <FileText className="h-5 w-5 text-primary" />,
  };

  const typeColors: Record<string, string> = {
    banner: 'bg-blue-100 text-blue-800',
    announcement: 'bg-yellow-100 text-yellow-800',
    page: 'bg-green-100 text-green-800',
  };

  const columns: Column<Content>[] = [
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2">
          {typeIcons[item.type]}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              typeColors[item.type] || 'bg-slate-100 text-slate-800'
            }`}
          >
            {item.type}
          </span>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-medium text-slate-900">{item.title || 'Untitled'}</p>
          {item.slug && <p className="text-sm text-slate-500">/{item.slug}</p>}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (item) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            item.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {item.is_active ? 'Published' : 'Draft'}
        </span>
      ),
    },
    {
      key: 'display_order',
      header: 'Order',
      sortable: true,
      render: (item) => <span className="text-slate-600">{item.display_order}</span>,
    },
    {
      key: 'updated_at',
      header: 'Updated',
      sortable: true,
      render: (item) => (
        <span className="text-slate-500">
          {new Date(item.updated_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const actions = (item: Content) => (
    <div className="flex items-center justify-end gap-2">
      {canPublish && (
        <button
          onClick={() => handleTogglePublish(item.id)}
          disabled={processing === item.id}
          className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
            item.is_active
              ? 'text-primary hover:bg-green-50'
              : 'text-slate-400 hover:bg-slate-100'
          }`}
          title={item.is_active ? 'Unpublish' : 'Publish'}
        >
          {item.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      )}
      {canUpdate && (
        <Link
          href={`/admin/content/${item.id}`}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Edit className="h-4 w-4" />
        </Link>
      )}
      {canDelete && (
        <button
          onClick={() => handleDelete(item.id)}
          disabled={processing === item.id}
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <DataTable
      data={content}
      columns={columns}
      keyExtractor={(item) => item.id}
      searchKeys={['title', 'slug', 'type']}
      searchPlaceholder="Search content..."
      emptyMessage="No content found"
      actions={actions}
    />
  );
}

