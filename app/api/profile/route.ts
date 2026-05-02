import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';

interface DbUserProfile {
  id: string;
  user_id: string;
  phone: string | null;
  customer_number: string | null;
  created_at: string;
  updated_at: string;
}

interface DbUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

// GET: Fetch profile for authenticated user
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create user profile
    let profile = await queryOne<DbUserProfile>(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [session.user.id]
    );

    if (!profile) {
      // Create profile if it doesn't exist
      profile = await queryOne<DbUserProfile>(
        `INSERT INTO user_profiles (user_id) VALUES ($1) RETURNING *`,
        [session.user.id]
      );
    }

    // Get user info from Better Auth's user table
    const user = await queryOne<DbUser>(
      `SELECT id, name, email, image FROM "user" WHERE id = $1`,
      [session.user.id]
    );

    return NextResponse.json({
      profile: {
        id: profile?.id,
        userId: profile?.user_id,
        phone: profile?.phone || null,
        customerNumber: profile?.customer_number || null,
        name: user?.name || null,
        email: user?.email,
        image: user?.image || null,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PATCH: Update profile for authenticated user
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone } = body;

    // Update name in Better Auth's user table if provided
    if (name !== undefined) {
      await query(
        `UPDATE "user" SET name = $1, "updatedAt" = NOW() WHERE id = $2`,
        [name, session.user.id]
      );
    }

    // Update or create profile with phone
    if (phone !== undefined) {
      const existingProfile = await queryOne<DbUserProfile>(
        `SELECT * FROM user_profiles WHERE user_id = $1`,
        [session.user.id]
      );

      if (existingProfile) {
        await query(
          `UPDATE user_profiles SET phone = $1, updated_at = NOW() WHERE user_id = $2`,
          [phone, session.user.id]
        );
      } else {
        await query(
          `INSERT INTO user_profiles (user_id, phone) VALUES ($1, $2)`,
          [session.user.id, phone]
        );
      }
    }

    // Fetch updated data
    const profile = await queryOne<DbUserProfile>(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [session.user.id]
    );

    const user = await queryOne<DbUser>(
      `SELECT id, name, email, image FROM "user" WHERE id = $1`,
      [session.user.id]
    );

    return NextResponse.json({
      profile: {
        id: profile?.id,
        userId: profile?.user_id,
        phone: profile?.phone || null,
        name: user?.name || null,
        email: user?.email,
        image: user?.image || null,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

