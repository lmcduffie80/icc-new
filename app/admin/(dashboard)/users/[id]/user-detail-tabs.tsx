'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Mail,
  Calendar,
  ShoppingBag,
  Wheat,
  MapPin,
  Sprout,
  LandPlot,
  FileText,
  Download,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { US_STATE_NAMES } from '@/lib/constants/states';
import { Button } from '@/components/ui/button';

interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  email_verified: boolean;
  created_at: string;
  orders_count: number;
  total_spent: string;
}

interface FarmProfile {
  farm_name: string;
  zip_code: string;
  crop_types: string;
  farm_acres: string;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: string;
  created_at: string;
}

interface Invoice {
  id: string;
  state: string;
  fileUrl: string;
  filename: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

interface UserDetailTabsProps {
  user: User;
  farmProfile: FarmProfile | null;
  orders: Order[];
  canViewOrders: boolean;
  userId: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const formatCurrency = (amount: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    parseFloat(amount)
  );

const getFileIcon = (fileType: string) => {
  if (fileType === 'application/pdf') {
    return <FileText className="h-4 w-4" />;
  }
  return <ImageIcon className="h-4 w-4" />;
};

export function UserDetailTabs({
  user,
  farmProfile,
  orders,
  canViewOrders,
  userId,
}: UserDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'invoices'>('overview');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    ...(canViewOrders ? [{ id: 'orders' as const, label: 'Orders' }] : []),
    { id: 'invoices' as const, label: 'Invoices' },
  ];

  useEffect(() => {
    if (activeTab === 'invoices' && invoices.length === 0 && !loadingInvoices) {
      fetchInvoices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    setInvoicesError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/invoices`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setInvoicesError('Failed to load invoices. Please try again.');
    } finally {
      setLoadingInvoices(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* User Details */}
            <div>
              <h2 className="text-lg mb-4 font-semibold text-slate-900">User Details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500">Email</p>
                    <p className="font-medium text-slate-900">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500">Joined</p>
                    <p className="font-medium text-slate-900">
                      {new Date(user.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ShoppingBag className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500">Total Orders</p>
                    <p className="font-medium text-slate-900">{user.orders_count}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-5 w-5 items-center justify-center text-slate-400">
                    $
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Spent</p>
                    <p className="font-medium text-slate-900">
                      {formatCurrency(user.total_spent)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Farm Information */}
            {farmProfile && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Wheat className="h-5 w-5 text-amber-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Farm Information</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <Wheat className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-500">Farm Name</p>
                      <p className="font-medium text-slate-900">{farmProfile.farm_name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-500">ZIP Code</p>
                      <p className="font-medium text-slate-900">{farmProfile.zip_code}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <LandPlot className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-500">Farm Size</p>
                      <p className="font-medium text-slate-900">{farmProfile.farm_acres} acres</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <Sprout className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Type of Crops</p>
                    <p className="font-medium text-slate-900 whitespace-pre-wrap">
                      {farmProfile.crop_types}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && canViewOrders && (
          <div>
            <h2 className="text-lg mb-4 font-semibold text-slate-900">Recent Orders</h2>
            {orders.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">No orders yet</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">#{order.order_number}</p>
                      <p className="text-sm text-slate-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-900">{formatCurrency(order.total)}</p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusColors[order.status] || 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div>
            <h2 className="text-lg mb-4 font-semibold text-slate-900">User Invoices</h2>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : invoicesError ? (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
                {invoicesError}
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                No invoices uploaded yet
              </div>
            ) : (
              <div className="space-y-4">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden"
                  >
                    {/* Invoice Header */}
                    <div className="p-6 border-b border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-6">
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wide">State</p>
                            <p className="font-medium text-slate-900">
                              {US_STATE_NAMES[invoice.state] || invoice.state} ({invoice.state})
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wide">
                              Uploaded
                            </p>
                            <p className="font-medium text-slate-900">
                              {new Date(invoice.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium text-emerald-600 bg-emerald-50 border-emerald-200">
                          {getFileIcon(invoice.fileType)}
                          <span className="ml-1">Verified</span>
                        </div>
                      </div>
                    </div>

                    {/* Invoice Content */}
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        {getFileIcon(invoice.fileType)}
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{invoice.filename}</p>
                          <p className="text-sm text-slate-500">
                            {invoice.fileType === 'application/pdf' ? 'PDF Document' : 'Image'}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <a
                          href={invoice.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={invoice.filename}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Invoice
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

