'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';
import { signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { LogOut, ChevronRight, Hash } from 'lucide-react';
import { accountNavItems } from '@/lib/account-navigation';
import { CommodityPriceBanner } from '@/components/commodity-price-banner';

export default function AccountPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();
  const [customerNumber, setCustomerNumber] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetch('/api/profile')
        .then((r) => r.json())
        .then((data) => {
          if (data?.profile?.customerNumber) {
            setCustomerNumber(data.profile.customerNumber);
          }
        })
        .catch(() => null);
    }
  }, [user]);

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
              {customerNumber && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  {customerNumber}
                </div>
              )}
            </div>
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
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
      </div>
    </div>
  );
}

