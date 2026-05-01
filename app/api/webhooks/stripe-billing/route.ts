import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { syncSubscriptionToTenant } from '@/lib/billing';
import { securityLogger } from '@/lib/security-logger';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-billing webhook] STRIPE_BILLING_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'stripe-webhook',
      path: '/api/webhooks/stripe-billing',
      method: 'POST',
      details: { message: 'Webhook signature verification failed', error: String(err) },
      severity: 'high',
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToTenant(
          subscription.id,
          subscription.customer as string,
          subscription.status
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToTenant(
          subscription.id,
          subscription.customer as string,
          'canceled'
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (subId && invoice.customer) {
          await syncSubscriptionToTenant(
            subId,
            invoice.customer as string,
            'past_due'
          );
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (subId && invoice.customer) {
          await syncSubscriptionToTenant(
            subId,
            invoice.customer as string,
            'active'
          );
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    securityLogger.logError('Stripe billing webhook handler failed', err, 'stripe-billing', {
      eventType: event.type,
    });
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
