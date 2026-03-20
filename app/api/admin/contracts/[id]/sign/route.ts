import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { query, queryOne } from '@/lib/db';
import { createEnvelopeWithEmbeddedSigning } from '@/lib/docusign';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Force Node.js runtime (required for DocuSign SDK)
export const runtime = 'nodejs';

// POST: Initiate DocuSign signing for admin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);

  // Require contracts.sign permission (Signature Authority)
  const auth = await requireAdmin('contracts.sign');
  if (auth.error) return auth.error;
  const session = auth.session;

  try {
    const { id } = await params;

    // Get contract details including supplier information
    const contract = await queryOne<{
      status: string;
      file_url: string | null;
      filename: string | null;
      supplier_id: string;
      contract_type: string;
      docusign_envelope_id: string | null;
      supplier_name: string;
      supplier_email: string;
      content: object | null;
      admin_signed_at: string | null;
    }>(`
      SELECT 
        sc.*,
        su.name as supplier_name,
        su.email as supplier_email
      FROM supplier_contracts sc
      JOIN supplier_users su ON sc.supplier_id = su.id
      WHERE sc.id = $1
    `, [id]);

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Can only initiate signing if status is draft, or pending_supplier_signature with no admin signature yet
    const signingAllowed = contract.status === 'draft' ||
      (contract.status === 'pending_supplier_signature' && !contract.admin_signed_at);
    if (!signingAllowed) {
      return NextResponse.json(
        { error: `Cannot initiate signing for contract with status: ${contract.status}` },
        { status: 400 }
      );
    }

    // Handle in-app (builder) contracts — sign directly without DocuSign
    if (contract.content) {
      await query(`
        UPDATE supplier_contracts
        SET
          admin_signed_at = NOW(),
          admin_signed_by = $1,
          status = 'pending_supplier_signature',
          updated_at = NOW()
        WHERE id = $2
      `, [session.user.id, id]);

      securityLogger.logAdminAction(
        session.user.id,
        session.user.email,
        'sign_in_app_contract',
        id,
        ip,
        { previousStatus: contract.status }
      );

      securityLogger.logEvent({
        type: 'admin_action',
        userId: session.user.id,
        ip,
        path: '/api/admin/contracts/[id]/sign',
        method: 'POST',
        details: {
          action: 'in_app_contract_signed_by_admin',
          contractId: id,
        },
        severity: 'low',
      });

      return NextResponse.json({ success: true });
    }

    // Check if DocuSign envelope already exists
    if (contract.docusign_envelope_id) {
      return NextResponse.json(
        { error: 'Contract already sent to DocuSign' },
        { status: 400 }
      );
    }

    // Download PDF from S3
    const s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    if (!contract.file_url || !contract.filename) {
      return NextResponse.json(
        { error: 'Contract has no file attached' },
        { status: 400 }
      );
    }

    const s3Key = contract.file_url.split('.amazonaws.com/')[1];
    if (!s3Key) {
      return NextResponse.json(
        { error: 'Invalid contract file URL' },
        { status: 400 }
      );
    }

    const getCommand = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: s3Key,
    });

    const s3Response = await s3Client.send(getCommand);
    const pdfBuffer = Buffer.from(await s3Response.Body!.transformToByteArray());

    // Create DocuSign envelope with embedded signing for admin
    const { envelopeId, adminSigningUrl } = await createEnvelopeWithEmbeddedSigning(
      pdfBuffer,
      contract.filename,
      session.user.name,
      session.user.email,
      contract.supplier_name,
      contract.supplier_email,
      contract.contract_type
    );

    // Update database with DocuSign envelope info
    await query(`
      UPDATE supplier_contracts
      SET 
        docusign_envelope_id = $1,
        docusign_envelope_status = 'sent',
        docusign_admin_signing_url = $2,
        docusign_sent_at = NOW(),
        status = 'pending_signatures',
        updated_at = NOW()
      WHERE id = $3
    `, [envelopeId, adminSigningUrl, id]);

    // Log the action
    securityLogger.logAdminAction(
      session.user.id,
      session.user.email,
      'initiate_docusign_signing',
      id,
      ip,
      { envelopeId, previousStatus: contract.status }
    );

    securityLogger.logEvent({
      type: 'admin_action',
      userId: session.user.id,
      ip,
      path: '/api/admin/contracts/[id]/sign',
      method: 'POST',
      details: { 
        action: 'docusign_signing_initiated', 
        contractId: id, 
        envelopeId 
      },
      severity: 'low',
    });

    return NextResponse.json({
      success: true,
      signingUrl: adminSigningUrl,
      envelopeId,
    });
  } catch (error) {
    console.error('Error initiating DocuSign signing:', error);
    securityLogger.logError('Failed to initiate DocuSign signing', error, ip);
    
    // Provide more specific error message if DocuSign is not configured
    if (error instanceof Error && error.message.includes('DocuSign environment variables')) {
      return NextResponse.json(
        { error: 'DocuSign is not configured. Please contact your administrator.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to initiate signing process' },
      { status: 500 }
    );
  }
}
