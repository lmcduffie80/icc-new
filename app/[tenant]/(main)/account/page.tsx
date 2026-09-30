'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';
import { signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { LogOut, ChevronRight, Tag } from 'lucide-react';
import { accountNavItems } from '@/lib/account-navigation';
import { CommodityPriceBanner } from '@/components/commodity-price-banner';
import { useDistributorStatus } from '@/lib/use-distributor-status';

export default function AccountPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();
  const { isDistributor } = useDistributorStatus();

  useEffect(() => {
    if (!isPending && !user) {
      router.push('/auth/sign-in');
    }
  }, [user, isPending, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  if (isPending) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }


  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">My Account</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account settings and view your orders
          </p>
        </div>

        {/* Distributor Portal — shown only to approved distributor accounts, pinned to top */}
        {isDistributor && (
          <Link
            href="/distributor"
            className="group bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-xl p-6 hover:border-sky-400 hover:shadow-md transition-all mb-6 block"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-sky-100 text-sky-700 group-hover:bg-sky-700 group-hover:text-white transition-colors">
                <Tag className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-sky-800 group-hover:text-sky-900 transition-colors">
                    Distributor Store
                  </h3>
                  <ChevronRight className="h-4 w-4 text-sky-400 group-hover:text-sky-700 group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-sm text-sky-600 mt-1">
                  View exclusive distributor pricing — see your discounted prices vs. retail side by side
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* Commodity Prices */}
        <CommodityPriceBanner />

        {/* User Card */}
        <div className="bg-card border border-border rounded-xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  fill
                  sizes="64px"
                  className="rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-primary">
                  {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{user.name}</h2>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Menu Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {accountNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group bg-card border border-border rounded-xl p-6 hover:border-primary/50 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium group-hover:text-primary transition-colors">
                      {item.label}
                    </h3>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Sign Out — at the bottom */}
        <div className="mt-6 flex justify-center">
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

