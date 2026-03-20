import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { securityLogger } from '@/lib/security-logger';
import { getClientIp } from '@/lib/rate-limit';
import { sendSupplierContractSignatureEmail } from '@/lib/email';

// Force Node.js runtime (required for DocuSign SDK compatibility)
export const runtime = 'nodejs';

// POST: Handle DocuSign webhook events
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    const body = await request.json();
    
    // DocuSign sends events in this format
    // The exact structure may vary, so we handle both common formats
    const { event, envelopeId, status, recipients } = body.data || body;

    if (!envelopeId) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/docusign/webhook',
        method: 'POST',
        details: { reason: 'Missing envelope ID in webhook payload', body: JSON.stringify(body) },
        severity: 'low',
      });
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // Find contract by envelope ID
    const contract = await queryOne<{
      id: string;
      supplier_id: string;
      status: string;
      contract_type: string;
      version: number;
      supplier_email: string;
      supplier_name: string;
    }>(`
      SELECT sc.id, sc.supplier_id, sc.status, sc.contract_type, sc.version,
             su.email as supplier_email, su.name as supplier_name
      FROM supplier_contracts sc
      LEFT JOIN supplier_users su ON su.id = sc.supplier_id
      WHERE sc.docusign_envelope_id = $1
    `, [envelopeId]);

    if (!contract) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip,
        path: '/api/docusign/webhook',
        method: 'POST',
        details: { reason: 'Unknown envelope ID', envelopeId },
        severity: 'low',
      });
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Handle different DocuSign events
    const eventType = event || status;
    
    switch (eventType) {
      case 'envelope-sent':
      case 'sent':
        // Envelope sent to recipients
        await query(`
          UPDATE supplier_contracts
          SET 
            docusign_envelope_status = 'sent',
            updated_at = NOW()
          WHERE id = $1
        `, [contract.id]);
        
        console.log(`📧 DocuSign envelope sent for contract ${contract.id}`);
        break;

      case 'envelope-delivered':
      case 'delivered':
        // Recipient has viewed the envelope
        await query(`
          UPDATE supplier_contracts
          SET 
            docusign_envelope_status = 'delivered',
            updated_at = NOW()
          WHERE id = $1
        `, [contract.id]);
        
        console.log(`👀 DocuSign envelope delivered for contract ${contract.id}`);
        break;

      case 'recipient-signed':
      case 'signed':
        // Check which recipient signed
        const adminSigned = recipients?.find(
          (r: { clientUserId: string; status: string }) =>
            r.clientUserId === 'admin' && r.status === 'completed'
        );

        if (adminSigned) {
          await query(`
            UPDATE supplier_contracts
            SET 
              admin_signed_at = NOW(),
              docusign_envelope_status = 'signed',
              status = 'pending_supplier_signature',
              updated_at = NOW()
            WHERE id = $1
          `, [contract.id]);
          
          // Notify supplier that the contract is ready for their signature
          if (contract.supplier_email) {
            sendSupplierContractSignatureEmail({
              to: contract.supplier_email,
              supplierName: contract.supplier_name || 'Supplier',
              contractType: contract.contract_type,
              contractId: contract.id,
              version: contract.version,
            }).catch((err) =>
              console.error('[EMAIL] Failed to send contract signature notification:', err)
            );
          }

          console.log(`✅ Admin signed contract ${contract.id}`);
        } else {
          // Supplier signed (or other recipient)
          await query(`
            UPDATE supplier_contracts
            SET 
              docusign_envelope_status = 'signed',
              updated_at = NOW()
            WHERE id = $1
          `, [contract.id]);
          
          console.log(`✅ Recipient signed contract ${contract.id}`);
        }
        break;

      case 'envelope-completed':
      case 'completed':
        // All parties have signed
        await query(`
          UPDATE supplier_contracts
          SET 
            supplier_signed_at = NOW(),
            docusign_envelope_status = 'completed',
            docusign_completed_at = NOW(),
            status = 'active',
            updated_at = NOW()
          WHERE id = $1
        `, [contract.id]);

        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/docusign/webhook',
          method: 'POST',
          details: {
            action: 'contract_fully_signed',
            contractId: contract.id,
            envelopeId,
          },
          severity: 'low',
        });
        
        console.log(`🎉 Contract ${contract.id} fully signed and activated`);
        break;

      case 'envelope-voided':
      case 'voided':
        // Envelope was cancelled
        await query(`
          UPDATE supplier_contracts
          SET 
            docusign_envelope_status = 'voided',
            status = 'draft',
            updated_at = NOW()
          WHERE id = $1
        `, [contract.id]);
        
        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/docusign/webhook',
          method: 'POST',
          details: {
            action: 'contract_voided',
            contractId: contract.id,
            envelopeId,
          },
          severity: 'medium',
        });
        
        console.log(`❌ Contract ${contract.id} signing voided`);
        break;

      case 'envelope-declined':
      case 'declined':
        // Recipient declined to sign
        await query(`
          UPDATE supplier_contracts
          SET 
            docusign_envelope_status = 'declined',
            status = 'signing_failed',
            updated_at = NOW()
          WHERE id = $1
        `, [contract.id]);
        
        securityLogger.logEvent({
          type: 'admin_action',
          ip,
          path: '/api/docusign/webhook',
          method: 'POST',
          details: {
            action: 'contract_declined',
            contractId: contract.id,
            envelopeId,
          },
          severity: 'medium',
        });
        
        console.log(`⛔ Contract ${contract.id} signing declined`);
        break;

      default:
        // Unknown event type - log it for debugging
        console.log(`⚠️  Unknown DocuSign event: ${eventType} for contract ${contract.id}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('DocuSign webhook error:', error);
    securityLogger.logError('DocuSign webhook processing failed', error, ip);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
