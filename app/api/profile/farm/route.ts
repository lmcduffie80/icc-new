import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { queryOne } from '@/lib/db';
import { farmProfileSchema } from '@/lib/validation';
import { checkRateLimit, rateLimiters, createRateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';

interface DbFarmProfile {
  id: string;
  user_id: string;
  farm_name: string;
  zip_code: string;
  crop_types: string;
  farm_acres: string;
  created_at: string;
  updated_at: string;
}

// GET: Fetch farm profile for authenticated user
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(request, rateLimiters.relaxed);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/profile/farm', 'GET');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const farmProfile = await queryOne<DbFarmProfile>(
      `SELECT * FROM farm_profiles WHERE user_id = $1`,
      [session.user.id]
    );

    if (!farmProfile) {
      return NextResponse.json({ farmProfile: null });
    }

    return NextResponse.json({
      farmProfile: {
        id: farmProfile.id,
        userId: farmProfile.user_id,
        farmName: farmProfile.farm_name,
        zipCode: farmProfile.zip_code,
        cropTypes: farmProfile.crop_types,
        farmAcres: farmProfile.farm_acres,
        createdAt: farmProfile.created_at,
        updatedAt: farmProfile.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching farm profile:', error);
    securityLogger.logError('Error fetching farm profile', error, ip);
    return NextResponse.json({ error: 'Failed to fetch farm profile' }, { status: 500 });
  }
}

// PUT: Create or update farm profile for authenticated user
export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/profile/farm', 'PUT');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const result = farmProfileSchema.safeParse(body);
    if (!result.success) {
      securityLogger.logValidationFailure('/api/profile/farm', ip, result.error.issues, 'PUT');
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const { farmName, zipCode, cropTypes, farmAcres } = result.data;

    // Check if profile exists
    const existingProfile = await queryOne<DbFarmProfile>(
      `SELECT id FROM farm_profiles WHERE user_id = $1`,
      [session.user.id]
    );

    let farmProfile: DbFarmProfile | null;

    if (existingProfile) {
      // Update existing profile
      farmProfile = await queryOne<DbFarmProfile>(
        `UPDATE farm_profiles
         SET farm_name = $1, zip_code = $2, crop_types = $3, farm_acres = $4, updated_at = NOW()
         WHERE user_id = $5
         RETURNING *`,
        [farmName, zipCode, cropTypes, farmAcres, session.user.id]
      );
    } else {
      // Create new profile
      farmProfile = await queryOne<DbFarmProfile>(
        `INSERT INTO farm_profiles (user_id, farm_name, zip_code, crop_types, farm_acres)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [session.user.id, farmName, zipCode, cropTypes, farmAcres]
      );
    }

    if (!farmProfile) {
      throw new Error('Failed to save farm profile');
    }

    return NextResponse.json({
      farmProfile: {
        id: farmProfile.id,
        userId: farmProfile.user_id,
        farmName: farmProfile.farm_name,
        zipCode: farmProfile.zip_code,
        cropTypes: farmProfile.crop_types,
        farmAcres: farmProfile.farm_acres,
        createdAt: farmProfile.created_at,
        updatedAt: farmProfile.updated_at,
      },
    });
  } catch (error) {
    console.error('Error saving farm profile:', error);
    securityLogger.logError('Error saving farm profile', error, ip);
    return NextResponse.json({ error: 'Failed to save farm profile' }, { status: 500 });
  }
}

// POST: Create farm profile (used during signup before session exists)
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(request, rateLimiters.moderate);
    if (!rateLimitResult.success) {
      securityLogger.logRateLimitExceeded(ip, '/api/profile/farm', 'POST');
      return createRateLimitResponse(rateLimitResult.reset);
    }

    const body = await request.json();
    const { userId, ...farmData } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Validate farm data
    const result = farmProfileSchema.safeParse(farmData);
    if (!result.success) {
      securityLogger.logValidationFailure('/api/profile/farm', ip, result.error.issues, 'POST');
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      );
    }

    const { farmName, zipCode, cropTypes, farmAcres } = result.data;

    // Verify user exists
    const userExists = await queryOne<{ id: string }>(
      `SELECT id FROM "user" WHERE id = $1`,
      [userId]
    );

    if (!userExists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if profile already exists
    const existingProfile = await queryOne<DbFarmProfile>(
      `SELECT id FROM farm_profiles WHERE user_id = $1`,
      [userId]
    );

    if (existingProfile) {
      return NextResponse.json({ error: 'Farm profile already exists' }, { status: 409 });
    }

    // Create new profile
    const farmProfile = await queryOne<DbFarmProfile>(
      `INSERT INTO farm_profiles (user_id, farm_name, zip_code, crop_types, farm_acres)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, farmName, zipCode, cropTypes, farmAcres]
    );

    if (!farmProfile) {
      throw new Error('Failed to create farm profile');
    }

    return NextResponse.json({
      farmProfile: {
        id: farmProfile.id,
        userId: farmProfile.user_id,
        farmName: farmProfile.farm_name,
        zipCode: farmProfile.zip_code,
        cropTypes: farmProfile.crop_types,
        farmAcres: farmProfile.farm_acres,
        createdAt: farmProfile.created_at,
        updatedAt: farmProfile.updated_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating farm profile:', error);
    securityLogger.logError('Error creating farm profile', error, ip);
    return NextResponse.json({ error: 'Failed to create farm profile' }, { status: 500 });
  }
}
