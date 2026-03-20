import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';

interface DbAddress {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateAddressRequest {
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  isPrimary?: boolean;
}

// GET: Fetch all addresses for authenticated user
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const addresses = await query<DbAddress>(
      `SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC`,
      [session.user.id]
    );

    return NextResponse.json({
      addresses: addresses.map((addr) => ({
        id: addr.id,
        label: addr.label,
        fullName: addr.full_name,
        street: addr.street,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zip_code,
        country: addr.country,
        isPrimary: addr.is_primary,
      })),
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return NextResponse.json({ error: 'Failed to fetch addresses' }, { status: 500 });
  }
}

// POST: Create a new address
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateAddressRequest = await request.json();
    const { label, fullName, street, city, state, zipCode, country = 'United States', isPrimary } = body;

    // Validate required fields
    if (!label || !fullName || !street || !city || !state || !zipCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if this is the first address (make it primary by default)
    const existingAddresses = await query<DbAddress>(
      `SELECT id FROM user_addresses WHERE user_id = $1`,
      [session.user.id]
    );
    const shouldBePrimary = isPrimary || existingAddresses.length === 0;

    const address = await queryOne<DbAddress>(
      `INSERT INTO user_addresses (user_id, label, full_name, street, city, state, zip_code, country, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [session.user.id, label, fullName, street, city, state, zipCode, country, shouldBePrimary]
    );

    if (!address) {
      throw new Error('Failed to create address');
    }

    return NextResponse.json({
      address: {
        id: address.id,
        label: address.label,
        fullName: address.full_name,
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zip_code,
        country: address.country,
        isPrimary: address.is_primary,
      },
    });
  } catch (error) {
    console.error('Error creating address:', error);
    return NextResponse.json({ error: 'Failed to create address' }, { status: 500 });
  }
}

