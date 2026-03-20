'use client';

import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';

type User = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isPending: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = useSession();

  // Wrapper to refetch session data
  const handleRefetch = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <AuthContext.Provider
      value={{
        user: data?.user ?? null,
        session: data?.session ?? null,
        isPending,
        error: error ?? null,
        refetch: handleRefetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

