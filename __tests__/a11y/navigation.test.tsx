import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import React from 'react';

// Extend expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock Next.js components and hooks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock auth provider
vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({
    user: null,
    isPending: false,
  }),
}));

// Mock cart store
vi.mock('@/lib/cart-store', () => ({
  useCartStore: () => ({
    getTotalItems: () => 0,
    items: [],
  }),
}));

// Mock search shortcut hook
vi.mock('@/components/use-search-shortcut', () => ({
  useSearchShortcut: () => {},
}));

// Mock auth client
vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn(),
}));

// Mock account navigation
vi.mock('@/lib/account-navigation', () => ({
  accountNavItems: [
    { href: '/account/orders', label: 'Orders', icon: () => null },
    { href: '/account/settings', label: 'Settings', icon: () => null },
  ],
}));

// Mock SearchOverlay component
vi.mock('@/components/search-overlay', () => ({
  SearchOverlay: () => null,
}));

// Mock Minicart component
vi.mock('@/components/minicart', () => ({
  Minicart: () => null,
}));

// Import components after mocks
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { TenantProvider } from '@/components/tenant-provider';
import type { Tenant } from '@/lib/tenant';

const mockTenant: Tenant = {
  id: 'tenant-test',
  slug: 'test',
  name: 'Test Tenant',
  logoUrl: null,
  primaryColor: '#16a34a',
  country: 'US',
  currency: 'USD',
  planId: null,
  billingType: 'manual',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  subscriptionStatus: 'active',
  trialEndsAt: null,
  billingCycle: null,
  isActive: true,
  mfaRequired: false,
  plan: null,
};

// Mock fetch for Footer categories
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ categories: ['Herbicides', 'Fungicides'] }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Navigation Accessibility (WCAG 2.1 AA)', () => {
  describe('Header Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<Header />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have accessible navigation landmarks', () => {
      const { container } = render(<Header />);

      // Check for header element
      const header = container.querySelector('header');
      expect(header).toBeTruthy();

      // Check for nav element
      const nav = container.querySelector('nav');
      expect(nav).toBeTruthy();
    });

    it('should have accessible button labels', () => {
      const { container } = render(<Header />);

      // Check mobile menu button has aria-label
      const mobileMenuButton = container.querySelector('button[aria-label="Open menu"]');
      expect(mobileMenuButton).toBeTruthy();

      // Check search button has aria-label
      const searchButton = container.querySelector('button[aria-label="Search"]');
      expect(searchButton).toBeTruthy();

      // Check cart button has aria-label
      const cartButton = container.querySelector('button[aria-label="Cart"]');
      expect(cartButton).toBeTruthy();
    });

    it('should have accessible logo image with alt text', () => {
      const { container } = render(<Header />);

      const logo = container.querySelector('img[alt="Innovative Crop Care"]');
      expect(logo).toBeTruthy();
    });

    it('should have accessible navigation links', () => {
      const { container } = render(<Header />);

      const navLinks = container.querySelectorAll('nav a');
      navLinks.forEach((link) => {
        // Each link should have text content
        expect(link.textContent).toBeTruthy();
      });
    });
  });

  describe('Footer Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <TenantProvider tenant={mockTenant}>
          <Footer />
        </TenantProvider>
      );

      // Wait for categories to load
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have accessible footer landmark', () => {
      const { container } = render(
        <TenantProvider tenant={mockTenant}>
          <Footer />
        </TenantProvider>
      );

      const footer = container.querySelector('footer');
      expect(footer).toBeTruthy();
    });

    it('should have accessible section headings', async () => {
      const { container } = render(
        <TenantProvider tenant={mockTenant}>
          <Footer />
        </TenantProvider>
      );

      // Wait for categories to load
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const headings = container.querySelectorAll('h4');
      expect(headings.length).toBeGreaterThan(0);

      headings.forEach((heading) => {
        expect(heading.textContent).toBeTruthy();
      });
    });

    it('should have accessible links with clear text', async () => {
      const { container } = render(
        <TenantProvider tenant={mockTenant}>
          <Footer />
        </TenantProvider>
      );

      // Wait for categories to load
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const links = container.querySelectorAll('a');
      links.forEach((link) => {
        // Each link should have text content (not just empty or image-only)
        expect(link.textContent?.trim()).toBeTruthy();
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('header buttons should be focusable', () => {
      const { container } = render(<Header />);

      const buttons = container.querySelectorAll('button');
      buttons.forEach((button) => {
        // Buttons are natively focusable, no tabindex needed
        expect(button.tabIndex).toBeGreaterThanOrEqual(0);
      });
    });

    it('navigation links should be focusable', () => {
      const { container } = render(<Header />);

      const links = container.querySelectorAll('a');
      links.forEach((link) => {
        // Links are natively focusable
        expect(link.tabIndex).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
