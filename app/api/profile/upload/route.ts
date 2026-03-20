import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { generatePresignedUploadUrl, deleteFromS3, getKeyFromUrl } from '@/lib/s3';
import { query, queryOne } from '@/lib/db';

interface DbUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

// POST: Generate presigned URL for profile picture upload
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contentType, fileName, size = 0 } = body;

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!contentType || !allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
        { status: 400 }
      );
    }

    // Generate unique key for the file
    const extension = fileName?.split('.').pop() || contentType.split('/')[1];
    const key = `profile-pictures/${session.user.id}/${Date.now()}.${extension}`;

    const result = await generatePresignedUploadUrl(key, contentType, size);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

// PATCH: Confirm upload and update user's profile picture
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // Get current user to check for existing image
    const currentUser = await queryOne<DbUser>(
      `SELECT id, image FROM "user" WHERE id = $1`,
      [session.user.id]
    );

    // Delete old profile picture from S3 if it exists and is from our bucket
    if (currentUser?.image) {
      const oldKey = getKeyFromUrl(currentUser.image);
      if (oldKey && oldKey.startsWith('profile-pictures/')) {
        try {
          await deleteFromS3(oldKey);
        } catch (error) {
          console.error('Error deleting old profile picture:', error);
          // Continue even if delete fails
        }
      }
    }

    // Update user's image URL in the database
    await query(
      `UPDATE "user" SET image = $1, "updatedAt" = NOW() WHERE id = $2`,
      [imageUrl, session.user.id]
    );

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    console.error('Error updating profile picture:', error);
    return NextResponse.json({ error: 'Failed to update profile picture' }, { status: 500 });
  }
}

// DELETE: Remove profile picture
export async function DELETE() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current user to check for existing image
    const currentUser = await queryOne<DbUser>(
      `SELECT id, image FROM "user" WHERE id = $1`,
      [session.user.id]
    );

    // Delete from S3 if exists
    if (currentUser?.image) {
      const key = getKeyFromUrl(currentUser.image);
      if (key && key.startsWith('profile-pictures/')) {
        try {
          await deleteFromS3(key);
        } catch (error) {
          console.error('Error deleting profile picture from S3:', error);
        }
      }
    }

    // Remove image URL from database
    await query(
      `UPDATE "user" SET image = NULL, "updatedAt" = NOW() WHERE id = $1`,
      [session.user.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing profile picture:', error);
    return NextResponse.json({ error: 'Failed to remove profile picture' }, { status: 500 });
  }
}

