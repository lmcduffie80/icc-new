import { redirect } from 'next/navigation';
import { getSupplierSession } from '@/lib/supplier-auth';

export default async function SupplierPage() {
  try {
    const session = await getSupplierSession();

    if (session) {
      redirect('/supplier/dashboard');
    } else {
      redirect('/supplier/login');
    }
  } catch (error) {
    // If there's any error (database connection, etc.), redirect to login
    console.error('Error checking supplier session:', error);
    redirect('/supplier/login');
  }
}

