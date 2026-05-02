'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserCheck, LogOut, Loader2 } from 'lucide-react';

interface ImpersonationBannerProps {
  adminName: string;
  targetUserName: string;
}

export function ImpersonationBanner({ adminName, targetUserName }: ImpersonationBannerProps) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);

  const handleEndSession = async () => {
    setEnding(true);
    try {
      await fetch('/api/admin/impersonate/end', { method: 'POST' });
      // The API redirects to /admin/users; follow that redirect
      router.push('/admin/users');
    } catch {
      setEnding(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-orange-500 px-4 py-2.5 text-white shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserCheck className="h-4 w-4 shrink-0" />
        <span>
          <strong>Impersonation</strong> — viewing{' '}
          <span className="underline underline-offset-2">{targetUserName}</span> as{' '}
          <span className="underline underline-offset-2">{adminName}</span>. Actions are
          attributed to your admin user.
        </span>
      </div>
      <button
        onClick={handleEndSession}
        disabled={ending}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 disabled:opacity-60 hover:cursor-pointer"
      >
        {ending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogOut className="h-3.5 w-3.5" />
        )}
        End Session
      </button>
    </div>
  );
}
