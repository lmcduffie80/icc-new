import { query } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { UsersTable } from './users-table';

interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  email_verified: boolean;
  created_at: string;
  orders_count: number;
  total_spent: string;
}

async function getUsers(): Promise<User[]> {
  return query<User>(
    `SELECT 
      u.id,
      u.email,
      u.name,
      u.image,
      u."emailVerified" as email_verified,
      u."createdAt" as created_at,
      COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END)::int as orders_count,
      COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) as total_spent
    FROM "user" u
    LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'cancelled'
    GROUP BY u.id, u.email, u.name, u.image, u."emailVerified", u."createdAt"
    ORDER BY u."createdAt" DESC`
  );
}

export default async function UsersPage() {
  const session = await getAdminSession();
  
  if (!session?.permissions.includes('users.view')) {
    redirect('/admin');
  }

  const users = await getUsers();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <p className="mt-1 text-slate-500">Manage customer accounts</p>
      </div>

      <UsersTable users={users} permissions={session.permissions} />
    </div>
  );
}

