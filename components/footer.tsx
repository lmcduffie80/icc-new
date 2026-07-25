'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTenant } from '@/components/tenant-provider';

export function Footer() {
  const tenant = useTenant();
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch(`/api/categories?tenant_id=${tenant.id}`);
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch {
        // Keep empty categories on error
      }
    }
    fetchCategories();
  }, [tenant.id]);

  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 py-12 md:grid-cols-3">
          {/* Products */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Products</h4>
            <ul className="space-y-2 text-sm">
              {categories.map((category) => (
                <li key={category}>
                  <Link
                    href={`/shop?category=${category.toLowerCase()}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {category}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/shop"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  All Products
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Company</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/about"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Support</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/faq"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  href="/shipping"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Shipping
                </Link>
              </li>
              <li>
                <Link
                  href="/returns"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Returns
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/40 py-6 md:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Innovative CropCare, LLC
          </p>
          <div className="flex items-center space-x-4">
            <Link
              href="/privacy"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
