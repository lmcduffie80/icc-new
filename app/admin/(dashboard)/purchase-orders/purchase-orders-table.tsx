'use client';

import { DataTable, Column } from '@/components/admin/data-table';
import { FileText, Calendar, Building2, DollarSign, CheckCircle, Clock, Send, Package, Ban, Edit, Eye } from 'lucide-react';
import Link from 'next/link';

interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_id: number | null;
  supplier_id: string | null;
  order_date: string;
  buyer_id: number | null;
  buyer_name: string;
  buyer_user_id: string | null;
  payment_terms: string;
  ship_to_address_id: number;
  bill_to_address_id: number;
  currency: string;
  tax_rate: number;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor_name?: string | null;
  supplier_name?: string | null;
}

interface PurchaseOrdersTableProps {
  purchaseOrders: PurchaseOrder[];
}

export function PurchaseOrdersTable({ purchaseOrders }: PurchaseOrdersTableProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPaymentTerms = (terms: string) => {
    return terms.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <FileText className="h-4 w-4 text-slate-400" />;
      case 'SUBMITTED':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'SENT':
        return <Send className="h-4 w-4 text-emerald-600" />;
      case 'RECEIVED':
        return <Package className="h-4 w-4 text-purple-600" />;
      case 'CLOSED':
        return <CheckCircle className="h-4 w-4 text-green-700" />;
      case 'CANCELLED':
        return <Ban className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'text-slate-600';
      case 'SUBMITTED':
        return 'text-blue-700';
      case 'APPROVED':
        return 'text-green-700';
      case 'SENT':
        return 'text-emerald-700';
      case 'RECEIVED':
        return 'text-purple-700';
      case 'CLOSED':
        return 'text-green-800';
      case 'CANCELLED':
        return 'text-red-700';
      default:
        return 'text-slate-600';
    }
  };

  const columns: Column<PurchaseOrder>[] = [
    {
      key: 'po_number',
      header: 'PO Number',
      sortable: true,
      render: (po) => (
        <Link
          href={`/admin/purchase-orders/${po.id.toString().split(':')[0].trim()}`}
          className="flex items-center space-x-2 hover:text-emerald-600 transition-colors"
        >
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="font-medium text-slate-900">{po.po_number}</span>
        </Link>
      ),
    },
    {
      key: 'vendor_id',
      header: 'Vendor/Supplier',
      sortable: true,
      render: (po) => (
        <div className="flex items-center space-x-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span className="text-slate-900">
            {po.vendor_name || po.supplier_name || 'N/A'}
          </span>
        </div>
      ),
    },
    {
      key: 'order_date',
      header: 'Order Date',
      sortable: true,
      render: (po) => (
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span className="text-slate-600">{formatDate(po.order_date)}</span>
        </div>
      ),
    },
    {
      key: 'buyer_name',
      header: 'Buyer',
      sortable: true,
      render: (po) => (
        <span className="text-slate-600">{po.buyer_name}</span>
      ),
    },
    {
      key: 'payment_terms',
      header: 'Payment Terms',
      render: (po) => (
        <span className="text-slate-600">
          {formatPaymentTerms(po.payment_terms)}
        </span>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      sortable: true,
      render: (po) => (
        <div className="flex items-center space-x-2">
          <DollarSign className="h-4 w-4 text-slate-400" />
          <span className="font-medium text-slate-900">{formatCurrency(po.total_amount)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (po) => (
        <div className="flex items-center space-x-2">
          {getStatusIcon(po.status)}
          <span className={`font-medium ${getStatusColor(po.status)}`}>
            {po.status.charAt(0) + po.status.slice(1).toLowerCase()}
          </span>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (po) => (
        <span className="text-slate-500">
          {formatDate(po.created_at)}
        </span>
      ),
    },
  ];

  const actions = (po: PurchaseOrder) => (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => {
          // Clean the ID in case it has any unexpected characters
          const cleanId = po.id.toString().split(':')[0].trim();
          window.open(`/api/admin/purchase-orders/${cleanId}/pdf`, '_blank');
        }}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
        title="Preview PDF"
      >
        <Eye className="h-4 w-4" />
      </button>
      <Link
        href={`/admin/purchase-orders/${po.id.toString().split(':')[0].trim()}/edit`}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Edit purchase order"
      >
        <Edit className="h-4 w-4" />
      </Link>
    </div>
  );

  return (
    <DataTable
      data={purchaseOrders}
      columns={columns}
      keyExtractor={(po) => po.id.toString()}
      searchKeys={['po_number', 'buyer_name', 'vendor_name', 'supplier_name']}
      searchPlaceholder="Search purchase orders by PO number, buyer, or vendor..."
      emptyMessage="No purchase orders found"
      actions={actions}
    />
  );
}

