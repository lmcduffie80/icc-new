import { query, queryOne } from '../lib/db';

const PO_NUMBER = 'PO-2026-000005';

async function diagnosePOApproval() {
  console.log('🔍 Diagnosing PO Approval System for', PO_NUMBER);
  console.log('='.repeat(60));
  
  try {
    // 1. Check PO details
    console.log('\n1️⃣ Checking Purchase Order Details...');
    const po = await queryOne<{
      id: number;
      po_number: string;
      total_amount: string;
      status: string;
      buyer_name: string;
      buyer_user_id: string | null;
      vendor_id: number;
      created_at: string;
    }>(
      `SELECT id, po_number, total_amount, status, buyer_name, buyer_user_id, vendor_id, created_at
       FROM purchase_orders 
       WHERE po_number = $1`,
      [PO_NUMBER]
    );
    
    if (!po) {
      console.log('❌ PO not found!');
      return;
    }
    
    console.log('✅ PO Found:');
    console.log(`   ID: ${po.id}`);
    console.log(`   Number: ${po.po_number}`);
    console.log(`   Amount: $${Number(po.total_amount).toLocaleString()}`);
    console.log(`   Status: ${po.status}`);
    console.log(`   Buyer: ${po.buyer_name}`);
    console.log(`   Buyer User ID: ${po.buyer_user_id || 'NULL'}`);
    console.log(`   Created: ${po.created_at}`);
    
    const needsApproval = Number(po.total_amount) >= 25000;
    console.log(`   Needs Approval: ${needsApproval ? '✅ YES (≥$25,000)' : '❌ NO (<$25,000)'}`);
    
    // 2. Check approval request
    console.log('\n2️⃣ Checking Approval Request...');
    const approvalRequests = await query<{
      id: number;
      purchase_order_id: number;
      requested_by: string | null;
      requested_at: string;
      status: string;
      approval_threshold: string | null;
      assigned_to: string | null;
    }>(
      `SELECT id, purchase_order_id, requested_by, requested_at, status, approval_threshold, assigned_to
       FROM po_approval_requests
       WHERE purchase_order_id = $1
       ORDER BY requested_at DESC`,
      [po.id]
    );
    
    if (approvalRequests.length === 0) {
      console.log('❌ No approval requests found for this PO!');
      console.log('   This is the root cause - approval request was never created.');
    } else {
      console.log(`✅ Found ${approvalRequests.length} approval request(s):`);
      approvalRequests.forEach((req, idx) => {
        console.log(`   Request ${idx + 1}:`);
        console.log(`     ID: ${req.id}`);
        console.log(`     Status: ${req.status}`);
        console.log(`     Requested By: ${req.requested_by || 'NULL'}`);
        console.log(`     Requested At: ${req.requested_at}`);
        console.log(`     Threshold: ${req.approval_threshold ? '$' + Number(req.approval_threshold).toLocaleString() : 'NULL'}`);
        console.log(`     Assigned To: ${req.assigned_to || 'NULL'}`);
      });
    }
    
    // 3. Check database triggers
    console.log('\n3️⃣ Checking Database Triggers...');
    const triggers = await query<{
      trigger_name: string;
      event_object_table: string;
      action_timing: string;
      event_manipulation: string;
    }>(
      `SELECT trigger_name, event_object_table, action_timing, event_manipulation
       FROM information_schema.triggers
       WHERE event_object_table = 'purchase_orders'
       AND trigger_name LIKE '%approval%'
       ORDER BY trigger_name`
    );
    
    if (triggers.length === 0) {
      console.log('❌ No approval-related triggers found on purchase_orders table!');
    } else {
      console.log(`✅ Found ${triggers.length} trigger(s):`);
      triggers.forEach(t => {
        console.log(`   ${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`);
      });
    }
    
    // Check if function exists
    const functions = await query<{ proname: string }>(
      `SELECT proname FROM pg_proc WHERE proname = 'create_po_approval_request'`
    );
    
    if (functions.length === 0) {
      console.log('❌ Function create_po_approval_request() not found!');
    } else {
      console.log('✅ Function create_po_approval_request() exists');
    }
    
    // 4. Check admin users
    console.log('\n4️⃣ Checking Admin Users...');
    const admins = await query<{
      id: string;
      name: string;
      email: string | null;
    }>(
      `SELECT id, name, email FROM admin_users ORDER BY name`
    );
    
    if (admins.length === 0) {
      console.log('❌ No admin users found!');
    } else {
      console.log(`✅ Found ${admins.length} admin user(s):`);
      admins.forEach(admin => {
        console.log(`   ${admin.name} (${admin.email || 'NO EMAIL'})`);
      });
      
      const adminsWithoutEmail = admins.filter(a => !a.email);
      if (adminsWithoutEmail.length > 0) {
        console.log(`⚠️  Warning: ${adminsWithoutEmail.length} admin(s) without email addresses`);
      }
    }
    
    // 5. Check for Lee McDuffie specifically
    console.log('\n5️⃣ Checking for Lee McDuffie (approver)...');
    const lee = await queryOne<{
      id: string;
      name: string;
      email: string | null;
    }>(
      `SELECT id, name, email FROM admin_users 
       WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(email) LIKE '%lee%'
       LIMIT 1`
    );
    
    if (!lee) {
      console.log('❌ Lee McDuffie not found in admin_users!');
    } else {
      console.log('✅ Lee McDuffie found:');
      console.log(`   ID: ${lee.id}`);
      console.log(`   Name: ${lee.name}`);
      console.log(`   Email: ${lee.email || 'NO EMAIL'}`);
    }
    
    // 6. Check for orphaned POs (should have approval but don't)
    console.log('\n6️⃣ Checking for other orphaned POs...');
    const orphanedPOs = await query<{
      id: number;
      po_number: string;
      total_amount: string;
      status: string;
      created_at: string;
    }>(
      `SELECT po.id, po.po_number, po.total_amount, po.status, po.created_at
       FROM purchase_orders po
       LEFT JOIN po_approval_requests ar ON ar.purchase_order_id = po.id
       WHERE po.total_amount >= 25000
         AND po.status = 'SUBMITTED'
         AND ar.id IS NULL
       ORDER BY po.created_at DESC
       LIMIT 10`
    );
    
    if (orphanedPOs.length === 0) {
      console.log('✅ No other orphaned POs found');
    } else {
      console.log(`⚠️  Found ${orphanedPOs.length} orphaned PO(s) that need approval requests:`);
      orphanedPOs.forEach(opo => {
        console.log(`   ${opo.po_number} - $${Number(opo.total_amount).toLocaleString()} - ${opo.status} - ${opo.created_at}`);
      });
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY & RECOMMENDATIONS:');
    console.log('='.repeat(60));
    
    if (approvalRequests.length === 0 && needsApproval) {
      console.log('❌ ISSUE CONFIRMED: Approval request is missing for this PO');
      console.log('');
      console.log('Recommended Actions:');
      console.log('1. Create approval request manually (see fix script)');
      console.log('2. Send notification emails to admins');
      console.log('3. Investigate why trigger did not fire');
      if (triggers.length === 0 || functions.length === 0) {
        console.log('4. Run migration 037 to create missing triggers/functions');
      }
    } else if (!needsApproval) {
      console.log('ℹ️  This PO does not require approval (under $25,000)');
    } else {
      console.log('✅ Approval request exists - issue may be elsewhere');
      console.log('   Check:');
      console.log('   - Admin user permissions');
      console.log('   - Email delivery logs');
      console.log('   - Frontend pending approvals query');
    }
    
  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
    throw error;
  }
}

// Run the diagnosis
diagnosePOApproval()
  .then(() => {
    console.log('\n✅ Diagnosis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnosis failed:', error);
    process.exit(1);
  });
