'use client';

import { useCompareStore } from '@/lib/compare-store';
import { useRouter } from 'next/navigation';
import { useEffect, useState, startTransition } from 'react';

export function CompareBadge() {
  const router = useRouter();
  const count = useCompareStore((state) => state.getCount());
  const [isScaling, setIsScaling] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle hydration mismatch
  useEffect(() => {
    startTransition(() => {
      setMounted(true);
    });
  }, []);

  // Trigger scale animation when count changes
  useEffect(() => {
    if (count > 0) {
      startTransition(() => {
        setIsScaling(true);
      });
      const timer = setTimeout(() => setIsScaling(false), 300);
      return () => clearTimeout(timer);
    }
  }, [count]);

  // Don't render on server or when count is 0
  if (!mounted || count === 0) {
    return null;
  }

  return (
    <button
      onClick={() => router.push('/compare')}
      className={`
        fixed bottom-6 right-6 z-50
        flex items-center gap-3
        bg-primary text-primary-foreground
        px-5 py-3 rounded-full
        shadow-lg hover:shadow-xl
        transition-all duration-200
        hover:scale-105
        ${isScaling ? 'scale-110' : 'scale-100'}
      `}
      aria-label={`View ${count} product comparisons`}
    >
      <svg 
        className="h-5 w-5" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
        />
      </svg>
      <span className="font-semibold">Compare ({count})</span>
    </button>
  );
}

