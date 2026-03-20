'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import { RefreshCw, XCircle, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

interface Order {
  id: string;
  status: string;
  total: string;
}

interface OrderActionsProps {
  order: Order;
  permissions: Permission[];
}

export function OrderActions({ order, permissions }: OrderActionsProps) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');

  const canUpdateStatus = permissions.includes('orders.update_status');
  const canRefund = permissions.includes('orders.refund');
  const canCancel = permissions.includes('orders.cancel');

  const [showWarehouseMessage, setShowWarehouseMessage] = useState(false);
  const [warehouseInfo, setWarehouseInfo] = useState<{
    multipleWarehouses: boolean;
    warehouseNames: string[];
  } | null>(null);

  const handleStatusChange = async (newStatus: string, trackingNum?: string, trackingCar?: string) => {
    setUpdating(true);
    try {
      const body: { status: string; tracking_number?: string; tracking_carrier?: string } = { status: newStatus };
      if (newStatus === 'shipped' && trackingNum) {
        body.tracking_number = trackingNum;
        if (trackingCar) {
          body.tracking_carrier = trackingCar;
        }
      }

      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
        
        // Close tracking modal if it was open
        if (showTrackingModal) {
          setShowTrackingModal(false);
          setTrackingNumber('');
          setTrackingCarrier('');
          setPendingStatus(null);
        }
        
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusButtonClick = (newStatus: string) => {
    if (newStatus === 'shipped') {
      // Show tracking modal for shipped status
      setPendingStatus(newStatus);
      setShowTrackingModal(true);
    } else {
      // Direct status change for other statuses
      handleStatusChange(newStatus);
    }
  };

  const handleTrackingSubmit = () => {
    if (!trackingNumber.trim()) {
      alert('Tracking number is required');
      return;
    }
    if (pendingStatus) {
      handleStatusChange(pendingStatus, trackingNumber.trim(), trackingCarrier.trim());
    }
  };

  const handleRefund = async () => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: refundReason }),
      });

      if (response.ok) {
        setShowRefundModal(false);
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to process refund');
      }
    } catch (error) {
      console.error('Error processing refund:', error);
      alert('Failed to process refund');
    } finally {
      setUpdating(false);
    }
  };

  if (order.status === 'delivered' || order.status === 'cancelled') {
    return canRefund && order.status !== 'cancelled' ? (
      <button
        onClick={() => setShowRefundModal(true)}
        disabled={updating}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
      >
        <RefreshCw className="h-4 w-4" />
        Process Refund
      </button>
    ) : null;
  }

  const nextStatuses: Record<string, { label: string; value: string }[]> = {
    pending: [{ label: 'Start Processing', value: 'processing' }],
    processing: [{ label: 'Mark as Shipped', value: 'shipped' }],
    shipped: [{ label: 'Mark as Delivered', value: 'delivered' }],
  };

  const availableStatuses = nextStatuses[order.status] || [];

  return (
    <div className="flex items-center gap-3">
      {canUpdateStatus &&
        availableStatuses.map((status) => (
          <button
            key={status.value}
            onClick={() => handleStatusButtonClick(status.value)}
            disabled={updating}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {status.label}
          </button>
        ))}

      {canCancel && order.status !== 'cancelled' && (
        <button
          onClick={() => handleStatusButtonClick('cancelled')}
          disabled={updating}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          Cancel Order
        </button>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Add Tracking Information</h3>
            <p className="mb-4 text-sm text-slate-600">
              Please enter the tracking details for this shipment.
            </p>
            <div className="mb-4">
              <label htmlFor="tracking-number" className="mb-2 block text-sm font-medium text-slate-700">
                Tracking Number <span className="text-red-500">*</span>
              </label>
              <input
                id="tracking-number"
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number"
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="tracking-carrier" className="mb-2 block text-sm font-medium text-slate-700">
                Carrier (Optional)
              </label>
              <input
                id="tracking-carrier"
                type="text"
                value={trackingCarrier}
                onChange={(e) => setTrackingCarrier(e.target.value)}
                placeholder="e.g., UPS, FedEx, USPS"
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowTrackingModal(false);
                  setTrackingNumber('');
                  setTrackingCarrier('');
                  setPendingStatus(null);
                }}
                disabled={updating}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTrackingSubmit}
                disabled={updating || !trackingNumber.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as Shipped
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warehouse Allocation Message */}
      {showWarehouseMessage && warehouseInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Multiple Warehouses Used</h3>
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

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Process Refund</h3>
            <p className="mb-4 text-sm text-slate-500">
              This will refund the full order amount of{' '}
              <span className="font-medium text-slate-900">
                {formatPrice(parseFloat(order.total))}
              </span>{' '}
              and cancel the order.
            </p>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Reason for refund (optional)"
              className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              rows={3}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRefundModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={updating}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

