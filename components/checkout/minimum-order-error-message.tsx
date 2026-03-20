'use client';

import { AlertCircle, ShoppingCart } from 'lucide-react';

interface MinimumOrderErrorItem {
  productName: string;
  minimumOrderQty: number;
  orderedQty: number;
  productId?: string;
}

interface MinimumOrderErrorMessageProps {
  items: MinimumOrderErrorItem[];
}

// Format phone number for tel: href (remove all non-digit characters except +)
function formatPhoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function MinimumOrderErrorMessage({ items }: MinimumOrderErrorMessageProps) {
  // Innovative CropCare, LLC contact information
  const phone = '(229) 326-5408';
  const email = 'billing@innovativecropcare.com';
  
  return (
    <div className="p-6 bg-amber-50 border-2 border-amber-300 rounded-lg shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-amber-600" />
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-amber-900 mb-2">
            Minimum Order Quantity Not Met
          </h3>
          <p className="text-sm text-amber-800 mb-4">
            Some products in your cart have minimum order quantity requirements that haven&apos;t been met. Please update your quantities to proceed with checkout.
          </p>
          
          <div className="bg-white rounded-md border border-amber-200 p-4 mb-4">
            <p className="text-sm font-medium text-amber-900 mb-3">
              Products requiring quantity updates:
            </p>
            <ul className="space-y-2">
              {items.map((item, index) => {
                const needed = item.minimumOrderQty - item.orderedQty;
                return (
                  <li key={index} className="text-sm text-amber-800">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <strong className="text-amber-900">{item.productName}</strong>
                        <div className="mt-1 text-xs text-amber-700">
                          <span className="inline-block px-2 py-1 bg-amber-100 rounded">
                            Ordered: <strong>{item.orderedQty}</strong>
                          </span>
                          <span className="mx-2">→</span>
                          <span className="inline-block px-2 py-1 bg-amber-200 rounded">
                            Minimum: <strong>{item.minimumOrderQty}</strong>
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <span className="text-xs font-semibold text-amber-700">
                          Need {needed} more
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-amber-100 rounded-md p-4 mb-4">
            <p className="text-sm font-medium text-amber-900 mb-2">
              Next Steps:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-amber-800">
              <li>
                <span className="inline-flex items-center gap-1">
                  <ShoppingCart className="h-4 w-4" />
                  Click the cart icon in the header
                </span>
                {' '}to open your minicart and increase the quantity for the products listed above
              </li>
              <li>Your checkout will automatically update once quantities meet the minimum requirements</li>
              <li>
                Or{' '}
                <a 
                  href={formatPhoneHref(phone)} 
                  className="font-medium text-amber-900 hover:text-amber-700 underline"
                >
                  contact us
                </a>
                {' '}if you need assistance with your order
              </li>
            </ol>
          </div>

          <div className="pt-4 border-t border-amber-200">
            <p className="text-xs font-medium text-amber-700 mb-2">
              Need Help? Contact Innovative CropCare, LLC:
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-amber-700">
              <a 
                href={formatPhoneHref(phone)} 
                className="inline-flex items-center gap-1 font-medium text-amber-900 hover:text-amber-700 hover:underline"
              >
                📞 {phone}
              </a>
              <a 
                href={`mailto:${email}?subject=Minimum Order Quantity Inquiry`}
                className="inline-flex items-center gap-1 font-medium text-amber-900 hover:text-amber-700 hover:underline"
              >
                ✉️ {email}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

