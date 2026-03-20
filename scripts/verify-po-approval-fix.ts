import { query } from '../lib/db';

async function verifyFix() {
  console.log('✅ Verifying PO Approval System Fix');
  console.log('='.repeat(60));
  
  try {
    // Check pending approvals (same query as the UI)
    console.log('\n1️⃣  Checking pending approvals (UI query)...');
    
    const pendingApprovals = await query<{
      id: number;
      purchase_order_id: number;
      po_number: string;
      vendor_name: string | null;
      buyer_name: string;
      total_amount: string;
      requested_by: string | null;
      requested_at: string;
      status: string;
      assigned_to: string | null;
      assigned_to_name: string | null;
      approval_threshold: string | null;
    }>(
      `SELECT 
        ar.id,
        ar.purchase_order_id,
        po.po_number,
        v.name as vendor_name,
        po.buyer_name,
        po.total_amount,
        ar.requested_by,
        ar.requested_at,
        ar.status,
        ar.assigned_to,
        ar.approval_threshold,
        au.name as assigned_to_name
      FROM po_approval_requests ar
      JOIN purchase_orders po ON po.id = ar.purchase_order_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN admin_users au ON au.id = ar.assigned_to
      WHERE ar.status = 'PENDING'
      ORDER BY ar.requested_at DESC`
    );
    
    console.log(`✅ Found ${pendingApprovals.length} pending approval(s)`);
    
    if (pendingApprovals.length > 0) {
      console.log('\nPending Approvals:');
      pendingApprovals.forEach((approval, idx) => {
        console.log(`\n${idx + 1}. ${approval.po_number}`);
        console.log(`   Amount: $${Number(approval.total_amount).toLocaleString()}`);
        console.log(`   Vendor: ${approval.vendor_name || 'Unknown'}`);
        console.log(`   Buyer: ${approval.buyer_name}`);
        console.log(`   Status: ${approval.status}`);
        console.log(`   Assigned To: ${approval.assigned_to_name || 'Unassigned'}`);
        console.log(`   Threshold: ${approval.approval_threshold ? '$' + Number(approval.approval_threshold).toLocaleString() : 'N/A'}`);
        console.log(`   Requested: ${approval.requested_at}`);
      });
    }
    
    // Check if our specific POs are in the list
    console.log('\n2️⃣  Checking for PO-2026-000004 and PO-2026-000005...');
    
    const targetPOs = pendingApprovals.filter(
      a => a.po_number === 'PO-2026-000004' || a.po_number === 'PO-2026-000005'
    );
    
    if (targetPOs.length === 2) {
      console.log('✅ Both target POs found in pending approvals!');
      targetPOs.forEach(po => {
        console.log(`   ✓ ${po.po_number}`);
      });
    } else if (targetPOs.length === 1) {
      console.log(`⚠️  Only 1 target PO found: ${targetPOs[0].po_number}`);
    } else {
      console.log('❌ Target POs not found in pending approvals!');
    }
    
    // Check database trigger status
    console.log('\n3️⃣  Verifying database trigger...');
    
    const triggers = await query<{
      trigger_name: string;
      event_manipulation: string;
      action_timing: string;
    }>(
      `SELECT trigger_name, event_manipulation, action_timing
       FROM information_schema.triggers
       WHERE trigger_name = 'trigger_create_po_approval_request'
       AND event_object_table = 'purchase_orders'`
    );
    
    if (triggers.length > 0) {
      console.log('✅ Trigger exists and is active');
      console.log(`   ${triggers[0].trigger_name} (${triggers[0].action_timing} ${triggers[0].event_manipulation})`);
    } else {
      console.log('❌ Trigger not found!');
    }
    
    // Check for any remaining orphaned POs
    console.log('\n4️⃣  Checking for remaining orphaned POs...');
    
    const orphanedPOs = await query<{
      id: number;
      po_number: string;
      total_amount: string;
      status: string;
    }>(
      `SELECT po.id, po.po_number, po.total_amount, po.status
       FROM purchase_orders po
       LEFT JOIN po_approval_requests ar ON ar.purchase_order_id = po.id AND ar.status = 'PENDING'
       WHERE po.total_amount >= 25000
         AND po.status = 'SUBMITTED'
         AND ar.id IS NULL
       ORDER BY po.created_at DESC`
    );
    
    if (orphanedPOs.length === 0) {
      console.log('✅ No orphaned POs found');
    } else {
      console.log(`⚠️  Found ${orphanedPOs.length} orphaned PO(s):`);
      orphanedPOs.forEach(po => {
        console.log(`   - ${po.po_number} ($${Number(po.total_amount).toLocaleString()})`);
      });
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    
    const allChecks = [
      { name: 'Pending approvals exist', passed: pendingApprovals.length > 0 },
      { name: 'Target POs in list', passed: targetPOs.length === 2 },
      { name: 'Database trigger active', passed: triggers.length > 0 },
      { name: 'No orphaned POs', passed: orphanedPOs.length === 0 },
    ];
    
    const passedChecks = allChecks.filter(c => c.passed).length;
    const totalChecks = allChecks.length;
    
    console.log(`\nPassed: ${passedChecks}/${totalChecks} checks`);
    console.log('');
    
    allChecks.forEach(check => {
      console.log(`${check.passed ? '✅' : '❌'} ${check.name}`);
    });
    
    if (passedChecks === totalChecks) {
      console.log('\n🎉 ALL CHECKS PASSED!');
      console.log('\nThe PO approval system is now fully functional:');
      console.log('1. ✅ Pending approvals are visible in the database');
      console.log('2. ✅ Target POs (000004, 000005) are in the approval queue');
      console.log('3. ✅ Database trigger is active for future POs');
      console.log('4. ✅ No orphaned POs remaining');
      console.log('\nNext steps:');
      console.log('- Visit http://localhost:3000/admin/purchase-orders/approvals');
      console.log('- Verify POs appear in the UI');
      console.log('- Test the approval workflow');
      console.log('- Check your email for approval notifications');
    } else {
      console.log('\n⚠️  Some checks failed. Review the output above.');
    }
    
  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    throw error;
  }
}

// Run verification
verifyFix()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
