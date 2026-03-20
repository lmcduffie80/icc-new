'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  LogOut,
  CheckCircle,
  DollarSign,
  FileText,
} from 'lucide-react';
import { useEffect } from 'react';

interface SupplierSidebarProps {
  user: {
    id: string;
    email: string;
    name: string;
    company_name: string;
  };
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function SupplierSidebar({ user, mobileOpen, onMobileClose }: SupplierSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    try {
      await fetch('/api/supplier/auth/logout', {
        method: 'POST',
      });
      router.push('/supplier/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  const navItems = [
    { href: '/supplier/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/supplier/products', label: 'Products', icon: Package },
    { href: '/supplier/warehouses', label: 'Warehouses', icon: Warehouse },
    { href: '/supplier/orders', label: 'Orders', icon: ShoppingCart },
    { href: '/supplier/approvals', label: 'Approvals', icon: CheckCircle },
    { href: '/supplier/contracts', label: 'Contracts', icon: FileText },
    { href: '/supplier/reports', label: 'Reports', icon: DollarSign },
  ];

  const isActive = (href: string) => pathname === href;

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

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-full w-64 bg-slate-900 text-white transition-transform md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo/Header */}
          <div className="border-b border-slate-800 p-6">
            <h1 className="text-xl font-bold text-white">Supplier Portal</h1>
            <p className="mt-1 text-sm text-slate-400">{user.company_name}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onMobileClose()}
                  className={`flex items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-green-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User info and logout */}
          <div className="border-t border-slate-800 p-4">
            <div className="mb-4">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 md:hidden cursor-default"
          onClick={onMobileClose}
          aria-label="Close menu"
        />
      )}
    </>
  );
}

