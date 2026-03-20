'use client';

import { AlertCircle, Package, ShoppingCart, Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface InventoryItem {
  productId: string;
  name: string;
  quantity: number;
  availableInventory: number;
  inventoryAvailable: boolean;
  nextAvailableQuantity?: number | null;
  nextAvailableDate?: string | null;
  nextAvailableWarehouseName?: string | null;
  canFulfillPartially?: boolean;
  partialQuantity?: number;
}

interface InventoryErrorMessageProps {
  items: InventoryItem[];
  errors: string[];
  onUpdateCart?: () => void;
  onAdjustQuantity?: (productId: string, newQuantity: number) => void;
}

export function InventoryErrorMessage({ items, errors, onUpdateCart, onAdjustQuantity }: InventoryErrorMessageProps) {
  const insufficientItems = items.filter(item => !item.inventoryAvailable);

  return (
    <div className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-900 mb-1">
            Inventory Issue Detected
          </h3>
          <p className="text-sm text-red-700">
            Some items in your cart are not available in the requested quantities.
          </p>
        </div>
      </div>

      {/* Inventory Details */}
      <div className="mb-4 space-y-3">
        {insufficientItems.map((item) => (
          <div
            key={item.productId}
            className="rounded-lg border border-red-200 bg-white p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-slate-900">{item.name}</h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Requested: <span className="font-semibold">{item.quantity}</span> units
                  </p>
                </div>
              </div>
            </div>
            
            <div className="ml-8 mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Available Inventory:</span>
                <span className={`text-sm font-semibold ${
                  item.availableInventory > 0 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {item.availableInventory} units
                </span>
              </div>
              {item.availableInventory > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-xs text-slate-500">
                    You can order up to {item.availableInventory} units now
                  </p>
                  {onAdjustQuantity && (
                    <button
                      onClick={() => onAdjustQuantity(item.productId, item.availableInventory)}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 underline"
                    >
                      Update to {item.availableInventory}
                    </button>
                  )}
                </div>
              )}
              
              {/* Next Available Information - Always show if available, even when inventory is 0 */}
              {(item.nextAvailableQuantity || item.nextAvailableDate) && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-900 mb-1">
                        Next Shipment Information:
                      </p>
                      {item.nextAvailableQuantity && item.nextAvailableDate ? (
                        <div className="space-y-1">
                          <p className="text-sm text-slate-700">
                            <span className="font-semibold text-blue-700">{item.nextAvailableQuantity} units</span> will be available on{' '}
                            <span className="font-semibold text-blue-700">
                              {new Date(item.nextAvailableDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                            {item.nextAvailableWarehouseName && (
                              <> at <span className="font-semibold text-blue-700">{item.nextAvailableWarehouseName}</span> warehouse</>
                            )}
                          </p>
                          {item.canFulfillPartially && item.partialQuantity && item.partialQuantity > 0 && (
                            <p className="text-sm text-emerald-700 mt-2 font-medium bg-emerald-50 p-2 rounded border border-emerald-200">
                              ✓ We can ship <span className="font-semibold">{item.partialQuantity} units now</span>, and the remaining <span className="font-semibold">{item.quantity - item.partialQuantity} units</span> on{' '}
                              <span className="font-semibold">
                                {new Date(item.nextAvailableDate).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                              {item.nextAvailableWarehouseName && (
                                <> from <span className="font-semibold">{item.nextAvailableWarehouseName}</span> warehouse</>
                              )}
                            </p>
                          )}
                        </div>
                      ) : item.nextAvailableDate ? (
                        <p className="text-sm text-slate-700">
                          Next shipment expected on{' '}
                          <span className="font-semibold text-blue-700">
                            {new Date(item.nextAvailableDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </span>
                          {item.nextAvailableWarehouseName && (
                            <> at <span className="font-semibold text-blue-700">{item.nextAvailableWarehouseName}</span> warehouse</>
                          )}
                        </p>
                      ) : item.nextAvailableQuantity ? (
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-blue-700">{item.nextAvailableQuantity} units</span> expected in next shipment
                          {item.nextAvailableWarehouseName && (
                            <> at <span className="font-semibold text-blue-700">{item.nextAvailableWarehouseName}</span> warehouse</>
                          )}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Next Steps */}
      <div className="border-t border-red-200 pt-4">
        <h4 className="text-sm font-semibold text-red-900 mb-3">Next Steps:</h4>
        <div className="space-y-2">
          {insufficientItems.some(item => item.availableInventory > 0) && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-red-200">
              <ShoppingCart className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 mb-1">
                  Update Your Cart
                </p>
                <p className="text-xs text-slate-600 mb-2">
                  Reduce quantities to match available inventory, or remove items that are out of stock.
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/shop"
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Return to Shop
                  </Link>
                  {onUpdateCart && (
                    <button
                      onClick={onUpdateCart}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      Update Cart
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {insufficientItems.some(item => item.availableInventory === 0) && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-red-200">
              <Mail className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 mb-1">
                  Contact Support
                </p>
                <p className="text-xs text-slate-600">
                  Some items are completely out of stock. Please contact us at{' '}
                  <a
                    href="mailto:support@innovativecropcare.com"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    support@innovativecropcare.com
                  </a>
                  {' '}or call{' '}
                  <a
                    href="tel:2293265408"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    (229) 326-5408
                  </a>
                  {' '}to check availability or place a backorder.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Error Messages */}
      {errors.length > 0 && (
        <div className="mt-4 pt-4 border-t border-red-200">
          <p className="text-xs font-medium text-red-800 mb-2">Additional Information:</p>
          <ul className="space-y-1">
            {errors.map((error, index) => (
              <li key={index} className="text-xs text-red-700 flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>{error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

