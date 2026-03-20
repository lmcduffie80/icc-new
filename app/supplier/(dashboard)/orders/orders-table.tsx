'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { DataTable, Column } from '@/components/admin/data-table';

interface OrderItem {
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: string;
  unit_of_measure: string | null;
  total: string;
}

interface GroupedOrder {
  order_id: string;
  order_number: string;
  order_status: string;
  order_date: string;
  customer_name: string;
  items: OrderItem[];
  total_amount: number;
}

interface OrdersTableProps {
  orders: GroupedOrder[];
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function OrdersTable({ orders }: OrdersTableProps) {
  const formatCurrency = (amount: string | number): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const getStatusColor = (status: string) =>
    statusColors[status] || 'bg-slate-100 text-slate-800';

  const actions = (order: GroupedOrder) => (
    <Link
      href={`/supplier/orders/${order.order_id}`}
      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
    >
      <Eye className="h-4 w-4" />
      View
    </Link>
  );

  const columns: Column<GroupedOrder>[] = [
    {
      key: 'order_number',
      header: 'Order',
      sortable: true,
      render: (order) => (
        <div>
          <p className="font-medium text-slate-900">#{order.order_number}</p>
          <p className="text-sm text-slate-500">
            {new Date(order.order_date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (order) => (
        <p className="font-medium text-slate-900">{order.customer_name}</p>
      ),
    },
    {
      key: 'order_status',
      header: 'Status',
      sortable: true,
      render: (order) => (
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
            order.order_status
          )}`}
        >
          {order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      render: (order) => {
        const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <div>
        <span className="text-slate-600">
          {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
        </span>
            <p className="text-sm text-slate-500 mt-0.5">
              {totalQuantity} {totalQuantity === 1 ? 'unit' : 'units'} total
            </p>
          </div>
        );
      },
    },
    {
      key: 'total_amount',
      header: 'Total',
      sortable: true,
      render: (order) => {
        // Calculate total number of totes
        const totalTotes = order.items.reduce((sum, item) => {
          if (item.unit_of_measure && item.unit_of_measure.toLowerCase() === 'tote') {
            return sum + item.quantity;
          }
          return sum;
        }, 0);

        // Calculate price per gallon if there are totes
        let pricePerGallon: number | null = null;
        if (totalTotes > 0) {
          const totalGallons = totalTotes * 265;
          pricePerGallon = order.total_amount / totalGallons;
        }

        return (
          <div>
        <span className="font-medium text-slate-900">{formatCurrency(order.total_amount)}</span>
            {pricePerGallon !== null && (
              <p className="text-sm text-slate-500 mt-1">
                {formatCurrency(pricePerGallon)}/gal
              </p>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      data={orders}
      columns={columns}
      keyExtractor={(order) => order.order_id}
      searchKeys={['order_number']}
      searchPlaceholder="Search orders by number..."
      emptyMessage="No orders found"
      actions={actions}
    />
  );
}

