'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/data-table';
import { Permission } from '@/lib/permissions';
import { Eye, MoreHorizontal, AlertCircle, Warehouse } from 'lucide-react';

interface Order {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  shipping_address: object;
  billing_address: object;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_name: string;
  metadata?: { manual_shipping?: boolean };
}

interface OrdersTableProps {
  orders: Order[];
  permissions: Permission[];
}

const statusOptions = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'processing', label: 'Processing', color: 'bg-blue-100 text-blue-800' },
  { value: 'shipped', label: 'Shipped', color: 'bg-purple-100 text-purple-800' },
  { value: 'delivered', label: 'Delivered', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
];

export function OrdersTable({ orders, permissions }: OrdersTableProps) {
  const router = useRouter();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [showWarehouseMessage, setShowWarehouseMessage] = useState(false);
  const [warehouseInfo, setWarehouseInfo] = useState<{
    multipleWarehouses: boolean;
    warehouseNames: string[];
  } | null>(null);

  const canUpdateStatus = permissions.includes('orders.update_status');

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingStatus(orderId);
    setOpenDropdown(null);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Check if multiple warehouses were used
        if (data.multipleWarehouses && data.warehouseAllocations) {
          const warehouseNames = data.warehouseAllocations.map((alloc: { warehouse_name: string }) => alloc.warehouse_name);
          setWarehouseInfo({
            multipleWarehouses: true,
            warehouseNames,
          });
          setShowWarehouseMessage(true);
        }
        
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update order status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const getStatusColor = (status: string) =>
    statusOptions.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-800';

  const columns: Column<Order>[] = [
    {
      key: 'order_number',
      header: 'Order',
      sortable: true,
      render: (order) => (
        <div>
          <p className="font-medium text-slate-900">#{order.order_number}</p>
          <p className="text-sm text-slate-500">
            {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
      ),
    },
    {
      key: 'user_email',
      header: 'Customer',
      sortable: true,
      render: (order) => (
        <div>
          <p className="font-medium text-slate-900">{order.user_name || 'Unknown'}</p>
          <p className="text-sm text-slate-500">{order.user_email}</p>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      render: (order) => {
        // Check if shipping was manually set
        let isManualShipping = false;
        if (order.metadata) {
          if (typeof order.metadata === 'string') {
            try {
              const parsed = JSON.parse(order.metadata);
              isManualShipping = parsed.manual_shipping === true;
            } catch {
              // Invalid JSON, ignore
            }
          } else if (typeof order.metadata === 'object') {
            isManualShipping = order.metadata.manual_shipping === true;
          }
        }
        
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{formatCurrency(order.total)}</span>
            {isManualShipping && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="Manual shipping cost">
                <AlertCircle className="h-3 w-3" />
                Manual
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (order) => (
        <div className="relative">
          {canUpdateStatus && order.status !== 'delivered' && order.status !== 'cancelled' ? (
            <div>
              <button
                onClick={() => setOpenDropdown(openDropdown === order.id ? null : order.id)}
                disabled={updatingStatus === order.id}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
                  order.status
                )} hover:opacity-80 disabled:opacity-50`}
              >
                {updatingStatus === order.id ? 'Updating...' : order.status}
                <MoreHorizontal className="h-3 w-3" />
              </button>
              {openDropdown === order.id && (
                <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {statusOptions
                    .filter((s) => s.value !== order.status)
                    .map((status) => (
                      <button
                        key={status.value}
                        onClick={() => handleStatusChange(order.id, status.value)}
                        className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
                order.status
              )}`}
            >
              {order.status}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'delivery_method',
      header: 'Delivery',
      render: (order) => (
        <span className="text-slate-600 capitalize">{order.delivery_method}</span>
      ),
    },
  ];

  const actions = (order: Order) => (
    <Link
      href={`/admin/orders/${order.id}`}
      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
    >
      <Eye className="h-4 w-4" />
      View
    </Link>
  );

  return (
    <>
      {/* Click outside to close dropdown */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setOpenDropdown(null)}
          onKeyDown={(e) => e.key === 'Escape' && setOpenDropdown(null)}
          role="presentation"
        />
      )}

      {/* Warehouse Allocation Message */}
      {showWarehouseMessage && warehouseInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-slate-900">Multiple Warehouses Used</h3>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              This order&apos;s inventory is being pulled from multiple warehouse locations:
            </p>
            <ul className="mb-4 space-y-2">
              {warehouseInfo.warehouseNames.map((name, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  {name}
                </li>
              ))}
            </ul>
            <p className="mb-4 text-xs text-slate-500">
              Separate Bills of Lading will be generated for each warehouse when you email the carrier.
            </p>
            <button
              onClick={() => {
                setShowWarehouseMessage(false);
                setWarehouseInfo(null);
              }}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <DataTable
        data={orders}
        columns={columns}
        keyExtractor={(order) => order.id}
        searchKeys={['order_number', 'user_email', 'user_name']}
        searchPlaceholder="Search orders..."
        emptyMessage="No orders found"
        actions={actions}
      />
    </>
  );
}

