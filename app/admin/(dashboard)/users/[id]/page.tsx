import { getAdminSession } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, User as UserIcon, Mail, Calendar, ShoppingBag, Wheat, MapPin, Sprout, LandPlot } from 'lucide-react';
import { UserActions } from './user-actions';

interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  phone: string | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: string;
  created_at: string;
}

interface FarmProfile {
  id: string;
  user_id: string;
  farm_name: string;
  zip_code: string;
  crop_types: string;
  farm_acres: string;
  created_at: string;
}

async function getUser(id: string) {
  const user = await queryOne<User>('SELECT * FROM "user" WHERE id = $1', [id]);
  if (!user) return null;

  const profile = await queryOne<UserProfile>(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [id]
  );

  const farmProfile = await queryOne<FarmProfile>(
    'SELECT * FROM farm_profiles WHERE user_id = $1',
    [id]
  );

  const orderStats = await queryOne<{ count: string; total: string }>(
    `SELECT COUNT(*)::int as count, COALESCE(SUM(total), 0) as total
     FROM orders WHERE user_id = $1 AND status != 'cancelled'`,
    [id]
  );

  return {
    ...user,
    profile,
    farmProfile,
    orders_count: parseInt(orderStats?.count || '0', 10),
    total_spent: orderStats?.total || '0',
  };
}

async function getUserOrders(userId: string): Promise<Order[]> {
  return query<Order>(
    `SELECT id, order_number, status, total, created_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('users.view')) {
    redirect('/admin');
  }

  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  const canViewOrders = session.permissions.includes('users.view_orders');
  const orders = canViewOrders ? await getUserOrders(id) : [];

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/users"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-full bg-slate-100">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <UserIcon className="h-8 w-8 text-slate-400" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {user.name || 'Unknown User'}
              </h1>
              <p className="mt-1 text-slate-500">{user.email}</p>
            </div>
          </div>
          <UserActions user={user} permissions={session.permissions} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* User Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg mb-4 font-semibold text-slate-900">User Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium text-slate-900">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Joined</p>
                  <p className="font-medium text-slate-900">
                    {new Date(user.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Total Orders</p>
                  <p className="font-medium text-slate-900">{user.orders_count}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center text-slate-400">
                  $
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Spent</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(user.total_spent)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Farm Information */}
          {user.farmProfile && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <Wheat className="h-5 w-5 text-amber-600" />
                <h2 className="text-lg font-semibold text-slate-900">Farm Information</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Wheat className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Farm Name</p>
                    <p className="font-medium text-slate-900">{user.farmProfile.farm_name}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">ZIP Code</p>
                    <p className="font-medium text-slate-900">{user.farmProfile.zip_code}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <LandPlot className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-500">Farm Size</p>
                    <p className="font-medium text-slate-900">{user.farmProfile.farm_acres} acres</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <Sprout className="h-5 w-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-500">Type of Crops</p>
                  <p className="font-medium text-slate-900 whitespace-pre-wrap">{user.farmProfile.crop_types}</p>
                </div>
              </div>
            </div>
          )}

          {/* Recent Orders */}
          {canViewOrders && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
              </div>
              {orders.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No orders yet
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center justify-between p-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          #{order.order_number}
                        </p>
                        <p className="text-sm text-slate-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-slate-900">
                          {formatCurrency(order.total)}
                        </p>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColors[order.status] || 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 font-semibold text-slate-900">Account Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Email Verified</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    user.email_verified
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {user.email_verified ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Account Status</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

