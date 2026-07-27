import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { query, queryOne } from '@/lib/db';
import { mapStripeAccountToStatusSnapshot } from '@/lib/stripe-connect';
import { securityLogger } from '@/lib/security-logger';

export const runtime = 'nodejs';

interface WebhookEventRecord {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  processed_at: string | null;
}

/**
 * Check if webhook event has already been processed (idempotency)
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await queryOne<WebhookEventRecord>(
    `SELECT * FROM stripe_webhook_events WHERE event_id = $1`,
    [eventId]
  );
  return !!existing;
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(
  eventId: string,
  eventType: string,
  status: 'processed' | 'failed',
  errorMessage?: string
): Promise<void> {
  await query(
    `INSERT INTO stripe_webhook_events (event_id, event_type, status, error_message, processed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (event_id) DO UPDATE 
     SET status = $3, error_message = $4, processed_at = NOW()`,
    [eventId, eventType, status, errorMessage || null]
  );
}

interface TenantIdRecord {
  id: string;
}

/**
 * Flat v1-shaped account payload. Stripe Connect accounts (even ones created
 * via the newer v2 Core Accounts API) still emit the classic v1
 * `account.updated` event with `event.data.object` in this shape — the same
 * simple shape `stripe.accounts.retrieve()` returns, NOT the deeply-nested
 * v2 `configuration.recipient.capabilities...` shape.
 */
interface ConnectAccountUpdatedObject {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

/**
 * Handle `account.updated` events for Connect accounts.
 */
async function handleAccountUpdated(account: ConnectAccountUpdatedObject): Promise<void> {
  const tenant = await queryOne<TenantIdRecord>(
    `SELECT id FROM tenants WHERE stripe_connect_account_id = $1`,
    [account.id]
  );

  if (!tenant) {
    // Not an error condition — just an account we don't track (e.g. a stray
    // or test account). Nothing to retry, so we still mark the event
    // processed below.
    console.warn(
      `[stripe-connect webhook] account.updated received for account ${account.id}, which is not linked to any tenant`
    );
    return;
  }

  const snapshot = mapStripeAccountToStatusSnapshot(account);

  await query(
    `UPDATE tenants SET stripe_connect_charges_enabled = $1, stripe_connect_payouts_enabled = $2, stripe_connect_details_submitted = $3, updated_at = NOW() WHERE id = $4`,
    [snapshot.chargesEnabled, snapshot.payoutsEnabled, snapshot.detailsSubmitted, tenant.id]
  );
}

/**
 * POST /api/webhooks/stripe-connect
 *
 * Handles Stripe Connect account webhook events. Verifies signatures inline
 * against its own dedicated `STRIPE_CONNECT_WEBHOOK_SECRET`, following the
 * same precedent as `app/api/webhooks/stripe-billing/route.ts`, rather than
 * the shared `verifyWebhookSignature` helper in `lib/stripe.ts` (which is
 * hardcoded to `STRIPE_WEBHOOK_SECRET`).
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body and signature (Stripe requires the raw unparsed body)
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[stripe-connect webhook] STRIPE_CONNECT_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip: 'stripe-webhook',
        path: '/api/webhooks/stripe-connect',
        method: 'POST',
        details: {
          message: 'Webhook signature verification failed',
          error: String(err),
        },
        severity: 'high',
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Check if event already processed (idempotency)
    if (await isEventProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Process event based on type
    try {
      switch (event.type) {
        case 'account.updated':
          await handleAccountUpdated(
            event.data.object as unknown as ConnectAccountUpdatedObject
          );
          break;

        default:
          // Log unhandled event type
          securityLogger.logEvent({
            type: 'suspicious_activity',
            ip: 'stripe-webhook',
            path: '/api/webhooks/stripe-connect',
            method: 'POST',
            details: {
              message: 'Unhandled webhook event type',
              eventId: event.id,
              eventType: event.type,
            },
            severity: 'low',
          });
      }

      // Mark event as processed
      await markEventProcessed(event.id, event.type, 'processed');

      return NextResponse.json({ received: true });
    } catch (error) {
      // Mark event as failed but return 200 to prevent Stripe retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markEventProcessed(event.id, event.type, 'failed', errorMessage);

      securityLogger.logError(
        'Stripe connect webhook event processing failed',
        error,
        'stripe-connect-webhook'
      );

      // Still return 200 to acknowledge receipt
      return NextResponse.json({
        received: true,
        error: 'Processing failed but acknowledged',
      });
    }
  } catch (err) {
    securityLogger.logError(
      'Stripe connect webhook endpoint error',
      err,
      'stripe-connect-webhook'
    );

    // Return 500 for infrastructure errors (will cause Stripe to retry)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
