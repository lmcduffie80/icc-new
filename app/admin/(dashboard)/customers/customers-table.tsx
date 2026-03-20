'use client';

import { DataTable, Column } from '@/components/admin/data-table';
import { User, Mail, Phone, MapPin, FileText, Calendar, ExternalLink } from 'lucide-react';

interface CustomerInvoice {
  id: string;
  upload_date: string;
  customer_name: string;
  email: string;
  invoice_state: string;
  filename: string;
  file_url: string;
  shipping_address: string | ShippingAddress | null; // Can be string or object from JSONB
  profile_phone: string | null;
}

interface CustomersTableProps {
  invoices: CustomerInvoice[];
}

interface ShippingAddress {
  firstName?: string;
  lastName?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  phone?: string;
  email?: string;
}

export function CustomersTable({ invoices }: CustomersTableProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parseAddress = (addressData: string | ShippingAddress | null): ShippingAddress | null => {
    if (!addressData) return null;
    
    // PostgreSQL JSONB columns are automatically parsed to objects
    // So check if it's already an object and return it directly
    if (typeof addressData === 'object') {
      return addressData as ShippingAddress;
    }
    
    // If it's a string, try to parse it
    try {
      return JSON.parse(addressData) as ShippingAddress;
    } catch {
      return null;
    }
  };

  const formatFullAddress = (address: ShippingAddress | null): string => {
    if (!address) return 'N/A';
    const parts = [
      address.line1,
      address.line2,
      address.city,
      `${address.state} ${address.zipCode}`,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const getDocumentProxyUrl = (url: string): string => {
    if (!url) return url;
    
    // If already a proxy URL, return as-is
    if (url.includes('/api/images/proxy')) {
      return url;
    }
    
    // Ensure URL has a protocol
    let fullUrl = url.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `https://${fullUrl}`;
    }
    
    // Check if it's an S3 URL
    const urlLower = fullUrl.toLowerCase();
    const isS3Url = 
      urlLower.includes('s3.amazonaws.com') ||
      urlLower.includes('.s3.') ||
      urlLower.includes('s3-');
    
    if (isS3Url) {
      return `/api/images/proxy?url=${encodeURIComponent(fullUrl)}`;
    }
    
    return url;
  };

  const columns: Column<CustomerInvoice>[] = [
    {
      key: 'upload_date',
      header: 'Upload Date',
      sortable: true,
      render: (invoice) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900">{formatDate(invoice.upload_date)}</span>
          </div>
          <div className="text-xs text-slate-500 ml-6">
            {formatDateTime(invoice.upload_date)}
          </div>
        </div>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (invoice) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{invoice.customer_name}</span>
          </div>
          <div className="flex items-center space-x-2 ml-6">
            <Mail className="h-3 w-3 text-slate-400" />
            <span className="text-xs text-slate-600">{invoice.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      render: (invoice) => {
        const address = parseAddress(invoice.shipping_address);
        return (
          <div className="flex items-start space-x-2 max-w-xs">
            <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-slate-600">
              {formatFullAddress(address)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (invoice) => {
        // Priority: profile phone, fallback to shipping address phone
        let phone = invoice.profile_phone;
        
        if (!phone) {
          const address = parseAddress(invoice.shipping_address);
          phone = address?.phone || null;
        }
        
        return phone ? (
          <div className="flex items-center space-x-2">
            <Phone className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">{phone}</span>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      key: 'invoice_state',
      header: 'State',
      sortable: true,
      render: (invoice) => (
        <div className="flex items-center justify-center">
          <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            {invoice.invoice_state}
          </span>
        </div>
      ),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      render: (invoice) => (
        <div className="space-y-1">
          <a
            href={getDocumentProxyUrl(invoice.file_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            title={invoice.filename}
          >
            <FileText className="h-4 w-4" />
            View
            <ExternalLink className="h-3 w-3" />
          </a>
          <div className="text-xs text-slate-500 truncate max-w-[150px]" title={invoice.filename}>
            {invoice.filename}
          </div>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={invoices}
      columns={columns}
      keyExtractor={(invoice) => invoice.id}
      searchKeys={['customer_name', 'email', 'invoice_state', 'filename']}
      searchPlaceholder="Search by customer name, email, state, or filename..."
      emptyMessage="No customer invoices found"
    />
  );
}
