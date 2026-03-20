'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Search, ShoppingCart, X, User, LogOut } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { useSearchShortcut } from '@/components/use-search-shortcut';
import { SearchOverlay } from '@/components/search-overlay';
import { Minicart } from '@/components/minicart';
import { useAuth } from '@/components/auth-provider';
import { signOut } from '@/lib/auth-client';
import { accountNavItems } from '@/lib/account-navigation';

const navLinks = [
  { href: '/about', label: 'About' },
  { href: '/shop', label: 'Shop' },
  { href: '/crop', label: 'Crop Planning' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const { getTotalItems } = useCartStore();
  const totalItems = getTotalItems();

  useEffect(() => {
    setMounted(true);
  }, []);

  useSearchShortcut(() => setSearchOpen(true));

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2" aria-label="Innovative Crop Care home">
              <Image
                src="/logo.png"
                alt="Innovative Crop Care"
                width={773}
                height={332}
                quality={100}
                className="h-10 w-auto"
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden items-center gap-6 md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:cursor-pointer hover:text-foreground"
              >
                <Search className="h-5 w-5" />
              </button>

              <button
                aria-label="Cart"
                onClick={() => setCartOpen(true)}
                className="relative rounded-md p-2 text-muted-foreground transition-colors hover:cursor-pointer hover:text-foreground"
              >
                <ShoppingCart className="h-5 w-5" />
                {mounted && totalItems > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                    {totalItems}
                  </span>
                )}
              </button>

              {user ? (
                <div className="relative hidden md:block">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md p-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      <User className="h-5 w-5" />
                    </summary>
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-background shadow-lg">
                      <div className="p-2">
                        <p className="truncate px-2 py-1 text-xs text-muted-foreground">
                          {user.email}
                        </p>
                        <div className="my-1 border-t border-border" />
                        {accountNavItems.slice(0, 4).map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        ))}
                        <div className="my-1 border-t border-border" />
                        <button
                          onClick={() => signOut()}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:cursor-pointer hover:bg-muted hover:text-foreground"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              ) : (
                <Link
                  href="/auth/sign-in"
                  className="hidden rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted md:block"
                >
                  Sign in
                </Link>
              )}

              <button
                aria-label="Open menu"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:cursor-pointer hover:text-foreground md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>
              <Image
                src="/logo.png"
                alt="Innovative Crop Care"
                width={773}
                height={332}
                quality={100}
                className="h-10 w-auto"
              />
            </Link>
            <button
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md p-2 text-muted-foreground hover:cursor-pointer hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="my-2 border-t border-border" />
            {user ? (
              <button
                onClick={() => signOut()}
                className="rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:cursor-pointer hover:bg-muted hover:text-foreground"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/auth/sign-in"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}

      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <Minicart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
