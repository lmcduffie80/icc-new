import { Resend } from 'resend';
import { securityLogger } from './security-logger';

// Email sender address (must be verified in Resend)
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';

// Admin email for notifications (can be configured via env)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || FROM_EMAIL;

// Fixed team recipients for all contact form notifications
const CONTACT_NOTIFICATION_RECIPIENTS = [
  'lee@innovativecropcare.com',
  'mike@innovativecropcare.com',
  'josh@innovativecropcare.com',
];

// Lazy-load Resend client to avoid initialization errors in tests
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Base email data interface
 */
interface BaseEmailData {
  to: string;
  subject: string;
}

/**
 * Order confirmation email data
 */
export interface OrderConfirmationData extends BaseEmailData {
  orderNumber: string;
  customerName: string;
  orderDate: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    image?: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  shippingAddress: {
    firstName?: string;
    lastName?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zipCode: string;
  };
  deliveryMethod: string;
  ip?: string; // Optional IP address for logging
}

/**
 * Order status update email data
 */
export interface OrderStatusUpdateData extends BaseEmailData {
  orderNumber: string;
  customerName: string;
  oldStatus: string;
  newStatus: string;
  orderUrl: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  ip?: string;
}

/**
 * Contact form notification data
 */
export interface ContactNotificationData {
  submissionId: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  submittedAt: string;
  userId?: string;
  ip?: string; // Optional IP address for logging
}

/**
 * Email verification data
 */
export interface VerificationEmailData extends BaseEmailData {
  name: string;
  verificationUrl: string;
  ip?: string; // Optional IP address for logging
}

/**
 * Generic result interface for email operations
 */
interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Format currency for email display
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for email display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Send order confirmation email to customer
 */
export async function sendOrderConfirmation(
  data: OrderConfirmationData
): Promise<EmailResult> {
  try {
    const html = generateOrderConfirmationHTML(data);
    const text = generateOrderConfirmationText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/order-confirmation',
      method: 'POST',
      details: {
        orderNumber: data.orderNumber,
        recipient: data.to,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    // Enhanced error logging with detailed Resend API information
    const errorDetails = {
      orderNumber: data.orderNumber,
      recipient: data.to,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      // Include any additional error properties from Resend
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/order-confirmation',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send order confirmation email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for order confirmation email
 */
function generateOrderConfirmationHTML(data: OrderConfirmationData): string {
  const itemsHTML = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        ${item.name}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
        ${item.quantity}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
        ${formatCurrency(item.price)}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
        ${formatCurrency(item.price * item.quantity)}
      </td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Order Confirmation</h1>
    <p style="margin: 0; font-size: 18px;">Thank you for your order, ${data.customerName}!</p>
  </div>

  <div style="margin-bottom: 30px;">
    <p>Your order has been successfully placed and is being processed.</p>
    <p><strong>Order Number:</strong> ${data.orderNumber}</p>
    <p><strong>Order Date:</strong> ${data.orderDate}</p>
  </div>

  <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Order Details</h2>
  
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <thead>
      <tr style="background-color: #f8f9fa;">
        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
        <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <div style="text-align: right; margin-bottom: 30px;">
    <p style="margin: 5px 0;"><strong>Subtotal:</strong> ${formatCurrency(data.subtotal)}</p>
    <p style="margin: 5px 0;"><strong>Delivery (${data.deliveryMethod}):</strong> ${formatCurrency(data.deliveryFee)}</p>
    <p style="margin: 5px 0;"><strong>Tax:</strong> ${formatCurrency(data.tax)}</p>
    <p style="margin: 10px 0 0 0; font-size: 20px; color: #059669;"><strong>Total:</strong> ${formatCurrency(data.total)}</p>
  </div>

  <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Shipping Address</h2>
  <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 30px;">
    <p style="margin: 5px 0;">${data.shippingAddress.firstName || ''} ${data.shippingAddress.lastName || ''}</p>
    <p style="margin: 5px 0;">${data.shippingAddress.line1}</p>
    ${data.shippingAddress.line2 ? `<p style="margin: 5px 0;">${data.shippingAddress.line2}</p>` : ''}
    <p style="margin: 5px 0;">${data.shippingAddress.city}, ${data.shippingAddress.state} ${data.shippingAddress.zipCode}</p>
  </div>

  <div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; border-left: 4px solid #059669; margin-top: 30px;">
    <p style="margin: 0;"><strong>Need help?</strong></p>
    <p style="margin: 10px 0 0 0;">Contact our customer support team if you have any questions about your order.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for order confirmation email
 */
function generateOrderConfirmationText(data: OrderConfirmationData): string {
  const itemsText = data.items
    .map(
      (item) =>
        `${item.name} x${item.quantity} - ${formatCurrency(item.price * item.quantity)}`
    )
    .join('\n');

  return `
ORDER CONFIRMATION

Thank you for your order, ${data.customerName}!

Your order has been successfully placed and is being processed.

Order Number: ${data.orderNumber}
Order Date: ${data.orderDate}

ORDER DETAILS
----------------------------------------
${itemsText}

Subtotal: ${formatCurrency(data.subtotal)}
Delivery (${data.deliveryMethod}): ${formatCurrency(data.deliveryFee)}
Tax: ${formatCurrency(data.tax)}
Total: ${formatCurrency(data.total)}

SHIPPING ADDRESS
----------------------------------------
${data.shippingAddress.firstName || ''} ${data.shippingAddress.lastName || ''}
${data.shippingAddress.line1}
${data.shippingAddress.line2 || ''}
${data.shippingAddress.city}, ${data.shippingAddress.state} ${data.shippingAddress.zipCode}

Need help? Contact our customer support team if you have any questions about your order.

This is an automated message. Please do not reply to this email.
  `;
}

/**
 * Send contact form notification to admin
 */
export async function sendContactNotification(
  data: ContactNotificationData
): Promise<EmailResult> {
  try {
    const html = generateContactNotificationHTML(data);
    const text = generateContactNotificationText(data);

    const resend = getResendClient();
    const contactRecipients = Array.from(new Set([ADMIN_EMAIL, ...CONTACT_NOTIFICATION_RECIPIENTS]));
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: contactRecipients,
      subject: `New Contact Form Submission: ${data.subject}`,
      html,
      text,
      replyTo: data.email,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/contact-notification',
      method: 'POST',
      details: {
        submissionId: data.submissionId,
        fromEmail: data.email,
        toEmail: contactRecipients,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    // Enhanced error logging with detailed Resend API information
    const errorDetails = {
      submissionId: data.submissionId,
      fromEmail: data.email,
      toEmail: Array.from(new Set([ADMIN_EMAIL, ...CONTACT_NOTIFICATION_RECIPIENTS])),
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      // Include any additional error properties from Resend
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/contact-notification',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send contact notification email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for contact notification email
 */
function generateContactNotificationHTML(data: ContactNotificationData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">New Contact Form Submission</h1>
    <p style="margin: 0; font-size: 14px; color: #666;">Submission ID: ${data.submissionId}</p>
  </div>

  <div style="margin-bottom: 20px;">
    <h2 style="color: #059669; font-size: 18px; margin: 0 0 10px 0;">Contact Information</h2>
    <p style="margin: 5px 0;"><strong>Name:</strong> ${data.name}</p>
    <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
    ${data.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${data.phone}</p>` : ''}
    <p style="margin: 5px 0;"><strong>Submitted:</strong> ${formatDate(data.submittedAt)}</p>
    ${data.userId ? `<p style="margin: 5px 0;"><strong>User ID:</strong> ${data.userId}</p>` : '<p style="margin: 5px 0;"><em>Submitted by guest</em></p>'}
  </div>

  <div style="margin-bottom: 20px;">
    <h2 style="color: #059669; font-size: 18px; margin: 0 0 10px 0;">Subject</h2>
    <p style="margin: 0;">${data.subject}</p>
  </div>

  <div style="margin-bottom: 20px;">
    <h2 style="color: #059669; font-size: 18px; margin: 0 0 10px 0;">Message</h2>
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; white-space: pre-wrap;">${data.message}</div>
  </div>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin-top: 20px;">
    <p style="margin: 0;"><strong>Action Required:</strong> Please respond to this inquiry within 24 hours.</p>
  </div>

  <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>Click reply to respond directly to ${data.name}</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for contact notification email
 */
function generateContactNotificationText(data: ContactNotificationData): string {
  return `
NEW CONTACT FORM SUBMISSION

Submission ID: ${data.submissionId}

CONTACT INFORMATION
----------------------------------------
Name: ${data.name}
Email: ${data.email}
${data.phone ? `Phone: ${data.phone}` : ''}
Submitted: ${formatDate(data.submittedAt)}
${data.userId ? `User ID: ${data.userId}` : 'Submitted by guest'}

SUBJECT
----------------------------------------
${data.subject}

MESSAGE
----------------------------------------
${data.message}

ACTION REQUIRED: Please respond to this inquiry within 24 hours.

Reply to this email to respond directly to ${data.name}
  `;
}

/**
 * Send customer auto-reply for contact form submission
 */
export async function sendContactAutoReply(
  name: string,
  email: string,
  ip?: string
): Promise<EmailResult> {
  try {
    const resend = getResendClient();
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You for Contacting Us</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Thank You for Contacting Us</h1>
    <p style="margin: 0; font-size: 18px;">We've received your message!</p>
  </div>

  <p>Hi ${name},</p>
  
  <p>Thank you for reaching out to us. We've received your message and our team will review it shortly.</p>
  
  <p>We typically respond to inquiries within 24 hours during business days. If your matter is urgent, please don't hesitate to call us.</p>

  <div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; border-left: 4px solid #059669; margin-top: 30px;">
    <p style="margin: 0;"><strong>What happens next?</strong></p>
    <p style="margin: 10px 0 0 0;">Our support team will review your message and get back to you via email as soon as possible.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
THANK YOU FOR CONTACTING US

Hi ${name},

Thank you for reaching out to us. We've received your message and our team will review it shortly.

We typically respond to inquiries within 24 hours during business days. If your matter is urgent, please don't hesitate to call us.

WHAT HAPPENS NEXT?
Our support team will review your message and get back to you via email as soon as possible.

This is an automated message. Please do not reply to this email.
    `;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Thank You for Contacting Us',
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/email/contact-auto-reply',
      method: 'POST',
      details: {
        recipient: email,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    // Enhanced error logging with detailed Resend API information
    const errorDetails = {
      recipient: email,
      recipientName: name,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      // Include any additional error properties from Resend
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/email/contact-auto-reply',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send contact auto-reply email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send email verification link to user
 */
export async function sendVerificationEmail(
  data: VerificationEmailData
): Promise<EmailResult> {
  try {
    const html = generateVerificationEmailHTML(data);
    const text = generateVerificationEmailText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/verification',
      method: 'POST',
      details: {
        recipient: data.to,
        recipientName: data.name,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    // Enhanced error logging with detailed Resend API information
    const errorDetails = {
      recipient: data.to,
      recipientName: data.name,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      // Include any additional error properties from Resend
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logError('Failed to send verification email', error, data.ip);

    console.error('Failed to send verification email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for verification email
 */
function generateVerificationEmailHTML(data: VerificationEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email Address</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Verify Your Email</h1>
    <p style="margin: 0; font-size: 18px;">Welcome, ${data.name}!</p>
  </div>

  <p>Thank you for creating an account. Please verify your email address by clicking the button below:</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.verificationUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Verify Email Address
    </a>
  </div>

  <p>Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
    ${data.verificationUrl}
  </p>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Important:</strong> This verification link will expire in 24 hours.</p>
  </div>

  <p style="color: #666; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for verification email
 */
function generateVerificationEmailText(data: VerificationEmailData): string {
  return `
VERIFY YOUR EMAIL ADDRESS

Welcome, ${data.name}!

Thank you for creating an account. Please verify your email address by clicking the link below:

${data.verificationUrl}

IMPORTANT: This verification link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

This is an automated message. Please do not reply to this email.
  `;
}

/**
 * Admin password reset email data
 */
export interface AdminPasswordResetData extends BaseEmailData {
  name: string;
  resetUrl: string;
  expiresAt: Date;
  ip?: string;
}

/**
 * Send admin password reset email with security warnings
 */
export async function sendAdminPasswordResetEmail(
  data: AdminPasswordResetData
): Promise<EmailResult> {
  try {
    const html = generateAdminPasswordResetHTML(data);
    const text = generateAdminPasswordResetText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/admin-password-reset',
      method: 'POST',
      details: {
        recipient: data.to,
        messageId: result.data?.id,
        expiresAt: data.expiresAt.toISOString(),
        from: FROM_EMAIL,
      },
      severity: 'high',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      recipient: data.to,
      recipientName: data.name,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/admin-password-reset',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'high',
    });

    console.error('Failed to send admin password reset email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for admin password reset email
 */
function generateAdminPasswordResetHTML(data: AdminPasswordResetData): string {
  const expiresInHours = Math.round((data.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Password Reset</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #1e293b; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Admin Password Reset</h1>
    <p style="margin: 0; font-size: 18px; color: #e2e8f0;">Security Alert</p>
  </div>

  <p>Hi ${data.name},</p>

  <p>We received a request to reset your admin password. If you didn't make this request, please ignore this email and contact the security team immediately.</p>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Important Security Information:</strong></p>
    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
      <li>This link expires in ${expiresInHours} hours</li>
      <li>The link can only be used once</li>
      <li>All your active sessions will be invalidated after reset</li>
      <li>This request came from IP: ${data.ip || 'Unknown'}</li>
    </ul>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.resetUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Reset Admin Password
    </a>
  </div>

  <p>Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
    ${data.resetUrl}
  </p>

  <div style="background-color: #fee2e2; padding: 15px; border-radius: 6px; border-left: 4px solid #ef4444; margin: 20px 0;">
    <p style="margin: 0;"><strong>Security Warning:</strong></p>
    <p style="margin: 10px 0 0 0;">Never share this link with anyone. If you suspect unauthorized access to your admin account, contact the security team immediately.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated security message. If you didn't request this reset, no action is needed.</p>
    <p>The reset link will expire automatically.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for admin password reset email
 */
function generateAdminPasswordResetText(data: AdminPasswordResetData): string {
  const expiresInHours = Math.round((data.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

  return `
ADMIN PASSWORD RESET

Hi ${data.name},

We received a request to reset your admin password. If you didn't make this request, please ignore this email and contact the security team immediately.

IMPORTANT SECURITY INFORMATION:
- This link expires in ${expiresInHours} hours
- The link can only be used once
- All your active sessions will be invalidated after reset
- This request came from IP: ${data.ip || 'Unknown'}

RESET YOUR PASSWORD:
${data.resetUrl}

SECURITY WARNING:
Never share this link with anyone. If you suspect unauthorized access to your admin account, contact the security team immediately.

This is an automated security message. If you didn't request this reset, no action is needed. The reset link will expire automatically.
  `;
}

/**
 * Customer password reset email data
 */
export interface PasswordResetEmailData {
  to: string;
  subject: string;
  name: string;
  resetUrl: string;
  ip?: string;
}

/**
 * Send customer password reset email
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData
): Promise<EmailResult> {
  try {
    const html = generatePasswordResetHTML(data);
    const text = generatePasswordResetText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/password-reset',
      method: 'POST',
      details: {
        recipient: data.to,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'medium',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      recipient: data.to,
      recipientName: data.name,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/password-reset',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'high',
    });

    console.error('Failed to send password reset email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for password reset email
 */
function generatePasswordResetHTML(data: PasswordResetEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Reset Your Password</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.name}!</p>
  </div>

  <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.resetUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Reset Password
    </a>
  </div>

  <p>Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
    ${data.resetUrl}
  </p>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Important:</strong> This password reset link will expire in 1 hour.</p>
  </div>

  <p style="color: #666; font-size: 14px;">If you didn't request a password reset, no action is needed. Your password will remain unchanged.</p>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for password reset email
 */
function generatePasswordResetText(data: PasswordResetEmailData): string {
  return `
RESET YOUR PASSWORD

Hi ${data.name}!

We received a request to reset your password. If you didn't make this request, you can safely ignore this email.

RESET YOUR PASSWORD:
${data.resetUrl}

IMPORTANT: This password reset link will expire in 1 hour.

If you didn't request a password reset, no action is needed. Your password will remain unchanged.

This is an automated message. Please do not reply to this email.
  `;
}

/**
 * Supplier password reset email data
 */
export interface SupplierPasswordResetData extends BaseEmailData {
  name: string;
  resetUrl: string;
  expiresAt: Date;
  ip?: string;
}

/**
 * Send supplier password reset email with security warnings
 */
export async function sendSupplierPasswordResetEmail(
  data: SupplierPasswordResetData
): Promise<EmailResult> {
  try {
    const html = generateSupplierPasswordResetHTML(data);
    const text = generateSupplierPasswordResetText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/supplier-password-reset',
      method: 'POST',
      details: {
        recipient: data.to,
        messageId: result.data?.id,
        expiresAt: data.expiresAt.toISOString(),
        from: FROM_EMAIL,
        user_type: 'supplier',
      },
      severity: 'high',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      recipient: data.to,
      recipientName: data.name,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/supplier-password-reset',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
        user_type: 'supplier',
      },
      severity: 'high',
    });

    console.error('Failed to send supplier password reset email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for supplier password reset email
 */
function generateSupplierPasswordResetHTML(data: SupplierPasswordResetData): string {
  const expiresInHours = Math.round((data.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Supplier Portal Password Reset</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #16a34a; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #ffffff; margin: 0 0 10px 0;">Supplier Portal Password Reset</h1>
    <p style="margin: 0; font-size: 18px; color: #dcfce7;">Security Alert</p>
  </div>

  <p>Hi ${data.name},</p>

  <p>We received a request to reset your supplier portal password. If you didn't make this request, please ignore this email and contact support immediately.</p>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Important Security Information:</strong></p>
    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
      <li>This link expires in ${expiresInHours} hours</li>
      <li>The link can only be used once</li>
      <li>All your active sessions will be invalidated after reset</li>
      <li>This request came from IP: ${data.ip || 'Unknown'}</li>
    </ul>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.resetUrl}"
       style="display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Reset Supplier Password
    </a>
  </div>

  <p>Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
    ${data.resetUrl}
  </p>

  <div style="background-color: #fee2e2; padding: 15px; border-radius: 6px; border-left: 4px solid #ef4444; margin: 20px 0;">
    <p style="margin: 0;"><strong>Security Warning:</strong></p>
    <p style="margin: 10px 0 0 0;">Never share this link with anyone. If you suspect unauthorized access to your supplier account, contact support immediately.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated security message. If you didn't request this reset, no action is needed.</p>
    <p>The reset link will expire automatically.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for supplier password reset email
 */
function generateSupplierPasswordResetText(data: SupplierPasswordResetData): string {
  const expiresInHours = Math.round((data.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

  return `
SUPPLIER PORTAL PASSWORD RESET

Hi ${data.name},

We received a request to reset your supplier portal password. If you didn't make this request, please ignore this email and contact support immediately.

IMPORTANT SECURITY INFORMATION:
- This link expires in ${expiresInHours} hours
- The link can only be used once
- All your active sessions will be invalidated after reset
- This request came from IP: ${data.ip || 'Unknown'}

RESET YOUR PASSWORD:
${data.resetUrl}

SECURITY WARNING:
Never share this link with anyone. If you suspect unauthorized access to your supplier account, contact support immediately.

This is an automated security message. If you didn't request this reset, no action is needed. The reset link will expire automatically.
  `;
}

/**
 * PO Approval Request email data
 */
export interface POApprovalRequestData {
  to: string;
  subject: string;
  poNumber: string;
  vendorName: string;
  submittedBy: string;
  submittedAt: string;
  totalAmount: number;
  approvalUrl: string;
  ip?: string;
  isResubmission?: boolean;
  changedFields?: string[];
}

/**
 * Send PO approval request notification to admin
 */
export async function sendPOApprovalRequest(
  data: POApprovalRequestData
): Promise<EmailResult> {
  try {
    const html = generatePOApprovalRequestHTML(data);
    const text = generatePOApprovalRequestText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/po-approval-request',
      method: 'POST',
      details: {
        poNumber: data.poNumber,
        recipient: data.to,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      poNumber: data.poNumber,
      recipient: data.to,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/po-approval-request',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send PO approval request email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for PO approval request email
 */
function generatePOApprovalRequestHTML(data: POApprovalRequestData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order Approval Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Purchase Order Approval Required</h1>
    <p style="margin: 0; font-size: 18px;">${data.isResubmission ? 'A purchase order has been edited and requires re-review.' : 'A new purchase order has been submitted for your approval.'}</p>
  </div>

  ${data.isResubmission ? `
  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
    <p style="margin: 0; color: #92400e; font-weight: bold;">⚠️ This PO has been edited and requires re-review.</p>
    ${data.changedFields && data.changedFields.length > 0 ? `<p style="margin: 10px 0 0 0; color: #92400e;">Changed fields: ${data.changedFields.join(', ')}</p>` : ''}
  </div>
  ` : ''}

  <div style="margin-bottom: 30px;">
    <p><strong>PO Number:</strong> ${data.poNumber}</p>
    <p><strong>Vendor:</strong> ${data.vendorName}</p>
    <p><strong>Submitted By:</strong> ${data.submittedBy}</p>
    <p><strong>${data.isResubmission ? 'Last Updated' : 'Submitted At'}:</strong> ${data.submittedAt}</p>
    <p><strong>Total Amount:</strong> ${formatCurrency(data.totalAmount)}</p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.approvalUrl}" 
       style="display: inline-block; background-color: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Review & Approve Purchase Order
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
    ${data.approvalUrl}
  </p>

  <div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; border-left: 4px solid #059669; margin-top: 30px;">
    <p style="margin: 0;"><strong>Action Required:</strong></p>
    <p style="margin: 10px 0 0 0;">Please review this purchase order and approve or reject it as appropriate.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for PO approval request email
 */
function generatePOApprovalRequestText(data: POApprovalRequestData): string {
  return `
PURCHASE ORDER APPROVAL REQUIRED

${data.isResubmission ? 'A purchase order has been edited and requires re-review.' : 'A new purchase order has been submitted for your approval.'}

${data.isResubmission ? `⚠️ THIS PO HAS BEEN EDITED AND REQUIRES RE-REVIEW
${data.changedFields && data.changedFields.length > 0 ? `Changed fields: ${data.changedFields.join(', ')}` : ''}

` : ''}PO Number: ${data.poNumber}
Vendor: ${data.vendorName}
Submitted By: ${data.submittedBy}
${data.isResubmission ? 'Last Updated' : 'Submitted At'}: ${data.submittedAt}
Total Amount: ${formatCurrency(data.totalAmount)}

REVIEW & APPROVE:
${data.approvalUrl}

ACTION REQUIRED: Please review this purchase order and approve or reject it as appropriate.

This is an automated message. Please do not reply to this email.
  `;
}

/**
 * Send order status update email to customer
 */
export async function sendOrderStatusUpdate(
  data: OrderStatusUpdateData
): Promise<EmailResult> {
  try {
    const html = generateOrderStatusUpdateHTML(data);
    const text = generateOrderStatusUpdateText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: data.subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/order-status-update',
      method: 'POST',
      details: {
        orderNumber: data.orderNumber,
        recipient: data.to,
        oldStatus: data.oldStatus,
        newStatus: data.newStatus,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      orderNumber: data.orderNumber,
      recipient: data.to,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/order-status-update',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send order status update email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for order status update email
 */
function generateOrderStatusUpdateHTML(data: OrderStatusUpdateData): string {
  const statusMessages: Record<string, { title: string; message: string; color: string }> = {
    processing: {
      title: 'Your Order is Being Processed',
      message: 'We\'ve received your order and are now preparing it for shipment.',
      color: '#0284c7',
    },
    shipped: {
      title: 'Your Order Has Shipped',
      message: 'Great news! Your order has been shipped and is on its way to you.',
      color: '#7c3aed',
    },
    delivered: {
      title: 'Your Order Has Been Delivered',
      message: 'Your order has been successfully delivered. We hope you enjoy your purchase!',
      color: '#059669',
    },
    cancelled: {
      title: 'Your Order Has Been Cancelled',
      message: 'Your order has been cancelled. If you have any questions, please contact our support team.',
      color: '#dc2626',
    },
  };

  const statusInfo = statusMessages[data.newStatus] || {
    title: 'Order Status Updated',
    message: `Your order status has been updated to ${data.newStatus}.`,
    color: '#64748b',
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status Update</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: ${statusInfo.color}; margin: 0 0 10px 0;">${statusInfo.title}</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.customerName}!</p>
  </div>

  <p>${statusInfo.message}</p>

  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid ${statusInfo.color}; margin: 20px 0;">
    <p style="margin: 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
    <p style="margin: 10px 0 0 0;"><strong>Status:</strong> ${data.newStatus.charAt(0).toUpperCase() + data.newStatus.slice(1)}</p>
    ${data.newStatus === 'shipped' && data.trackingNumber ? `
    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #cbd5e1;">
      <p style="margin: 0 0 8px 0;"><strong>Tracking Information:</strong></p>
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${statusInfo.color};">
        ${data.trackingNumber}
      </p>
      ${data.trackingCarrier ? `<p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">Carrier: ${data.trackingCarrier}</p>` : ''}
    </div>
    ` : ''}
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.orderUrl}"
       style="display: inline-block; background-color: ${statusInfo.color}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Order Details
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for order status update email
 */
function generateOrderStatusUpdateText(data: OrderStatusUpdateData): string {
  const statusMessages: Record<string, { title: string; message: string }> = {
    processing: {
      title: 'Your Order is Being Processed',
      message: 'We\'ve received your order and are now preparing it for shipment.',
    },
    shipped: {
      title: 'Your Order Has Shipped',
      message: 'Great news! Your order has been shipped and is on its way to you.',
    },
    delivered: {
      title: 'Your Order Has Been Delivered',
      message: 'Your order has been successfully delivered. We hope you enjoy your purchase!',
    },
    cancelled: {
      title: 'Your Order Has Been Cancelled',
      message: 'Your order has been cancelled. If you have any questions, please contact our support team.',
    },
  };

  const statusInfo = statusMessages[data.newStatus] || {
    title: 'Order Status Updated',
    message: `Your order status has been updated to ${data.newStatus}.`,
  };

  return `
${statusInfo.title}

Hi ${data.customerName}!

${statusInfo.message}

Order Number: ${data.orderNumber}
Status: ${data.newStatus.charAt(0).toUpperCase() + data.newStatus.slice(1)}
${data.newStatus === 'shipped' && data.trackingNumber ? `
Tracking Number: ${data.trackingNumber}
${data.trackingCarrier ? `Carrier: ${data.trackingCarrier}` : ''}
` : ''}

View Order Details: ${data.orderUrl}

This is an automated message. Please do not reply to this email.
  `;
}

/**
 * Helper function to validate email before sending
 */
/**
 * Product deletion request notification data
 */
export interface ProductDeletionRequestData {
  productId: string;
  productName: string;
  supplierName: string;
  supplierCompany: string;
  supplierEmail: string;
  approvalStatus: string;
  ip?: string;
}

/**
 * Send product deletion request notification to admin
 */
export async function sendProductDeletionRequestNotification(
  data: ProductDeletionRequestData
): Promise<EmailResult> {
  try {
    const html = generateProductDeletionRequestHTML(data);
    const text = generateProductDeletionRequestText(data);

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Product Deletion Request: ${data.productName}`,
      html,
      text,
      replyTo: data.supplierEmail,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/product-deletion-request',
      method: 'POST',
      details: {
        productId: data.productId,
        productName: data.productName,
        supplierEmail: data.supplierEmail,
        toEmail: ADMIN_EMAIL,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'medium',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      productId: data.productId,
      productName: data.productName,
      supplierEmail: data.supplierEmail,
      toEmail: ADMIN_EMAIL,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/product-deletion-request',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send product deletion request notification email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for product deletion request notification email
 */
function generateProductDeletionRequestHTML(data: ProductDeletionRequestData): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const productUrl = `${baseUrl}/admin/products/${data.productId}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Deletion Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #dc3545; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
    <h1 style="color: #dc3545; margin-top: 0;">Product Deletion Request</h1>
  </div>

  <p>A supplier has requested to delete a product from the store.</p>

  <div style="background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin: 20px 0;">
    <h2 style="margin-top: 0; color: #333;">Product Details</h2>
    <p><strong>Product Name:</strong> ${data.productName}</p>
    <p><strong>Product ID:</strong> ${data.productId}</p>
    <p><strong>Current Status:</strong> ${data.approvalStatus}</p>
  </div>

  <div style="background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin: 20px 0;">
    <h2 style="margin-top: 0; color: #333;">Supplier Information</h2>
    <p><strong>Supplier Name:</strong> ${data.supplierName}</p>
    <p><strong>Company:</strong> ${data.supplierCompany}</p>
    <p><strong>Email:</strong> ${data.supplierEmail}</p>
  </div>

  <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0;"><strong>⚠️ Action Required:</strong> Please review this deletion request in the admin panel.</p>
  </div>

  <div style="margin: 30px 0; text-align: center;">
    <a href="${productUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 5px;">View Product in Admin Panel</a>
  </div>

  <p style="color: #666; font-size: 14px; margin-top: 30px;">
    This is an automated notification. Please review the deletion request in the admin panel before approving.
  </p>
</body>
</html>
  `;
}

/**
 * Generate text version of product deletion request notification email
 */
function generateProductDeletionRequestText(data: ProductDeletionRequestData): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const productUrl = `${baseUrl}/admin/products/${data.productId}`;

  return `
PRODUCT DELETION REQUEST

A supplier has requested to delete a product from the store.

Product Details:
----------------
Product Name: ${data.productName}
Product ID: ${data.productId}
Current Status: ${data.approvalStatus}

Supplier Information:
---------------------
Supplier Name: ${data.supplierName}
Company: ${data.supplierCompany}
Email: ${data.supplierEmail}

⚠️ ACTION REQUIRED: Please review this deletion request in the admin panel.

View Product: ${productUrl}

This is an automated notification. Please review the deletion request in the admin panel before approving.
  `;
}

/**
 * Product deletion approval notification data
 */
export interface ProductDeletionApprovalData {
  productName: string;
  supplierEmail: string;
  supplierName: string;
  ip?: string;
}

/**
 * Send product deletion approval notification to supplier
 */
export async function sendProductDeletionApprovalNotification(
  data: ProductDeletionApprovalData
): Promise<EmailResult> {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Product Deletion Approved</h1>
  <p>Dear ${data.supplierName},</p>
  <p>Your request to delete the product <strong>${data.productName}</strong> has been approved.</p>
  <p>The product has been permanently removed from the store.</p>
  <p>If you have any questions, please contact support.</p>
</body>
</html>
    `;
    const text = `Product Deletion Approved\n\nDear ${data.supplierName},\n\nYour request to delete the product "${data.productName}" has been approved.\n\nThe product has been permanently removed from the store.\n\nIf you have any questions, please contact support.`;

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.supplierEmail,
      subject: `Product Deletion Approved: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send product deletion approval email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Product deletion rejection notification data
 */
export interface ProductDeletionRejectionData {
  productName: string;
  productId: string;
  supplierEmail: string;
  supplierName: string;
  reason: string;
  ip?: string;
}

/**
 * Send product deletion rejection notification to supplier
 */
export async function sendProductDeletionRejectionNotification(
  data: ProductDeletionRejectionData
): Promise<EmailResult> {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">Product Deletion Request Rejected</h1>
  <p>Dear ${data.supplierName},</p>
  <p>Your request to delete the product <strong>${data.productName}</strong> has been rejected.</p>
  ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
  <p>The product remains in the store. If you have any questions, please contact support.</p>
</body>
</html>
    `;
    const text = `Product Deletion Request Rejected\n\nDear ${data.supplierName},\n\nYour request to delete the product "${data.productName}" has been rejected.\n\n${data.reason ? `Reason: ${data.reason}\n\n` : ''}The product remains in the store. If you have any questions, please contact support.`;

    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.supplierEmail,
      subject: `Product Deletion Request Rejected: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send product deletion rejection email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function validateEmailAddress(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Send product assignment notification to supplier
 * When an admin assigns a product to a supplier for review
 */
export async function sendSupplierProductAssignmentEmail(
  supplierEmail: string,
  supplierName: string,
  productName: string,
  productId: string,
  appUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const productUrl = `${baseUrl}/supplier/products/${productId}`;

  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: FROM_EMAIL,
      to: supplierEmail,
      subject: `New Product Assigned: ${productName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Product Assignment</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 40px 0; text-align: center;">
                  <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background-color: #0EA5E9; border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">New Product Assignment</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                          Hello <strong>${supplierName}</strong>,
                        </p>
                        
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                          A new product has been assigned to you for review and setup:
                        </p>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-left: 4px solid #0EA5E9; border-radius: 4px;">
                          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #0EA5E9;">
                            ${productName}
                          </p>
                        </div>
                        
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                          Please review the product details and complete the following:
                        </p>
                        
                        <ul style="margin: 0 0 30px; padding-left: 20px; font-size: 16px; line-height: 1.8; color: #333333;">
                          <li>Set your supplier pricing</li>
                          <li>Configure inventory quantities</li>
                          <li>Upload required documents (SDS, labels)</li>
                        </ul>
                        
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${productUrl}" style="display: inline-block; padding: 14px 32px; background-color: #0EA5E9; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
                            Review Product
                          </a>
                        </div>
                        
                        <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.6; color: #666666;">
                          Once you've completed all required sections, submit the product for final approval.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; font-size: 14px; color: #666666;">
                          If you have any questions, please contact your administrator.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send product assignment email:', error);
    securityLogger.logError('Email sending failed', error, 'system');
    return { success: false, error: 'Failed to send email' };
  }
}

/**
 * Contract email data
 */
export interface ContractEmailData {
  to: string;
  recipientName: string;
  contractType: string;
  supplierCompany: string;
  effectiveDate: string;
  version: number;
  portalUrl?: string;
  customMessage?: string;
  cc?: string;
  pdfBuffer?: Buffer | Uint8Array;
  pdfFilename?: string;
  ip?: string;
}

/**
 * Send a contract email (for review, signature, or attorney review).
 * Optionally attaches the contract as a PDF.
 */
export async function sendContractEmail(
  data: ContractEmailData
): Promise<EmailResult> {
  try {
    const html = generateContractEmailHTML(data);
    const text = generateContractEmailText(data);

    const resend = getResendClient();

    const emailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      cc?: string;
      attachments?: Array<{ filename: string; content: Buffer }>;
    } = {
      from: FROM_EMAIL,
      to: data.to,
      subject: `${data.contractType} - ${data.supplierCompany} (v${data.version})`,
      html,
      text,
    };

    if (data.cc) {
      emailOptions.cc = data.cc;
    }

    if (data.pdfBuffer && data.pdfFilename) {
      emailOptions.attachments = [
        {
          filename: data.pdfFilename,
          content: Buffer.from(data.pdfBuffer),
        },
      ];
    }

    const result = await resend.emails.send(emailOptions);

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/contract',
      method: 'POST',
      details: {
        recipient: data.to,
        cc: data.cc || null,
        contractType: data.contractType,
        supplierCompany: data.supplierCompany,
        version: data.version,
        hasPdf: !!data.pdfBuffer,
        messageId: result.data?.id,
        from: FROM_EMAIL,
      },
      severity: 'low',
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorDetails = {
      recipient: data.to,
      contractType: data.contractType,
      supplierCompany: data.supplierCompany,
      from: FROM_EMAIL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ...(error && typeof error === 'object' ? { resendError: error } : {}),
    };

    securityLogger.logEvent({
      type: 'admin_action',
      ip: data.ip,
      path: '/email/contract',
      method: 'POST',
      details: {
        ...errorDetails,
        success: false,
      },
      severity: 'medium',
    });

    console.error('Failed to send contract email:', errorDetails);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send product submission notification to admin
 * When a supplier completes and submits a product for approval
 */
export async function sendSupplierProductSubmissionEmail(
  adminEmail: string,
  supplierName: string,
  productName: string,
  productId: string,
  appUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const productUrl = `${baseUrl}/admin/products/${productId}`;

  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmail || ADMIN_EMAIL,
      subject: `Product Submitted for Approval: ${productName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Product Submission</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 40px 0; text-align: center;">
                  <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background-color: #10B981; border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Product Submitted</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                          Hello Admin,
                        </p>
                        
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                          <strong>${supplierName}</strong> has completed their review and submitted a product for your approval:
                        </p>
                        
                        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-left: 4px solid: #10B981; border-radius: 4px;">
                          <p style="margin: 0 0 10px; font-size: 18px; font-weight: bold; color: #10B981;">
                            ${productName}
                          </p>
                          <p style="margin: 0; font-size: 14px; color: #666666;">
                            Submitted by: ${supplierName}
                          </p>
                        </div>
                        
                        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                          The supplier has completed:
                        </p>
                        
                        <ul style="margin: 0 0 30px; padding-left: 20px; font-size: 16px; line-height: 1.8; color: #333333;">
                          <li>Supplier pricing</li>
                          <li>Inventory configuration</li>
                          <li>Document uploads</li>
                        </ul>
                        
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${productUrl}" style="display: inline-block; padding: 14px 32px; background-color: #10B981; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
                            Review & Approve
                          </a>
                        </div>
                        
                        <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.6; color: #666666;">
                          Please review the product and approve or request changes.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0; font-size: 14px; color: #666666;">
                          This is an automated notification from your product management system.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send product submission email:', error);
    securityLogger.logError('Email sending failed', error, 'system');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML for contract email
 */
function generateContractEmailHTML(data: ContractEmailData): string {
  const portalSection = data.portalUrl
    ? `
  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.portalUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Contract in Portal
    </a>
  </div>
  <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
    ${data.portalUrl}
  </p>`
    : '';

  const customMessageSection = data.customMessage
    ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0; font-weight: bold; color: #0369a1;">Message from Innovative CropCare:</p>
    <p style="margin: 10px 0 0 0;">${data.customMessage.replace(/\n/g, '<br>')}</p>
  </div>`
    : '';

  const pdfNote = data.pdfBuffer
    ? '<p style="color: #059669; font-size: 14px;">A PDF copy of the contract is attached to this email.</p>'
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract for Review</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Contract for Review</h1>
    <p style="margin: 0; font-size: 18px;">Innovative CropCare, LLC</p>
  </div>

  <p>Dear ${data.recipientName},</p>

  <p>A contract has been prepared for your review. Please find the details below:</p>

  <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Contract Type:</strong> ${data.contractType}</p>
    <p style="margin: 5px 0;"><strong>Supplier:</strong> ${data.supplierCompany}</p>
    <p style="margin: 5px 0;"><strong>Effective Date:</strong> ${formatDate(data.effectiveDate)}</p>
    <p style="margin: 5px 0;"><strong>Version:</strong> ${data.version}</p>
  </div>

  ${customMessageSection}

  ${portalSection}

  ${pdfNote}

  <div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; border-left: 4px solid #059669; margin-top: 30px;">
    <p style="margin: 0;"><strong>Action Required:</strong></p>
    <p style="margin: 10px 0 0 0;">Please review this contract and provide your approval or feedback at your earliest convenience.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This email was sent by Innovative CropCare, LLC. Please do not reply directly to this email.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text for contract email
 */
function generateContractEmailText(data: ContractEmailData): string {
  const portalSection = data.portalUrl
    ? `\nView the contract in the portal:\n${data.portalUrl}\n`
    : '';

  const customMessageSection = data.customMessage
    ? `\nMessage from Innovative CropCare:\n${data.customMessage}\n`
    : '';

  const pdfNote = data.pdfBuffer
    ? '\nA PDF copy of the contract is attached to this email.\n'
    : '';

  return `
CONTRACT FOR REVIEW

Dear ${data.recipientName},

A contract has been prepared for your review. Please find the details below:

Contract Type: ${data.contractType}
Supplier: ${data.supplierCompany}
Effective Date: ${formatDate(data.effectiveDate)}
Version: ${data.version}
${customMessageSection}
${portalSection}
${pdfNote}
ACTION REQUIRED: Please review this contract and provide your approval or feedback at your earliest convenience.

This email was sent by Innovative CropCare, LLC. Please do not reply directly to this email.
  `;
}

// ─── Supplier Pending Task Notification Emails ───────────────────────────────

export interface SupplierLabelApprovalEmailData {
  to: string;
  supplierName: string;
  productName: string;
  productId: string;
  portalUrl?: string;
}

/**
 * Notify a supplier that a product label requires their approval.
 */
export async function sendSupplierLabelApprovalEmail(
  data: SupplierLabelApprovalEmailData
): Promise<EmailResult> {
  const portalUrl =
    data.portalUrl ||
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/approvals`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background-color: #f97316; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Label Approval Required</h1>
  </div>
  <div style="background-color: #fff7ed; padding: 30px; border: 1px solid #fed7aa; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${data.supplierName},</p>
    <p>A product label has been updated by Innovative CropCare and requires your review and approval.</p>
    <div style="background-color: white; padding: 16px; border-radius: 6px; border-left: 4px solid #f97316; margin: 20px 0;">
      <p style="margin: 0;"><strong>Product:</strong> ${data.productName}</p>
    </div>
    <p>Please log in to your supplier portal to review the updated label and provide your approval.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Review Label
      </a>
    </div>
    <div style="background-color: #fff; padding: 16px; border-radius: 6px; border-left: 4px solid #f97316; margin-top: 20px;">
      <p style="margin: 0;"><strong>Action Required:</strong> Please review and approve or reject the updated label at your earliest convenience.</p>
    </div>
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
      <p>This email was sent by Innovative CropCare, LLC. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
LABEL APPROVAL REQUIRED

Dear ${data.supplierName},

A product label has been updated by Innovative CropCare and requires your review and approval.

Product: ${data.productName}

Please log in to your supplier portal to review the updated label:
${portalUrl}

ACTION REQUIRED: Please review and approve or reject the updated label at your earliest convenience.

This email was sent by Innovative CropCare, LLC.
  `;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Action Required: Label Approval for "${data.productName}"`,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/lib/email',
      method: 'sendSupplierLabelApprovalEmail',
      details: { to: data.to, productId: data.productId },
      severity: 'low',
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send supplier label approval email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface SupplierContractSignatureEmailData {
  to: string;
  supplierName: string;
  contractType: string;
  contractId: string;
  version?: number;
  portalUrl?: string;
}

/**
 * Notify a supplier that a contract has been signed by admin and awaits their signature.
 */
export async function sendSupplierContractSignatureEmail(
  data: SupplierContractSignatureEmailData
): Promise<EmailResult> {
  const portalUrl =
    data.portalUrl ||
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/contracts`;

  const versionText = data.version ? ` (Version ${data.version})` : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background-color: #2563eb; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Contract Signature Required</h1>
  </div>
  <div style="background-color: #eff6ff; padding: 30px; border: 1px solid #bfdbfe; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${data.supplierName},</p>
    <p>Innovative CropCare has signed a contract and it is now ready for your signature.</p>
    <div style="background-color: white; padding: 16px; border-radius: 6px; border-left: 4px solid #2563eb; margin: 20px 0;">
      <p style="margin: 0;"><strong>Contract:</strong> ${data.contractType}${versionText}</p>
    </div>
    <p>Please log in to your supplier portal to review and sign the contract.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Review &amp; Sign Contract
      </a>
    </div>
    <div style="background-color: #fff; padding: 16px; border-radius: 6px; border-left: 4px solid #2563eb; margin-top: 20px;">
      <p style="margin: 0;"><strong>Action Required:</strong> Please review and sign this contract at your earliest convenience to activate the agreement.</p>
    </div>
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
      <p>This email was sent by Innovative CropCare, LLC. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
CONTRACT SIGNATURE REQUIRED

Dear ${data.supplierName},

Innovative CropCare has signed a contract and it is now ready for your signature.

Contract: ${data.contractType}${versionText}

Please log in to your supplier portal to review and sign the contract:
${portalUrl}

ACTION REQUIRED: Please review and sign this contract at your earliest convenience to activate the agreement.

This email was sent by Innovative CropCare, LLC.
  `;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Action Required: Sign Your ${data.contractType}${versionText}`,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/lib/email',
      method: 'sendSupplierContractSignatureEmail',
      details: { to: data.to, contractId: data.contractId },
      severity: 'low',
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send supplier contract signature email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface SupplierMarginApprovalEmailData {
  to: string;
  supplierName: string;
  productName: string;
  productId: string;
  proposedMargin?: number;
  portalUrl?: string;
}

/**
 * Notify a supplier that a new margin has been proposed and requires their approval.
 */
export async function sendSupplierMarginApprovalEmail(
  data: SupplierMarginApprovalEmailData
): Promise<EmailResult> {
  const portalUrl =
    data.portalUrl ||
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/supplier/products/${data.productId}/approve-margin`;

  const marginText = data.proposedMargin !== undefined ? `${data.proposedMargin}%` : 'a new margin';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background-color: #059669; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Margin Approval Required</h1>
  </div>
  <div style="background-color: #ecfdf5; padding: 30px; border: 1px solid #a7f3d0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${data.supplierName},</p>
    <p>Innovative CropCare has proposed ${marginText} for one of your products and it requires your approval.</p>
    <div style="background-color: white; padding: 16px; border-radius: 6px; border-left: 4px solid #059669; margin: 20px 0;">
      <p style="margin: 0;"><strong>Product:</strong> ${data.productName}</p>
      ${data.proposedMargin !== undefined ? `<p style="margin: 8px 0 0 0;"><strong>Proposed Margin:</strong> ${marginText}</p>` : ''}
    </div>
    <p>Please log in to your supplier portal to review the proposed margin and provide your decision.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Review Margin Proposal
      </a>
    </div>
    <div style="background-color: #fff; padding: 16px; border-radius: 6px; border-left: 4px solid #059669; margin-top: 20px;">
      <p style="margin: 0;"><strong>Action Required:</strong> Please review and approve or reject the proposed margin at your earliest convenience.</p>
    </div>
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
      <p>This email was sent by Innovative CropCare, LLC. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
MARGIN APPROVAL REQUIRED

Dear ${data.supplierName},

Innovative CropCare has proposed ${marginText} for one of your products and it requires your approval.

Product: ${data.productName}
${data.proposedMargin !== undefined ? `Proposed Margin: ${marginText}` : ''}

Please log in to your supplier portal to review the proposed margin:
${portalUrl}

ACTION REQUIRED: Please review and approve or reject the proposed margin at your earliest convenience.

This email was sent by Innovative CropCare, LLC.
  `;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Action Required: Margin Approval for "${data.productName}"`,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/lib/email',
      method: 'sendSupplierMarginApprovalEmail',
      details: { to: data.to, productId: data.productId },
      severity: 'low',
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send supplier margin approval email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ─── Contract Expiry Reminder ────────────────────────────────────────────────

export interface ContractExpiryReminderData {
  to: string;
  adminName: string;
  contracts: Array<{
    id: string;
    supplierCompany: string;
    contractType: string;
    expiryDate: string;
    daysUntilExpiry: number;
  }>;
  adminPortalUrl: string;
}

/**
 * Send a contract expiry reminder email to an admin with signature authority.
 * Lists all active contracts expiring within 30 days.
 */
export async function sendContractExpiryReminder(
  data: ContractExpiryReminderData
): Promise<EmailResult> {
  const contractRows = data.contracts
    .map(
      (c) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${c.supplierCompany}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${c.contractType}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${new Date(c.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:bold;color:${c.daysUntilExpiry <= 7 ? '#dc2626' : c.daysUntilExpiry <= 14 ? '#d97706' : '#059669'};">${c.daysUntilExpiry} day${c.daysUntilExpiry !== 1 ? 's' : ''}</td>
      </tr>`
    )
    .join('');

  const contractCount = data.contracts.length;
  const subject = `Contract Expiry Alert — ${contractCount} contract${contractCount !== 1 ? 's' : ''} expiring within 30 days`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,Helvetica,sans-serif;background-color:#f3f4f6;margin:0;padding:20px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background-color:#065f46;padding:24px 32px;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">Innovative CropCare, LLC</h1>
      <p style="color:#a7f3d0;margin:4px 0 0 0;font-size:14px;">Contract Expiry Reminder</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:#374151;font-size:16px;margin:0 0 8px 0;">Hello ${data.adminName},</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px 0;">
        The following <strong>${contractCount} active contract${contractCount !== 1 ? 's' : ''}</strong> will expire within the next 30 days and may require renewal or renegotiation.
      </p>

      <!-- Contracts Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <thead>
          <tr style="background-color:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Supplier</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Contract Type</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Expiry Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Days Remaining</th>
          </tr>
        </thead>
        <tbody>${contractRows}</tbody>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${data.adminPortalUrl}"
           style="display:inline-block;background-color:#065f46;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;">
          Review Contracts
        </a>
      </div>

      <p style="color:#6b7280;font-size:13px;margin:24px 0 0 0;">
        You are receiving this email because you have Signature Authority for supplier contracts at Innovative CropCare, LLC.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">Innovative CropCare, LLC &bull; This is an automated reminder.</p>
    </div>
  </div>
</body>
</html>`;

  const textRows = data.contracts
    .map((c) => `  - ${c.supplierCompany} | ${c.contractType} | Expires: ${new Date(c.expiryDate).toLocaleDateString('en-US')} | ${c.daysUntilExpiry} days remaining`)
    .join('\n');

  const text = `
CONTRACT EXPIRY REMINDER

Hello ${data.adminName},

The following ${contractCount} active contract${contractCount !== 1 ? 's' : ''} will expire within the next 30 days:

${textRows}

Review contracts: ${data.adminPortalUrl}

You are receiving this email because you have Signature Authority for supplier contracts at Innovative CropCare, LLC.
  `;

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject,
      html,
      text,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip: 'system',
      path: '/lib/email',
      method: 'sendContractExpiryReminder',
      details: { to: data.to, contractCount },
      severity: 'low',
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send contract expiry reminder:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
