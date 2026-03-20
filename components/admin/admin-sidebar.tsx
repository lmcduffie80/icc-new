'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { Permission } from '@/lib/permissions';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Shield,
  FileText,
  Settings,
  BarChart3,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  MessageSquare,
  Warehouse,
  ShoppingBag,
  Building2,
  Boxes,
  DollarSign,
  FileSignature,
  Layers,
  Sprout,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: Permission;
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

// Dashboard is standalone at the top
const dashboardItem: NavItem = {
  label: 'Dashboard',
  href: '/admin',
  icon: <LayoutDashboard className="h-5 w-5" />,
};

// Grouped navigation items
const navGroups: NavGroup[] = [
  {
    label: 'Catalog',
    icon: <Package className="h-5 w-5" />,
    items: [
      {
        label: 'Products',
        href: '/admin/products',
        icon: <Package className="h-5 w-5" />,
        permission: 'products.view',
      },
      {
        label: 'Label Templates',
        href: '/admin/label-templates',
        icon: <FileText className="h-5 w-5" />,
        permission: 'products.view',
      },
      {
        label: 'Inventory',
        href: '/admin/inventory',
        icon: <Boxes className="h-5 w-5" />,
        permission: 'products.view',
      },
      {
        label: 'Warehouses',
        href: '/admin/warehouses',
        icon: <Warehouse className="h-5 w-5" />,
        permission: 'products.view',
      },
      {
        label: 'Margin Approvals',
        href: '/admin/margin-approvals',
        icon: <DollarSign className="h-5 w-5" />,
        permission: 'products.approve_margin',
      },
    ],
  },
  {
    label: 'Orders & Purchasing',
    icon: <ShoppingCart className="h-5 w-5" />,
    items: [
      {
        label: 'Orders',
        href: '/admin/orders',
        icon: <ShoppingCart className="h-5 w-5" />,
        permission: 'orders.view',
      },
      {
        label: 'Purchase Orders',
        href: '/admin/purchase-orders',
        icon: <ShoppingBag className="h-5 w-5" />,
        permission: 'products.view',
      },
      {
        label: 'Forecasts',
        href: '/admin/forecasts',
        icon: <Sprout className="h-5 w-5" />,
        permission: 'acrepack.view',
      },
    ],
  },
  {
    label: 'Reports',
    icon: <BarChart3 className="h-5 w-5" />,
    items: [
      {
        label: 'Overview',
        href: '/admin/reports/financials',
        icon: <BarChart3 className="h-5 w-5" />,
        permission: 'reports.view_overview',
      },
      {
        label: 'P&L Statement',
        href: '/admin/reports/financials?tab=pl',
        icon: <DollarSign className="h-5 w-5" />,
        permission: 'reports.view_profit_loss',
      },
      {
        label: 'Balance Sheet',
        href: '/admin/reports/financials?tab=balance-sheet',
        icon: <DollarSign className="h-5 w-5" />,
        permission: 'reports.view_balance_sheet',
      },
      {
        label: 'Customers',
        href: '/admin/reports/customers',
        icon: <Users className="h-5 w-5" />,
        permission: 'reports.view_customers',
      },
      {
        label: 'Material Transactions',
        href: '/admin/reports/transactions',
        icon: <ClipboardList className="h-5 w-5" />,
        permission: 'reports.view_transactions',
      },
      {
        label: 'Bill of Materials',
        href: '/admin/reports/bill-of-materials',
        icon: <FileText className="h-5 w-5" />,
        permission: 'reports.view_transactions',
      },
    ],
  },
  {
    label: 'Partners',
    icon: <Building2 className="h-5 w-5" />,
    items: [
      {
        label: 'Suppliers',
        href: '/admin/suppliers',
        icon: <Building2 className="h-5 w-5" />,
        permission: 'admins.view',
      },
      {
        label: 'Vendors',
        href: '/admin/vendors',
        icon: <Building2 className="h-5 w-5" />,
        permission: 'admins.view',
      },
      {
        label: 'Customers',
        href: '/admin/customers',
        icon: <Users className="h-5 w-5" />,
        permission: 'admins.view',
      },
      {
        label: 'Contracts',
        href: '/admin/partners/contracts',
        icon: <FileText className="h-5 w-5" />,
        permission: 'admins.view',
      },
    ],
  },
  {
    label: 'People',
    icon: <Users className="h-5 w-5" />,
    items: [
      {
        label: 'Users',
        href: '/admin/users',
        icon: <Users className="h-5 w-5" />,
        permission: 'users.view',
      },
      {
        label: 'Admins',
        href: '/admin/admins',
        icon: <Shield className="h-5 w-5" />,
        permission: 'admins.view',
      },
    ],
  },
  {
    label: 'Communication',
    icon: <MessageSquare className="h-5 w-5" />,
    items: [
      {
        label: 'Contact Submissions',
        href: '/admin/contact-submissions',
        icon: <MessageSquare className="h-5 w-5" />,
        permission: 'contact.view',
      },
    ],
  },
  {
    label: 'System',
    icon: <Settings className="h-5 w-5" />,
    items: [
      {
        label: 'Content',
        href: '/admin/content',
        icon: <FileText className="h-5 w-5" />,
        permission: 'content.view',
      },
      {
        label: 'Settings',
        href: '/admin/settings',
        icon: <Settings className="h-5 w-5" />,
        permission: 'settings.view',
      },
      {
        label: 'Terms & Conditions',
        href: '/admin/settings/terms-and-conditions',
        icon: <FileText className="h-5 w-5" />,
        permission: 'settings.manage',
      },
      {
        label: 'Supply Agreement',
        href: '/admin/system/supply-agreement',
        icon: <FileSignature className="h-5 w-5" />,
        permission: 'contracts.view',
      },
      {
        label: 'Bill-to Address',
        href: '/admin/system/bill-to-address',
        icon: <Building2 className="h-5 w-5" />,
        permission: 'settings.update_store_info',
      },
      {
        label: 'Crop Planning Programs',
        href: '/admin/system/acre-pack',
        icon: <Layers className="h-5 w-5" />,
        permission: 'acrepack.view',
      },
      {
        label: 'Analytics',
        href: '/admin/analytics',
        icon: <BarChart3 className="h-5 w-5" />,
        permission: 'analytics.view_sales',
      },
      {
        label: 'Audit Log',
        href: '/admin/audit-log',
        icon: <ClipboardList className="h-5 w-5" />,
        permission: 'admins.view',
      },
    ],
  },
];

interface AdminSidebarProps {
  permissions: Permission[];
  user: {
    name: string;
    email: string;
    image: string | null;
  };
  roleName: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({ permissions, user, roleName, mobileOpen, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [contactUnreadCount, setContactUnreadCount] = useState(0);
  const [marginPendingCount, setMarginPendingCount] = useState(0);
  const [userOpenGroups, setUserOpenGroups] = useState<Set<string>>(new Set());

  const openGroups = userOpenGroups;

  const toggleGroup = (label: string) => {
    setUserOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Filter groups to only include items the user has permission for
  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.permission || permissions.includes(item.permission)),
  })).filter(group => group.items.length > 0);

  // Get all nav item hrefs for comparison
  const allNavHrefs = filteredGroups.flatMap(group => group.items.map(item => item.href));

  // Check if an item is active
  const isItemActive = (href: string): boolean => {
    // Parse the href to separate pathname and query params
    const [hrefPath, hrefQuery] = href.split('?');
    
    // Special case for dashboard
    if (href === '/admin') {
      return pathname === '/admin';
    }
    
    // Check pathname match
    const pathMatches = pathname === hrefPath;
    
    if (!pathMatches) {
      // Check if it's a parent path match
      if (pathname.startsWith(hrefPath + '/')) {
        const hasMoreSpecificMatch = allNavHrefs.some(
          otherHref => otherHref !== href &&
                       otherHref.startsWith(hrefPath + '/') &&
                       (pathname === otherHref.split('?')[0] || 
                        pathname.startsWith(otherHref.split('?')[0] + '/'))
        );
        return !hasMoreSpecificMatch;
      }
      return false;
    }
    
    // If pathname matches and href has query params, check those too
    if (hrefQuery) {
      const hrefParams = new URLSearchParams(hrefQuery);
      const currentTab = searchParams.get('tab');
      const expectedTab = hrefParams.get('tab');
      
      // If href specifies a tab, current tab must match
      if (expectedTab) {
        return currentTab === expectedTab;
      }
    }
    
    // Pathname matches and no specific query requirements in href
    // But check if current URL has a tab - if so, don't highlight links without tabs
    const currentTab = searchParams.get('tab');
    if (currentTab && !hrefQuery) {
      // Current URL has a tab, but this link doesn't specify one
      return false;
    }
    
    return true;
  };

  // Check if a group has an active item
  const isGroupActive = (group: NavGroup): boolean => {
    return group.items.some(item => isItemActive(item.href));
  };

  // Fetch unread contact submission count
  useEffect(() => {
    if (permissions.includes('contact.view')) {
      const fetchUnreadCount = async () => {
        try {
          const response = await fetch('/api/admin/contact-submissions/unread-count');
          if (response.ok) {
            const data = await response.json();
            setContactUnreadCount(data.unreadCount);
          }
        } catch (error) {
          console.error('Error fetching unread count:', error);
        }
      };

      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [permissions]);

  // Fetch pending margin approvals count
  useEffect(() => {
    if (permissions.includes('products.approve_margin')) {
      const fetchPendingCount = async () => {
        try {
          const response = await fetch('/api/admin/products/margin-approvals/pending-count');
          if (response.ok) {
            const data = await response.json();
            setMarginPendingCount(data.pendingCount);
          }
        } catch (error) {
          console.error('Error fetching margin pending count:', error);
        }
      };

      fetchPendingCount();
      const interval = setInterval(fetchPendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [permissions]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (mobileOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Add swipe-to-close gesture support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    let touchStart = 0;
    let touchEnd = 0;
    
    const handleTouchStart = (e: TouchEvent) => {
      touchStart = e.touches[0].clientX;
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      touchEnd = e.touches[0].clientX;
    };
    
    const handleTouchEnd = () => {
      if (touchStart - touchEnd > 75) {
        // Swiped left - close sidebar on mobile
        if (window.innerWidth < 768 && mobileOpen) {
          onMobileClose();
        }
      }
    };
    
    if (mobileOpen && window.innerWidth < 768) {
      document.addEventListener('touchstart', handleTouchStart);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [mobileOpen, onMobileClose]);

  const handleSignOut = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  // Get badge count for a specific item
  const getBadgeCount = (href: string): number => {
    if (href === '/admin/contact-submissions') return contactUnreadCount;
    if (href === '/admin/margin-approvals') return marginPendingCount;
    return 0;
  };

  // Get total badge count for a group
  const getGroupBadgeCount = (group: NavGroup): number => {
    return group.items.reduce((sum, item) => sum + getBadgeCount(item.href), 0);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      
      <aside
        className={`fixed left-0 top-0 z-40 h-screen bg-slate-900 text-white transition-all duration-300 ${
          collapsed ? 'md:w-16' : 'md:w-64'
        } ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64 md:translate-x-0`}
      >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-700 px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-bold">
                A
              </div>
              <span className="font-semibold">Admin Panel</span>
            </div>
          )}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                onMobileClose();  // Close on mobile
              } else {
                setCollapsed(!collapsed);  // Collapse on desktop
              }
            }}
            className="rounded-lg p-1.5 hover:bg-slate-800 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {/* Dashboard - always at top */}
            <li>
              <Link
                href={dashboardItem.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  pathname === '/admin'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={collapsed ? dashboardItem.label : undefined}
              >
                {dashboardItem.icon}
                {!collapsed && <span>{dashboardItem.label}</span>}
              </Link>
            </li>

            {/* Grouped navigation */}
            {filteredGroups.map((group) => {
              const isOpen = openGroups.has(group.label);
              const groupActive = isGroupActive(group);
              const groupBadgeCount = getGroupBadgeCount(group);

              return (
                <li key={group.label} className="mt-2">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:cursor-pointer ${
                      groupActive && !isOpen
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                    title={collapsed ? group.label : undefined}
                  >
                    <span className="relative">
                      {group.icon}
                      {collapsed && groupBadgeCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {groupBadgeCount > 9 ? '9+' : groupBadgeCount}
                        </span>
                      )}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left font-medium">{group.label}</span>
                        {groupBadgeCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white mr-1">
                            {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
                          </span>
                        )}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                        />
                      </>
                    )}
                  </button>

                  {/* Group items */}
                  {!collapsed && isOpen && (
                    <ul className="mt-1 space-y-1">
                      {group.items.map((item) => {
                        const isActive = isItemActive(item.href);
                        const badgeCount = getBadgeCount(item.href);

                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`flex items-center gap-3 rounded-lg py-2 pl-11 pr-3 transition-colors ${
                                isActive
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              <span className="flex-1 flex items-center justify-between">
                                {item.label}
                                {badgeCount > 0 && (
                                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                                    {badgeCount > 99 ? '99+' : badgeCount}
                                  </span>
                                )}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User info */}
        <div className="border-t border-slate-700 p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-medium overflow-hidden">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  fill
                  sizes="36px"
                  className="rounded-full object-cover"
                />
              ) : (
                user.name?.charAt(0).toUpperCase() || 'A'
              )}
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-slate-400">{roleName}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className={`mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${
              collapsed ? 'justify-center' : ''
            }`}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
