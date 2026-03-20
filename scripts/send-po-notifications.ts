import { query } from '../lib/db';
import { sendPOApprovalRequest } from '../lib/email';

interface POForNotification {
  id: number;
  po_number: string;
  vendor_name: string;
  buyer_name: string;
  total_amount: string;
  approval_request_id: number;
}

async function sendPONotifications() {
  console.log('📧 Sending PO Approval Notification Emails');
  console.log('='.repeat(60));
  
  try {
    // Find all pending approval requests that need notifications
    console.log('\n1️⃣  Finding POs with pending approvals...');
    
    const pendingPOs = await query<POForNotification>(
      `SELECT 
        po.id,
        po.po_number,
        COALESCE(v.name, 'Unknown Vendor') as vendor_name,
        po.buyer_name,
        po.total_amount,
        ar.id as approval_request_id
       FROM po_approval_requests ar
       JOIN purchase_orders po ON po.id = ar.purchase_order_id
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE ar.status = 'PENDING'
       AND po.po_number IN ('PO-2026-000004', 'PO-2026-000005')
       ORDER BY ar.requested_at DESC`
    );
    
    console.log(`Found ${pendingPOs.length} PO(s) needing notifications`);
    
    if (pendingPOs.length === 0) {
      console.log('✅ No POs need notifications');
      return;
    }
    
    // Get all admins with emails
    console.log('\n2️⃣  Getting admin email addresses...');
    
    const admins = await query<{
      id: string;
      name: string;
      email: string;
    }>(
      `SELECT id, name, email FROM admin_users WHERE email IS NOT NULL ORDER BY name`
    );
    
    if (admins.length === 0) {
      console.log('❌ No admin users with email addresses found!');
      return;
    }
    
    console.log(`Found ${admins.length} admin(s) with email addresses`);
    
    // Send emails for each PO
    console.log('\n3️⃣  Sending notification emails...');
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let totalEmailsSent = 0;
    let totalEmailsFailed = 0;
    
    for (const po of pendingPOs) {
      console.log(`\n📄 ${po.po_number} ($${Number(po.total_amount).toLocaleString()}):`);
      
      const approvalUrl = `${appUrl}/admin/purchase-orders/${po.id}/approve`;
      
      for (const admin of admins) {
        try {
          const result = await sendPOApprovalRequest({
            to: admin.email,
            subject: `Purchase Order ${po.po_number} Requires Approval`,
            poNumber: po.po_number,
            vendorName: po.vendor_name,
            submittedBy: po.buyer_name || 'Unknown',
            submittedAt: new Date().toLocaleString('en-US', {
              timeZone: 'America/New_York',
              dateStyle: 'medium',
              timeStyle: 'short'
            }),
            totalAmount: Number(po.total_amount),
            approvalUrl,
            ip: '127.0.0.1', // Script execution
            isResubmission: false,
            changedFields: [],
          });
          
          if (result.success) {
            console.log(`  ✅ ${admin.name} <${admin.email}> - Sent (ID: ${result.messageId})`);
            totalEmailsSent++;
          } else {
            console.log(`  ❌ ${admin.name} <${admin.email}> - Failed: ${result.error}`);
            totalEmailsFailed++;
          }
        } catch (error) {
          console.log(`  ❌ ${admin.name} <${admin.email}> - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          totalEmailsFailed++;
        }
        
        // Small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 EMAIL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total emails sent: ${totalEmailsSent}`);
    console.log(`Total emails failed: ${totalEmailsFailed}`);
    
    if (totalEmailsSent > 0) {
      console.log('\n✅ Notification emails sent successfully!');
      console.log('\nAdmins should receive emails with links to approve these POs:');
      pendingPOs.forEach(po => {
        console.log(`  - ${po.po_number}: ${appUrl}/admin/purchase-orders/${po.id}/approve`);
      });
    }
    
    if (totalEmailsFailed > 0) {
      console.log('\n⚠️  Some emails failed to send. Check the logs above for details.');
    }
    
  } catch (error) {
    console.error('\n❌ Error sending notifications:', error);
    throw error;
  }
}

// Run the notification sender
sendPONotifications()
  .then(() => {
    console.log('\n✅ Notification script complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Notification script failed:', error);
    process.exit(1);
  });
