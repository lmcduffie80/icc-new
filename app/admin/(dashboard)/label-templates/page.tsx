'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, FileText, Check, X, Eye, Edit, Trash2, Search, Filter } from 'lucide-react';

interface LabelTemplate {
  id: string;
  product_name: string;
  template_name: string;
  label_image_url: string;
  short_description: string;
  long_description: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_by_admin_id: string | null;
  approved_by_admin_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function LabelTemplatesPage() {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<LabelTemplate | null>(null);

  useEffect(() => {
    fetchTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      let url = '/api/admin/label-templates?';
      if (statusFilter) {
        url += `approval_status=${statusFilter}&`;
      }
      url += 'is_active=true';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Are you sure you want to approve this template?')) return;

    try {
      const response = await fetch(`/api/admin/label-templates/${id}/approve`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchTemplates();
        setSelectedTemplate(null);
      } else {
        alert('Failed to approve template');
      }
    } catch (error) {
      console.error('Failed to approve template:', error);
      alert('Failed to approve template');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return; // User cancelled

    try {
      const response = await fetch(`/api/admin/label-templates/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: reason || null }),
      });

      if (response.ok) {
        fetchTemplates();
        setSelectedTemplate(null);
      } else {
        alert('Failed to reject template');
      }
    } catch (error) {
      console.error('Failed to reject template:', error);
      alert('Failed to reject template');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template? It will be hidden from suppliers.')) return;

    try {
      const response = await fetch(`/api/admin/label-templates/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchTemplates();
        setSelectedTemplate(null);
      } else {
        alert('Failed to delete template');
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('Failed to delete template');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status as keyof typeof styles]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const filteredTemplates = templates.filter((template) =>
    template.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.template_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Label Templates</h1>
          <p className="mt-2 text-slate-600">
            Manage reusable product label templates for suppliers
          </p>
        </div>
        <Link
          href="/admin/label-templates/new"
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          <Plus className="h-5 w-5" />
          New Template
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600">Loading templates...</div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No templates found</h3>
          <p className="mt-2 text-slate-600">
            {searchTerm || statusFilter
              ? 'Try adjusting your search or filters'
              : 'Get started by creating your first label template'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Image */}
              <div className="relative h-48 bg-slate-100">
                <Image
                  src={`/api/images/proxy?url=${encodeURIComponent(template.label_image_url)}`}
                  alt={template.template_name}
                  fill
                  className="object-contain p-2"
                  unoptimized
                />
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{template.template_name}</h3>
                    <p className="text-sm text-slate-600 mt-1">{template.product_name}</p>
                  </div>
                  {getStatusBadge(template.approval_status)}
                </div>

                <p className="text-sm text-slate-600 line-clamp-2">
                  {template.short_description}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => setSelectedTemplate(template)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>

                  <Link
                    href={`/admin/label-templates/${template.id}/edit`}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Link>

                  {template.approval_status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(template.id)}
                        className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleReject(template.id)}
                        className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => handleDelete(template.id)}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedTemplate && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" 
          onClick={() => setSelectedTemplate(null)}
          onKeyDown={(e) => e.key === 'Escape' && setSelectedTemplate(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <h2 className="text-2xl font-bold text-slate-900">{selectedTemplate.template_name}</h2>
                <button onClick={() => setSelectedTemplate(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="relative h-64 bg-slate-100 rounded-lg">
                <Image
                  src={`/api/images/proxy?url=${encodeURIComponent(selectedTemplate.label_image_url)}`}
                  alt={selectedTemplate.template_name}
                  fill
                  className="object-contain p-4"
                  unoptimized
                />
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-slate-700">Product Name</div>
                  <p className="mt-1 text-slate-900">{selectedTemplate.product_name}</p>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700">Status</div>
                  <div className="mt-1">{getStatusBadge(selectedTemplate.approval_status)}</div>
                </div>

                {selectedTemplate.rejection_reason && (
                  <div>
                    <div className="text-sm font-medium text-slate-700">Rejection Reason</div>
                    <p className="mt-1 text-red-600">{selectedTemplate.rejection_reason}</p>
                  </div>
                )}

                <div>
                  <div className="text-sm font-medium text-slate-700">Short Description</div>
                  <p className="mt-1 text-slate-900">{selectedTemplate.short_description}</p>
                </div>

                {selectedTemplate.long_description && (
                  <div>
                    <div className="text-sm font-medium text-slate-700">Long Description</div>
                    <p className="mt-1 text-slate-900 whitespace-pre-wrap">{selectedTemplate.long_description}</p>
                  </div>
                )}

                <div className="flex gap-4 text-sm text-slate-600">
                  <div>Created: {new Date(selectedTemplate.created_at).toLocaleDateString()}</div>
                  {selectedTemplate.approved_at && (
                    <div>Approved: {new Date(selectedTemplate.approved_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-200">
                {selectedTemplate.approval_status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApprove(selectedTemplate.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <Check className="h-5 w-5" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(selectedTemplate.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      <X className="h-5 w-5" />
                      Reject
                    </button>
                  </>
                )}
                <Link
                  href={`/admin/label-templates/${selectedTemplate.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                >
                  <Edit className="h-5 w-5" />
                  Edit
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
