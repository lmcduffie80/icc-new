'use client';

import { Menu } from 'lucide-react';

interface AdminMobileHeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

export function AdminMobileHeader({ onMenuClick, pageTitle }: AdminMobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 md:hidden bg-white border-b border-slate-200">
      <div className="flex items-center justify-between h-14 px-4">
        <button 
          onClick={onMenuClick} 
          aria-label="Open menu"
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Menu className="h-6 w-6 text-slate-700" />
        </button>
        {pageTitle && (
          <h1 className="text-lg font-semibold text-slate-900 truncate flex-1 text-center px-4">
            {pageTitle}
          </h1>
        )}
        <div className="w-6" /> {/* Spacer for centering */}
      </div>
    </header>
  );
}
