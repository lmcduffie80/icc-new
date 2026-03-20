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

interface UpdateAddressRequest {
  label?: string;
  fullName?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isPrimary?: boolean;
}

// GET: Fetch a specific address
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const address = await queryOne<DbAddress>(
      `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!address) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
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
    console.error('Error fetching address:', error);
    return NextResponse.json({ error: 'Failed to fetch address' }, { status: 500 });
  }
}

// PATCH: Update a specific address
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the address belongs to the user
    const existingAddress = await queryOne<DbAddress>(
      `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!existingAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    const body: UpdateAddressRequest = await request.json();
    const { label, fullName, street, city, state, zipCode, country, isPrimary } = body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      values.push(label);
    }
    if (fullName !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(fullName);
    }
    if (street !== undefined) {
      updates.push(`street = $${paramIndex++}`);
      values.push(street);
    }
    if (city !== undefined) {
      updates.push(`city = $${paramIndex++}`);
      values.push(city);
    }
    if (state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(state);
    }
    if (zipCode !== undefined) {
      updates.push(`zip_code = $${paramIndex++}`);
      values.push(zipCode);
    }
    if (country !== undefined) {
      updates.push(`country = $${paramIndex++}`);
      values.push(country);
    }
    if (isPrimary !== undefined) {
      updates.push(`is_primary = $${paramIndex++}`);
      values.push(isPrimary);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);
    values.push(session.user.id);

    const address = await queryOne<DbAddress>(
      `UPDATE user_addresses 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!address) {
      throw new Error('Failed to update address');
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
    console.error('Error updating address:', error);
    return NextResponse.json({ error: 'Failed to update address' }, { status: 500 });
  }
}

// DELETE: Delete a specific address
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the address belongs to the user
    const existingAddress = await queryOne<DbAddress>(
      `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!existingAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    }

    // Delete the address
    await query(
      `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    // If the deleted address was primary, make the most recent address primary
    if (existingAddress.is_primary) {
      const nextAddress = await queryOne<DbAddress>(
        `SELECT id FROM user_addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [session.user.id]
      );

      if (nextAddress) {
        await query(
          `UPDATE user_addresses SET is_primary = true, updated_at = NOW() WHERE id = $1`,
          [nextAddress.id]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting address:', error);
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 500 });
  }
}

