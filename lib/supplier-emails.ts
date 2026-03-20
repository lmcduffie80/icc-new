import { Resend } from 'resend';

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';
const ICC_ADMIN_EMAIL = process.env.ICC_ADMIN_EMAIL;

// Lazy-load Resend client
let resendClient: Resend | null = null;
let resendInitialized = false;

function getResendClient(): Resend | null {
  if (resendInitialized) {
    return resendClient;
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[EMAIL] RESEND_API_KEY environment variable is not set - emails will be skipped');
      console.warn('[EMAIL] To enable email notifications, add RESEND_API_KEY to your environment variables');
      resendInitialized = true;
      return null;
    }
    resendClient = new Resend(apiKey);
    resendInitialized = true;
    console.log('[EMAIL] Resend client initialized successfully');
    return resendClient;
  } catch (error) {
    console.error('[EMAIL] Failed to initialize Resend client:', error);
    resendInitialized = true;
    return null;
  }
}

export interface ProductApprovalEmailData {
  to: string;
  supplierName: string;
  productName: string;
  productUrl: string;
  notes?: string;
}

export interface LabelModificationEmailData {
  to: string;
  supplierName: string;
  productName: string;
  adminLabelUrl: string;
  originalLabelUrl: string;
  approveUrl: string;
  rejectUrl: string;
  notes?: string;
}

export interface ProductRejectionEmailData {
  to: string;
  supplierName: string;
  productName: string;
  productUrl: string;
  notes?: string;
}

/**
 * Send product approval notification email to supplier
 */
export async function sendProductApprovalEmail(data: ProductApprovalEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Approved</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Product Approved</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p>Your product <strong>${data.productName}</strong> has been approved and is now published on the store.</p>

  ${data.notes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Admin Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>
  ` : ''}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.productUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Product
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
PRODUCT APPROVED

Hi ${data.supplierName}!

Your product ${data.productName} has been approved and is now published on the store.

${data.notes ? `\nAdmin Notes:\n${data.notes}\n` : ''}

View Product: ${data.productUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping product approval email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Product Approved: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send product approval email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send label modification notification email to supplier
 */
export async function sendLabelModificationEmail(data: LabelModificationEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Label Modification Required</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #f59e0b; margin: 0 0 10px 0;">Label Modification Required</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p>Your product <strong>${data.productName}</strong> has been reviewed by our admin team. The admin has modified the product label to meet store requirements.</p>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Action Required:</strong></p>
    <p style="margin: 10px 0 0 0;">Please review the modified label and approve or reject it. Your product will be published once you approve the label.</p>
  </div>

  ${data.notes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Admin Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>
  ` : ''}

  <div style="margin: 20px 0;">
    <p><strong>Original Label:</strong></p>
    <a href="${data.originalLabelUrl}" target="_blank" style="color: #0284c7; text-decoration: underline;">
      View Original Label
    </a>
  </div>

  <div style="margin: 20px 0;">
    <p><strong>Admin Modified Label:</strong></p>
    <a href="${data.adminLabelUrl}" target="_blank" style="color: #0284c7; text-decoration: underline;">
      View Modified Label
    </a>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.approveUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; margin-right: 10px;">
      Approve Label
    </a>
    <a href="${data.rejectUrl}"
       style="display: inline-block; background-color: #ef4444; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Reject Label
    </a>
  </div>

  <div style="background-color: #fee2e2; padding: 15px; border-radius: 6px; border-left: 4px solid #ef4444; margin: 20px 0;">
    <p style="margin: 0;"><strong>Important:</strong> If you reject the label, the product will be returned to pending status and you'll need to upload a new label or contact support.</p>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
LABEL MODIFICATION REQUIRED

Hi ${data.supplierName}!

Your product ${data.productName} has been reviewed by our admin team. The admin has modified the product label to meet store requirements.

ACTION REQUIRED: Please review the modified label and approve or reject it. Your product will be published once you approve the label.

${data.notes ? `\nAdmin Notes:\n${data.notes}\n` : ''}

Original Label: ${data.originalLabelUrl}
Admin Modified Label: ${data.adminLabelUrl}

Approve Label: ${data.approveUrl}
Reject Label: ${data.rejectUrl}

IMPORTANT: If you reject the label, the product will be returned to pending status and you'll need to upload a new label or contact support.

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping label modification email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Label Modification Required: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send label modification email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send product rejection notification email to supplier
 */
export async function sendProductRejectionEmail(data: ProductRejectionEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Rejected</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fee2e2; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #dc2626; margin: 0 0 10px 0;">Product Rejected</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p>We regret to inform you that your product <strong>${data.productName}</strong> has been rejected and will not be published on the store.</p>

  ${data.notes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Admin Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>
  ` : ''}

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Next Steps:</strong></p>
    <p style="margin: 10px 0 0 0;">Please review the rejection notes above and make the necessary changes. You can update your product and resubmit it for approval.</p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.productUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Product
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
PRODUCT REJECTED

Hi ${data.supplierName}!

We regret to inform you that your product ${data.productName} has been rejected and will not be published on the store.

${data.notes ? `\nAdmin Notes:\n${data.notes}\n` : ''}

NEXT STEPS: Please review the rejection notes above and make the necessary changes. You can update your product and resubmit it for approval.

View Product: ${data.productUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping product rejection email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Product Rejected: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send product rejection email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface MarginApprovalEmailData {
  to: string;
  supplierName: string;
  productName: string;
  marginPercentage: number;
  marginAmount: number;
  platformShare: number;
  supplierShare: number;
  productUrl: string;
  notes?: string;
}

export interface MarginRejectionEmailData {
  to: string;
  supplierName: string;
  productName: string;
  marginPercentage: number;
  updateUrl: string;
  notes: string;
}

/**
 * Send margin approval notification email to supplier
 */
export async function sendMarginApprovalEmail(data: MarginApprovalEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Margin Split Approved</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #059669; margin: 0 0 10px 0;">Margin Split Approved</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p>Your margin split for <strong>${data.productName}</strong> has been approved.</p>

  <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin: 0 0 15px 0; color: #166534;">Margin Breakdown</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">Total Margin</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7; text-align: right; font-weight: bold;">$${data.marginAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">Platform Split</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7; text-align: right;">${data.marginPercentage}%</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">Platform Share</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7; text-align: right;">$${data.platformShare.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: bold; color: #166534;">You Keep</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #166534;">$${data.supplierShare.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  ${data.notes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Admin Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>
  ` : ''}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.productUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Product
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
MARGIN SPLIT APPROVED

Hi ${data.supplierName}!

Your margin split for ${data.productName} has been approved.

MARGIN BREAKDOWN:
- Total Margin: $${data.marginAmount.toFixed(2)}
- Platform Split: ${data.marginPercentage}%
- Platform Share: $${data.platformShare.toFixed(2)}
- You Keep: $${data.supplierShare.toFixed(2)}

${data.notes ? `\nAdmin Notes:\n${data.notes}\n` : ''}

View Product: ${data.productUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping margin approval email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Margin Split Approved: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send margin approval email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface ICCMarginUpdateEmailData {
  to: string;
  supplierName: string;
  productName: string;
  productUrl: string;
  oldIccMarginPercent: number;
  newIccMarginPercent: number;
  oldCustomerMarginPercent: number;
  newCustomerMarginPercent: number;
  storePrice: number;
  supplierPrice: number;
  notes: string | null;
}

/**
 * Send ICC margin update notification email to supplier
 */
export async function sendICCMarginUpdateEmail(
  data: ICCMarginUpdateEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const oldIccAmount = (data.storePrice * data.oldIccMarginPercent) / 100;
    const newIccAmount = (data.storePrice * data.newIccMarginPercent) / 100;
    const oldCustomerAmount = (data.storePrice * data.oldCustomerMarginPercent) / 100;
    const newCustomerAmount = (data.storePrice * data.newCustomerMarginPercent) / 100;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ICC Margin Updated</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f0f9ff; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #0284c7; margin: 0 0 10px 0;">ICC Margin Updated</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p>The ICC margin for <strong>${data.productName}</strong> has been updated by an administrator.</p>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>What Changed:</strong></p>
    <p style="margin: 10px 0 0 0;">The platform (ICC) margin percentage has been adjusted. This affects how the margin between store price and supplier cost is split between ICC and customer savings.</p>
  </div>

  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin: 0 0 15px 0; color: #334155;">Margin Comparison</h3>
    
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #e2e8f0;">
          <th style="padding: 10px; text-align: left; border: 1px solid #cbd5e1;">Item</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #cbd5e1;">Previous</th>
          <th style="padding: 10px; text-align: right; border: 1px solid #cbd5e1;">New</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 10px; border: 1px solid #cbd5e1;">Store Price</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">$${data.storePrice.toFixed(2)}</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">$${data.storePrice.toFixed(2)}</td>
        </tr>
        <tr style="background-color: #fef3c7;">
          <td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>ICC Margin</strong></td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${data.oldIccMarginPercent.toFixed(1)}% (-$${oldIccAmount.toFixed(2)})</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;"><strong>${data.newIccMarginPercent.toFixed(1)}% (-$${newIccAmount.toFixed(2)})</strong></td>
        </tr>
        <tr style="background-color: #dcfce7;">
          <td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>Customer Savings</strong></td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${data.oldCustomerMarginPercent.toFixed(1)}% (-$${oldCustomerAmount.toFixed(2)})</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;"><strong>${data.newCustomerMarginPercent.toFixed(1)}% (-$${newCustomerAmount.toFixed(2)})</strong></td>
        </tr>
        <tr style="background-color: #e0f2fe;">
          <td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>Your Cost (Supplier)</strong></td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">$${data.supplierPrice.toFixed(2)}</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;"><strong>$${data.supplierPrice.toFixed(2)}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>

  ${data.notes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Admin Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>
  ` : ''}

  <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; border-left: 4px solid #059669; margin: 20px 0;">
    <p style="margin: 0;"><strong>Impact:</strong></p>
    <p style="margin: 10px 0 0 0;">Your supplier cost remains <strong>$${data.supplierPrice.toFixed(2)}</strong> per unit. The adjustment changes how the margin is split between ICC platform fees and customer savings.</p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.productUrl}"
       style="display: inline-block; background-color: #0284c7; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Product Details
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
ICC MARGIN UPDATED

Hi ${data.supplierName}!

The ICC margin for ${data.productName} has been updated by an administrator.

WHAT CHANGED: The platform (ICC) margin percentage has been adjusted. This affects how the margin between store price and supplier cost is split between ICC and customer savings.

MARGIN COMPARISON:
                        Previous                New
Store Price:            $${data.storePrice.toFixed(2)}             $${data.storePrice.toFixed(2)}
ICC Margin:             ${data.oldIccMarginPercent.toFixed(1)}% (-$${oldIccAmount.toFixed(2)})    ${data.newIccMarginPercent.toFixed(1)}% (-$${newIccAmount.toFixed(2)})
Customer Savings:       ${data.oldCustomerMarginPercent.toFixed(1)}% (-$${oldCustomerAmount.toFixed(2)})    ${data.newCustomerMarginPercent.toFixed(1)}% (-$${newCustomerAmount.toFixed(2)})
Your Cost (Supplier):   $${data.supplierPrice.toFixed(2)}             $${data.supplierPrice.toFixed(2)}

${data.notes ? `\nAdmin Notes:\n${data.notes}\n` : ''}

IMPACT: Your supplier cost remains $${data.supplierPrice.toFixed(2)} per unit. The adjustment changes how the margin is split between ICC platform fees and customer savings.

View Product Details: ${data.productUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping ICC margin update email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `ICC Margin Updated: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send ICC margin update email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send margin rejection notification email to supplier
 */
export async function sendMarginRejectionEmail(data: MarginRejectionEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Margin Split Rejected</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fee2e2; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #dc2626; margin: 0 0 10px 0;">Margin Split Rejected</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p>Your margin split of <strong>${data.marginPercentage}%</strong> for <strong>${data.productName}</strong> has been rejected.</p>

  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Rejection Reason:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Next Steps:</strong></p>
    <p style="margin: 10px 0 0 0;">Please update your margin split percentage and resubmit for approval. Your product will be published once both the product and margin are approved.</p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.updateUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Update Margin Split
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
MARGIN SPLIT REJECTED

Hi ${data.supplierName}!

Your margin split of ${data.marginPercentage}% for ${data.productName} has been rejected.

REJECTION REASON:
${data.notes}

NEXT STEPS: Please update your margin split percentage and resubmit for approval. Your product will be published once both the product and margin are approved.

Update Margin Split: ${data.updateUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping margin rejection email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Margin Split Rejected: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send margin rejection email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface AdminMarginProposalEmailData {
  to: string;
  supplierName: string;
  productName: string;
  proposedMarginPercent: number;
  marginBreakdown: {
    storePrice: number;
    supplierPrice: number;
    margin: number;
    platformShare: number;
    supplierKeeps: number;
  };
  approvalUrl: string;
  proposedByAdmin: string;
  notes?: string;
}

/**
 * Send admin margin proposal email to supplier for approval
 */
export async function sendAdminMarginProposalEmail(data: AdminMarginProposalEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Margin Approval Requested</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f0f9ff; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #0284c7; margin: 0 0 10px 0;">Margin Approval Requested</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.supplierName}!</p>
  </div>

  <p><strong>${data.proposedByAdmin}</strong> has proposed a new margin split for your product <strong>${data.productName}</strong>.</p>

  ${data.notes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Admin Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.notes}</p>
  </div>
  ` : ''}

  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">Proposed Margin Breakdown</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #666;">Store Price:</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right; font-weight: bold;">$${data.marginBreakdown.storePrice.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; color: #666;">Your Cost:</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right; font-weight: bold;">$${data.marginBreakdown.supplierPrice.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 2px solid #333; color: #666;">Total Margin:</td>
        <td style="padding: 8px 0; border-bottom: 2px solid #333; text-align: right; font-weight: bold; color: #059669;">$${data.marginBreakdown.margin.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0 8px 0; color: #0284c7; font-weight: 500;">Platform Share (${data.proposedMarginPercent.toFixed(1)}%):</td>
        <td style="padding: 12px 0 8px 0; text-align: right; font-weight: bold; color: #0284c7;">$${data.marginBreakdown.platformShare.toFixed(2)}</td>
      </tr>
      <tr style="background-color: #d1fae5;">
        <td style="padding: 12px; border-radius: 6px; font-weight: bold; font-size: 16px;">You Keep:</td>
        <td style="padding: 12px; border-radius: 6px; text-align: right; font-weight: bold; font-size: 18px; color: #059669;">$${data.marginBreakdown.supplierKeeps.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Action Required:</strong></p>
    <p style="margin: 10px 0 0 0;">Please review and approve or reject this margin proposal. The product will remain in pending status until you approve the margin.</p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.approvalUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      Review Margin Proposal
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
MARGIN APPROVAL REQUESTED

Hi ${data.supplierName}!

${data.proposedByAdmin} has proposed a new margin split for your product ${data.productName}.

${data.notes ? `\nAdmin Notes:\n${data.notes}\n` : ''}

PROPOSED MARGIN BREAKDOWN:
- Store Price: $${data.marginBreakdown.storePrice.toFixed(2)}
- Your Cost: $${data.marginBreakdown.supplierPrice.toFixed(2)}
- Total Margin: $${data.marginBreakdown.margin.toFixed(2)}
- Platform Share (${data.proposedMarginPercent.toFixed(1)}%): $${data.marginBreakdown.platformShare.toFixed(2)}
- YOU KEEP: $${data.marginBreakdown.supplierKeeps.toFixed(2)}

ACTION REQUIRED: Please review and approve or reject this margin proposal. The product will remain in pending status until you approve the margin.

Review Margin Proposal: ${data.approvalUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    if (!resend) {
      console.warn('[EMAIL] Resend client not initialized - skipping email');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      bcc: ICC_ADMIN_EMAIL || undefined,
      subject: `Margin Approval Requested: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send admin margin proposal email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface SupplierMarginDecisionEmailData {
  to: string;
  adminName: string;
  productName: string;
  decision: 'approved' | 'rejected';
  marginPercent: number;
  supplierName: string;
  supplierNotes?: string;
  productUrl: string;
}

/**
 * Send supplier margin decision email to admin
 */
export async function sendSupplierMarginDecisionEmail(data: SupplierMarginDecisionEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const isApproved = data.decision === 'approved';
  
  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Margin ${isApproved ? 'Approved' : 'Rejected'} by Supplier</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${isApproved ? '#d1fae5' : '#fee2e2'}; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: ${isApproved ? '#059669' : '#dc2626'}; margin: 0 0 10px 0;">Margin ${isApproved ? 'Approved' : 'Rejected'} by Supplier</h1>
    <p style="margin: 0; font-size: 18px;">Hi ${data.adminName}!</p>
  </div>

  <p><strong>${data.supplierName}</strong> has <strong>${data.decision}</strong> your proposed margin of <strong>${data.marginPercent.toFixed(1)}%</strong> for <strong>${data.productName}</strong>.</p>

  ${data.supplierNotes ? `
  <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin: 20px 0;">
    <p style="margin: 0;"><strong>Supplier Notes:</strong></p>
    <p style="margin: 10px 0 0 0;">${data.supplierNotes}</p>
  </div>
  ` : ''}

  ${isApproved ? `
  <div style="background-color: #d1fae5; padding: 15px; border-radius: 6px; border-left: 4px solid #059669; margin: 20px 0;">
    <p style="margin: 0;"><strong>Next Steps:</strong></p>
    <p style="margin: 10px 0 0 0;">The margin has been approved and applied to the product. The product will be published once all approval requirements are met.</p>
  </div>
  ` : `
  <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
    <p style="margin: 0;"><strong>Next Steps:</strong></p>
    <p style="margin: 10px 0 0 0;">You may need to propose a different margin split or discuss with the supplier to reach an agreement.</p>
  </div>
  `}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${data.productUrl}"
       style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
      View Product
    </a>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
    <p>This is an automated message. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `;

    const text = `
MARGIN ${isApproved ? 'APPROVED' : 'REJECTED'} BY SUPPLIER

Hi ${data.adminName}!

${data.supplierName} has ${data.decision} your proposed margin of ${data.marginPercent.toFixed(1)}% for ${data.productName}.

${data.supplierNotes ? `\nSupplier Notes:\n${data.supplierNotes}\n` : ''}

${isApproved 
  ? '\nNEXT STEPS: The margin has been approved and applied to the product. The product will be published once all approval requirements are met.' 
  : '\nNEXT STEPS: You may need to propose a different margin split or discuss with the supplier to reach an agreement.'}

View Product: ${data.productUrl}

This is an automated message. Please do not reply to this email.
    `;

    const resend = getResendClient();
    
    if (!resend) {
      console.warn('[EMAIL] Skipping supplier margin decision email - Resend client not available');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject: `Margin ${isApproved ? 'Approved' : 'Rejected'}: ${data.productName}`,
      html,
      text,
    });

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    console.error('Failed to send supplier margin decision email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
