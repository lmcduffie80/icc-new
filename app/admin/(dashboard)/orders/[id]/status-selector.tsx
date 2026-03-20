'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import { Loader2, ChevronDown } from 'lucide-react';

interface StatusSelectorProps {
  orderId: string;
  currentStatus: string;
  permissions: Permission[];
}

const statusOptions = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'processing', label: 'Processing', color: 'bg-blue-100 text-blue-800' },
  { value: 'shipped', label: 'Shipped', color: 'bg-purple-100 text-purple-800' },
  { value: 'delivered', label: 'Delivered', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
];

export function StatusSelector({ orderId, currentStatus, permissions }: StatusSelectorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');

  const canUpdateStatus = permissions.includes('orders.update_status');

  // Always show the status badge, but only make it interactive if user has permission
  if (!canUpdateStatus) {
    // Show read-only status badge
    const currentStatusOption = statusOptions.find(opt => opt.value === currentStatus) || statusOptions[0];
    return (
      <span
        className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
          currentStatusOption.color
        }`}
      >
        {currentStatusOption.label}
      </span>
    );
  }

  const currentStatusOption = statusOptions.find(opt => opt.value === currentStatus) || statusOptions[0];

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

      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setIsOpen(false);
        if (showTrackingModal) {
          setShowTrackingModal(false);
          setTrackingNumber('');
          setTrackingCarrier('');
          setPendingStatus(null);
        }
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusSelect = (newStatus: string) => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    if (newStatus === 'shipped') {
      // Show tracking modal for shipped status
      setPendingStatus(newStatus);
      setShowTrackingModal(true);
      setIsOpen(false);
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

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={updating}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            currentStatusOption.color
          } hover:opacity-80 disabled:opacity-50 cursor-pointer`}
        >
          {updating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              {currentStatusOption.label}
              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
              onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
              role="button"
              tabIndex={0}
              aria-label="Close status selector"
            />
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className="py-1">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleStatusSelect(option.value)}
                    disabled={updating || option.value === currentStatus}
                    className={`w-full px-4 py-2 text-left text-sm ${
                      option.value === currentStatus
                        ? 'bg-slate-50 font-medium text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

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
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

