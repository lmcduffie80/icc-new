import { Package, User, MessageSquare, CreditCard, Settings, FileText, Wheat, Sprout, Landmark, type LucideIcon } from 'lucide-react';

export interface AccountNavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

/**
 * Shared navigation items for customer account pages.
 * Used by both the account dashboard and header dropdown to ensure consistency.
 */
export const accountNavItems: AccountNavItem[] = [
  {
    href: '/account/orders',
    icon: Package,
    label: 'My Orders',
    description: 'View your order history and track shipments',
  },
  {
    href: '/account/profile',
    icon: User,
    label: 'Profile',
    description: 'Update your personal information',
  },
  {
    href: '/account/farm',
    icon: Wheat,
    label: 'My Farm',
    description: 'Manage your farm information',
  },
  {
    href: '/crop',
    icon: Sprout,
    label: 'Crop Planning',
    description: 'View and manage your crop plans',
  },
  {
    href: '/account/invoices',
    icon: FileText,
    label: 'Invoices',
    description: 'Manage your farm invoices for checkout',
  },
  {
    href: '/account/contact-submissions',
    icon: MessageSquare,
    label: 'Contact Submissions',
    description: 'View and manage your contact form submissions',
  },
  {
    href: '/account/payment',
    icon: CreditCard,
    label: 'Payment Methods',
    description: 'Manage your payment options',
  },
  {
    href: '/account/payments-setup',
    icon: Landmark,
    label: 'Payment Setup',
    description: 'Manage how your store gets paid.',
  },
  {
    href: '/account/settings',
    icon: Settings,
    label: 'Settings',
    description: 'Account preferences and security',
  },
];
