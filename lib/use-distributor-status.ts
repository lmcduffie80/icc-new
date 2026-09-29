import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

interface DistributorStatus {
  isDistributor: boolean;
  loading: boolean;
}

/**
 * Lightweight hook that checks whether the current user has distributor access.
 * Fetches once per mount when a session is present; returns false for guests.
 */
export function useDistributorStatus(): DistributorStatus {
  const { user, isPending: authPending } = useAuth();
  const [isDistributor, setIsDistributor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authPending) return;

    if (!user) {
      setIsDistributor(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch('/api/distributor/status')
      .then((r) => r.json())
      .then((data: { isDistributor?: boolean }) => {
        if (!cancelled) setIsDistributor(data.isDistributor ?? false);
      })
      .catch(() => {
        if (!cancelled) setIsDistributor(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, authPending]);

  return { isDistributor, loading };
}
