'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCartStore } from '@/lib/cart-store';
import { lockScroll, unlockScroll } from '@/lib/scroll-lock';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/ui/quantity-selector';
import { PriceWithUnit } from '@/components/ui/price-with-unit';
import { formatPrice } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';

interface MinicartProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Minicart({ isOpen, onClose }: MinicartProps) {
  const { items, removeItem, updateQuantity, getTotalItems, getSubtotal } = useCartStore();
  
  // Close on escape key and lock scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    lockScroll();

    return () => {
      document.removeEventListener('keydown', handleEscape);
      unlockScroll();
    };
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="presentation"
      />
      
      {/* Minicart Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Shopping Cart {items.length > 0 && `(${getTotalItems()})`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="Close cart"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Cart Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <svg
                className="h-24 w-24 text-muted-foreground/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Your cart is empty</h3>
                <p className="text-sm text-muted-foreground">
                  Start adding products to your cart
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button asChild variant="default" onClick={onClose}>
                  <Link href="/shop">Browse Products</Link>
                </Button>
                <Button asChild variant="outline" onClick={onClose}>
                  <Link href="/shop">
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    Search Products
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            // Cart Items
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
                >
                  {/* Product Image */}
                  <Link
                    href={`/shop/${item.id}`}
                    onClick={onClose}
                    className="flex-shrink-0"
                  >
                    <Image
                      src={getImageProxyUrl(item.image) || item.image || '/placeholder.png'}
                      alt={item.name}
                      width={80}
                      height={80}
                      className="rounded-md object-cover"
                      unoptimized={item.image?.includes('s3.amazonaws.com') || item.image?.includes('.s3.')}
                    />
                  </Link>
                  
                  {/* Product Info */}
                  <div className="flex flex-1 flex-col">
                    <Link
                      href={`/shop/${item.id}`}
                      onClick={onClose}
                      className="font-medium hover:text-primary transition-colors line-clamp-2"
                    >
                      {item.name}
                    </Link>
                    
                    <div className="mt-1 text-sm font-semibold text-primary">
                      <PriceWithUnit price={item.price} unitOfMeasure={item.unitOfMeasure} containerSize={item.attributes?.containerSizes} showCostPerGallon={true} />
                    </div>
                    
                    {!item.inStock && (
                      <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                        Out of Stock
                      </div>
                    )}
                    
                    {/* Quantity Controls */}
                    <div className="mt-2 flex items-center gap-2">
                      <QuantitySelector
                        quantity={item.quantity}
                        onQuantityChange={(qty) => updateQuantity(item.id, qty)}
                        size="compact"
                        showLabel={false}
                      />
                      
                      {/* Remove Button */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="ml-auto text-sm text-muted-foreground hover:text-red-600 transition-colors"
                        aria-label="Remove item"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer / Summary */}
        {items.length > 0 && (
          <div className="border-t border-border/40 px-6 py-4 space-y-4">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Subtotal:</span>
              <span>{formatPrice(getSubtotal())}</span>
            </div>
            
            {/* Actions */}
            <div className="space-y-2">
              <Button size="lg" className="w-full" asChild>
                <Link href="/checkout" onClick={onClose}>
                  Proceed to Checkout
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full" asChild>
                <Link href="/shop" onClick={onClose}>
                  Continue Shopping
                </Link>
              </Button>
            </div>
            
            <p className="text-xs text-center text-muted-foreground">
              Shipping and taxes calculated at checkout
            </p>
          </div>
        )}
      </div>
    </>
  );
}

