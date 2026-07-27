import Stripe from 'stripe';
import { query, queryOne } from './db';
import { securityLogger } from './security-logger';

// Lazy initialization of Stripe client
// This prevents build-time errors when STRIPE_SECRET_KEY is not available
// The client is only created when first accessed at runtime
let stripeInstance: Stripe | null = null;

function getStripeInstance(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  }
  return stripeInstance;
}

// Export stripe as a Proxy that lazily initializes on first access
// This maintains backward compatibility with all existing code
export const stripe = new Proxy({} as Stripe, {
  get: (target, prop) => {
    const instance = getStripeInstance();
    const value = instance[prop as keyof Stripe];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

interface StripeCustomerRecord {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  created_at: string;
  updated_at: string;
}

interface PaymentMethodRecord {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  stripe_customer_id: string;
  card_brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Create or retrieve a Stripe customer for a user
 * @param userId - The user's database ID
 * @param email - The user's email address
 * @param name - The user's name (optional)
 * @returns Stripe customer ID
 */
export async function createOrGetStripeCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  try {
    // Check if customer already exists in our database
    const existingCustomer = await queryOne<StripeCustomerRecord>(
      `SELECT * FROM stripe_customers WHERE user_id = $1`,
      [userId]
    );

    if (existingCustomer) {
      // Verify customer still exists in Stripe
      try {
        await stripe.customers.retrieve(existingCustomer.stripe_customer_id);
        return existingCustomer.stripe_customer_id;
      } catch {
        // Customer doesn't exist in Stripe anymore, create new one
        securityLogger.logEvent({
          type: 'suspicious_activity',
          ip: 'system',
          path: '/lib/stripe',
          method: 'createOrGetStripeCustomer',
          details: {
            message: 'Stripe customer not found, creating new one',
            userId,
            oldCustomerId: existingCustomer.stripe_customer_id,
          },
          severity: 'medium',
        });
      }
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: {
        userId,
      },
    });

    // Store in database
    await query(
      `INSERT INTO stripe_customers (user_id, stripe_customer_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) 
       DO UPDATE SET stripe_customer_id = $2, updated_at = NOW()`,
      [userId, customer.id]
    );

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'createOrGetStripeCustomer',
      details: {
        message: 'Stripe customer created',
        userId,
        customerId: customer.id,
      },
      severity: 'low',
    });

    return customer.id;
  } catch (error) {
    securityLogger.logError('Failed to create/get Stripe customer', error, 'system', { userId });
    throw new Error('Failed to initialize Stripe customer');
  }
}

/**
 * Create a payment intent for an order
 * @param amount - Amount in cents
 * @param customerId - Stripe customer ID
 * @param metadata - Additional metadata for the payment
 * @param options - Optional settings like receipt_email, and Stripe Connect routing
 * @returns Payment intent with client secret
 */
export async function createPaymentIntent(
  amount: number,
  customerId: string,
  metadata: Record<string, string>,
  options?: {
    receipt_email?: string;
    setupFutureUsage?: boolean;
    currency?: string;
    connect?: {
      destinationAccountId: string;
      onBehalfOf?: string;
      applicationFeeAmountCents?: number;
    };
  }
): Promise<{ paymentIntent: Stripe.PaymentIntent; clientSecret: string }> {
  try {
    const currency = (options?.currency ?? 'usd').toLowerCase();
    const connect = options?.connect;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: customerId,
      metadata,
      payment_method_types: ['card'],
      ...(options?.setupFutureUsage && { setup_future_usage: 'off_session' }),
      ...(options?.receipt_email && { receipt_email: options.receipt_email }),
      ...(connect && { transfer_data: { destination: connect.destinationAccountId } }),
      ...(connect?.onBehalfOf && { on_behalf_of: connect.onBehalfOf }),
      ...(connect?.applicationFeeAmountCents && connect.applicationFeeAmountCents > 0
        ? { application_fee_amount: connect.applicationFeeAmountCents }
        : {}),
    });

    if (!paymentIntent.client_secret) {
      throw new Error('Failed to create payment intent: no client secret');
    }

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'createPaymentIntent',
      details: {
        message: 'Payment intent created',
        paymentIntentId: paymentIntent.id,
        amount,
        customerId,
      },
      severity: 'low',
    });

    return {
      paymentIntent,
      clientSecret: paymentIntent.client_secret,
    };
  } catch (error) {
    securityLogger.logError('Failed to create payment intent', error, 'system', { customerId });
    throw new Error('Failed to create payment intent');
  }
}

/**
 * Retrieve a payment intent by ID
 * @param paymentIntentId - The payment intent ID
 * @returns Payment intent
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    securityLogger.logError('Failed to retrieve payment intent', error, 'system');
    throw new Error('Failed to retrieve payment intent');
  }
}

/**
 * Attach a payment method to a customer and save to database
 * @param paymentMethodId - Stripe payment method ID
 * @param customerId - Stripe customer ID
 * @param userId - User's database ID
 * @param setAsDefault - Whether to set as default payment method
 * @returns Payment method record
 */
export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string,
  userId: string,
  setAsDefault: boolean = false
): Promise<PaymentMethodRecord> {
  try {
    // Attach payment method to customer in Stripe
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Get card details
    if (paymentMethod.type !== 'card' || !paymentMethod.card) {
      throw new Error('Only card payment methods are supported');
    }

    const card = paymentMethod.card;

    // Save to database
    const record = await queryOne<PaymentMethodRecord>(
      `INSERT INTO payment_methods (
        user_id, stripe_payment_method_id, stripe_customer_id,
        card_brand, last4, exp_month, exp_year, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        userId,
        paymentMethod.id,
        customerId,
        card.brand || 'unknown',
        card.last4,
        card.exp_month,
        card.exp_year,
        setAsDefault,
      ]
    );

    if (!record) {
      throw new Error('Failed to save payment method to database');
    }

    // Set as default in Stripe if requested
    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      });
    }

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'attachPaymentMethod',
      details: {
        message: 'Payment method attached',
        paymentMethodId,
        userId,
        isDefault: setAsDefault,
      },
      severity: 'low',
    });

    return record;
  } catch (error) {
    securityLogger.logError('Failed to attach payment method', error, 'system', { userId });
    throw new Error('Failed to attach payment method');
  }
}

/**
 * Set a payment method as default for a customer
 * @param paymentMethodId - Stripe payment method ID
 * @param customerId - Stripe customer ID
 * @param userId - User's database ID
 */
export async function setDefaultPaymentMethod(
  paymentMethodId: string,
  customerId: string,
  userId: string
): Promise<void> {
  try {
    // Update in Stripe
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update in database (trigger will handle unsetting other defaults)
    await query(
      `UPDATE payment_methods 
       SET is_default = true, updated_at = NOW()
       WHERE user_id = $1 AND stripe_payment_method_id = $2`,
      [userId, paymentMethodId]
    );

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'setDefaultPaymentMethod',
      details: {
        message: 'Default payment method updated',
        paymentMethodId,
        userId,
      },
      severity: 'low',
    });
  } catch (error) {
    securityLogger.logError('Failed to set default payment method', error, 'system', { userId });
    throw new Error('Failed to set default payment method');
  }
}

/**
 * List all payment methods for a customer
 * @param customerId - Stripe customer ID
 * @param userId - User's database ID
 * @returns Array of payment methods
 */
export async function listPaymentMethods(
  customerId: string,
  userId: string
): Promise<PaymentMethodRecord[]> {
  try {
    // Get from database (our source of truth)
    const methods = await query<PaymentMethodRecord>(
      `SELECT * FROM payment_methods 
       WHERE user_id = $1 AND stripe_customer_id = $2
       ORDER BY is_default DESC, created_at DESC`,
      [userId, customerId]
    );

    return methods;
  } catch (error) {
    securityLogger.logError('Failed to list payment methods', error, 'system', { userId });
    throw new Error('Failed to list payment methods');
  }
}

/**
 * Detach a payment method from a customer
 * @param paymentMethodId - Stripe payment method ID
 * @param userId - User's database ID
 */
export async function detachPaymentMethod(
  paymentMethodId: string,
  userId: string
): Promise<void> {
  try {
    // Check if it's the default
    const method = await queryOne<PaymentMethodRecord>(
      `SELECT * FROM payment_methods 
       WHERE user_id = $1 AND stripe_payment_method_id = $2`,
      [userId, paymentMethodId]
    );

    if (!method) {
      throw new Error('Payment method not found');
    }

    if (method.is_default) {
      throw new Error('Cannot remove default payment method. Set another as default first.');
    }

    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethodId);

    // Remove from database
    await query(
      `DELETE FROM payment_methods 
       WHERE user_id = $1 AND stripe_payment_method_id = $2`,
      [userId, paymentMethodId]
    );

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'detachPaymentMethod',
      details: {
        message: 'Payment method detached',
        paymentMethodId,
        userId,
      },
      severity: 'low',
    });
  } catch (error) {
    securityLogger.logError('Failed to detach payment method', error, 'system', { userId });
    if (error instanceof Error && error.message.includes('default')) {
      throw error;
    }
    throw new Error('Failed to remove payment method');
  }
}

/**
 * Create a setup intent for adding a payment method without a purchase
 * @param customerId - Stripe customer ID
 * @returns Setup intent with client secret
 */
export async function createSetupIntent(
  customerId: string
): Promise<{ setupIntent: Stripe.SetupIntent; clientSecret: string }> {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    if (!setupIntent.client_secret) {
      throw new Error('Failed to create setup intent: no client secret');
    }

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'createSetupIntent',
      details: {
        message: 'Setup intent created',
        setupIntentId: setupIntent.id,
        customerId,
      },
      severity: 'low',
    });

    return {
      setupIntent,
      clientSecret: setupIntent.client_secret,
    };
  } catch (error) {
    securityLogger.logError('Failed to create setup intent', error, 'system', { customerId });
    throw new Error('Failed to create setup intent');
  }
}

/**
 * Get payment method details from a payment intent
 * @param paymentIntentId - The payment intent ID
 * @returns Payment method details or null if not found
 */
export async function getPaymentMethodFromIntent(
  paymentIntentId: string
): Promise<{
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (!paymentIntent.payment_method) {
      return null;
    }

    // Get the payment method ID (it can be string or object)
    const paymentMethodId = typeof paymentIntent.payment_method === 'string'
      ? paymentIntent.payment_method
      : paymentIntent.payment_method.id;

    // Retrieve the full payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.type !== 'card' || !paymentMethod.card) {
      return null;
    }

    return {
      brand: paymentMethod.card.brand || 'unknown',
      last4: paymentMethod.card.last4 || '****',
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
    };
  } catch (error) {
    securityLogger.logError('Failed to get payment method from intent', error, 'system', { paymentIntentId });
    return null;
  }
}

/**
 * Save payment method from a payment intent
 * @param paymentIntentId - The payment intent ID
 * @param userId - User's database ID
 * @param setAsDefault - Whether to set as default payment method
 * @returns Payment method record or null if save failed
 */
export async function savePaymentMethodFromIntent(
  paymentIntentId: string,
  userId: string,
  setAsDefault: boolean = false
): Promise<PaymentMethodRecord | null> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (!paymentIntent.payment_method || !paymentIntent.customer) {
      securityLogger.logEvent({
        type: 'suspicious_activity',
        ip: 'system',
        path: '/lib/stripe',
        method: 'savePaymentMethodFromIntent',
        details: {
          message: 'Payment intent missing payment method or customer',
          paymentIntentId,
          userId,
        },
        severity: 'medium',
      });
      return null;
    }

    // Get the payment method ID and customer ID
    const paymentMethodId = typeof paymentIntent.payment_method === 'string'
      ? paymentIntent.payment_method
      : paymentIntent.payment_method.id;
    
    const customerId = typeof paymentIntent.customer === 'string'
      ? paymentIntent.customer
      : paymentIntent.customer.id;

    // Retrieve the payment method to check if it's already attached
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if payment method is already attached to this customer
    const isAlreadyAttached = paymentMethod.customer === customerId;

    // If not attached, attach it now
    if (!isAlreadyAttached) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    }

    // Get card details
    if (paymentMethod.type !== 'card' || !paymentMethod.card) {
      throw new Error('Only card payment methods are supported');
    }

    const card = paymentMethod.card;

    // Check if this payment method is already saved in our database
    const existingMethod = await queryOne<PaymentMethodRecord>(
      `SELECT * FROM payment_methods 
       WHERE user_id = $1 AND stripe_payment_method_id = $2`,
      [userId, paymentMethod.id]
    );

    if (existingMethod) {
      // Payment method already saved, just update if needed
      if (setAsDefault && !existingMethod.is_default) {
        await query(
          `UPDATE payment_methods 
           SET is_default = true, updated_at = NOW()
           WHERE user_id = $1 AND stripe_payment_method_id = $2`,
          [userId, paymentMethod.id]
        );
        
        if (setAsDefault) {
          await stripe.customers.update(customerId, {
            invoice_settings: {
              default_payment_method: paymentMethod.id,
            },
          });
        }
      }
      return existingMethod;
    }

    // Save to database
    const record = await queryOne<PaymentMethodRecord>(
      `INSERT INTO payment_methods (
        user_id, stripe_payment_method_id, stripe_customer_id,
        card_brand, last4, exp_month, exp_year, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_payment_method_id) DO NOTHING
      RETURNING *`,
      [
        userId,
        paymentMethod.id,
        customerId,
        card.brand || 'unknown',
        card.last4,
        card.exp_month,
        card.exp_year,
        setAsDefault,
      ]
    );

    if (!record) {
      // Conflict - payment method already exists
      return await queryOne<PaymentMethodRecord>(
        `SELECT * FROM payment_methods WHERE stripe_payment_method_id = $1`,
        [paymentMethod.id]
      );
    }

    // Set as default in Stripe if requested
    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      });
    }

    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/lib/stripe',
      method: 'savePaymentMethodFromIntent',
      details: {
        message: 'Payment method saved from intent',
        paymentMethodId,
        userId,
        isDefault: setAsDefault,
        wasAlreadyAttached: isAlreadyAttached,
      },
      severity: 'low',
    });

    return record;
  } catch (error) {
    securityLogger.logError('Failed to save payment method from intent', error, 'system', { userId, paymentIntentId });
    return null;
  }
}

/**
 * Verify a webhook signature
 * @param payload - Raw request body
 * @param signature - Stripe signature header
 * @returns Verified Stripe event
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    securityLogger.logEvent({
      type: 'suspicious_activity',
      ip: 'system',
      path: '/api/webhooks/stripe',
      method: 'POST',
      details: {
        message: 'Invalid webhook signature',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      severity: 'high',
    });
    throw new Error('Invalid webhook signature');
  }
}

