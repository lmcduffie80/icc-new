'use client';

import { useEffect, useState, useCallback, useMemo, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { lockScroll, unlockScroll } from '@/lib/scroll-lock';
import { formatPrice } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/image-proxy';

interface SearchResult {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  image: string;
  type: 'product';
}

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  image: string | null;
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Fetch products when overlay opens
  useEffect(() => {
    if (isOpen && products.length === 0) {
      startTransition(() => {
        setIsLoading(true);
      });
      fetch('/api/products')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setProducts(data);
          }
        })
        .catch((err) => console.error('Failed to fetch products:', err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, products.length]);

  useEffect(() => {
    startTransition(() => {
      setMounted(true);
    });
  }, []);

  // Filter products based on search query
  const searchResults: SearchResult[] = useMemo(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    return products
      .filter((product) => {
        return (
          product.name.toLowerCase().includes(lowerQuery) ||
          (product.description?.toLowerCase().includes(lowerQuery) ?? false) ||
          product.category.toLowerCase().includes(lowerQuery)
        );
      })
      .slice(0, 8) // Limit to 8 results
      .map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        description: product.description || '',
        price: product.price,
        image: product.image || '/placeholder.png',
        type: 'product' as const,
      }));
  }, [query, products]);

  // Reset selected index when results change
  useEffect(() => {
    startTransition(() => {
      setSelectedIndex(0);
    });
  }, [searchResults]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      }

      if (e.key === 'Enter' && searchResults[selectedIndex]) {
        e.preventDefault();
        const result = searchResults[selectedIndex];
        router.push(`/shop/${result.id}`);
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, searchResults, selectedIndex, router]);

  // Reset query when closed
  useEffect(() => {
    if (!isOpen) {
      startTransition(() => {
        setQuery('');
      });
    }
  }, [isOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!isOpen) return;

    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [isOpen]);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      router.push(`/shop/${result.id}`);
      onClose();
    },
    [router, onClose]
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="presentation"
      />

      {/* Search Dialog */}
      <div className="relative w-full max-w-2xl mt-[15vh] mx-4 animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="bg-background rounded-lg border border-border shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center border-b border-border px-4">
            <svg
              className="w-5 h-5 text-muted-foreground"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="flex-1 bg-transparent px-4 py-4 text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Search Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Loading products...
                </p>
              </div>
            ) : query.trim() === '' ? (
              <div className="px-4 py-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-muted-foreground/50"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <p className="mt-4 text-sm text-muted-foreground">
                  Start typing to search products
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No results found for &quot;{query}&quot;
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Try searching with different keywords
                </p>
              </div>
            ) : (
              <div className="py-2">
                <div className="px-2 py-2 text-xs font-medium text-muted-foreground">
                  Products
                </div>
                {searchResults.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-accent'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-muted relative">
                      <Image
                        src={getImageProxyUrl(result.image) || result.image || '/placeholder.png'}
                        alt={result.name}
                        fill
                        className="object-cover"
                        unoptimized={result.image?.includes('s3.amazonaws.com') || result.image?.includes('.s3.')}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {result.name}
                        </p>
                        <span className="text-xs text-primary font-medium flex-shrink-0">
                          {formatPrice(result.price)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.category} • {result.description}
                      </p>
                    </div>
                    <svg
                      className="h-4 w-4 text-muted-foreground flex-shrink-0"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m9 18 6-6-6-6"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono">
                  ↑
                </kbd>
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono">
                  ↓
                </kbd>
                <span className="ml-1">to navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono">
                  ↵
                </kbd>
                <span className="ml-1">to select</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono">
                ESC
              </kbd>
              <span className="ml-1">to close</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

