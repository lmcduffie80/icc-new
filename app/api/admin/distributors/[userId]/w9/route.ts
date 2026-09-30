import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { queryOne, query, getTenantIdForUser } from '@/lib/db';
import { uploadToS3 } from '@/lib/s3';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';

const MAX_W9_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_W9_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// POST /api/admin/distributors/[userId]/w9 — upload a W9 document for a distributor
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin('distributors.manage');
  if (auth.error) return auth.error;

  const { userId } = await params;
  const ip = getClientIp(request);

  // Verify user exists
  const user = await queryOne<{ id: string; email: string }>(
    `SELECT id, email FROM "user" WHERE id = $1`,
    [userId]
  );
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('w9') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > MAX_W9_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 });
  }

  if (!ALLOWED_W9_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Please upload a PDF, JPEG, PNG, or WebP.' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  const s3Key = `distributor-w9/${userId}/${Date.now()}.${ext}`;

  try {
    const w9Url = await uploadToS3(buffer, s3Key, file.type);

    // Need tenant_id (NOT NULL after migration 084) — only required on INSERT path
    const tenantId = await getTenantIdForUser(userId);

    await query(
      `INSERT INTO user_profiles (user_id, tenant_id, distributor_w9_url, distributor_w9_filename, distributor_w9_uploaded_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         distributor_w9_url = EXCLUDED.distributor_w9_url,
         distributor_w9_filename = EXCLUDED.distributor_w9_filename,
         distributor_w9_uploaded_at = NOW(),
         updated_at = NOW()`,
      [userId, tenantId, w9Url, file.name]
    );

    securityLogger.logAdminAction(
      auth.session.user.id,
      auth.session.user.name,
      'upload_distributor_w9',
      userId,
      ip,
      { email: user.email, filename: file.name }
    );

    return NextResponse.json({ success: true, w9_url: w9Url, filename: file.name });
  } catch {
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
