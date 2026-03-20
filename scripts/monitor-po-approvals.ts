import { query } from '../lib/db';

/**
 * Monitoring script to check for PO approval system issues
 * Run this periodically (e.g., daily) to catch any problems early
 * 
 * Usage: pnpm exec dotenv -e .env.local -- npx tsx scripts/monitor-po-approvals.ts
 */

async function monitorPOApprovals() {
  console.log('📊 PO Approval System Health Check');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  const issues: string[] = [];
  
  try {
    // Check 1: Orphaned POs (should have approval but don't)
    console.log('\n1️⃣  Checking for orphaned POs...');
    
    const orphanedPOs = await query<{
      id: number;
      po_number: string;
      total_amount: string;
      status: string;
      created_at: string;
      buyer_name: string;
    }>(
      `SELECT po.id, po.po_number, po.total_amount, po.status, po.created_at, po.buyer_name
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
        console.log(`   - ${po.po_number} ($${Number(po.total_amount).toLocaleString()}) - Created: ${po.created_at}`);
      });
      issues.push(`${orphanedPOs.length} orphaned PO(s) need approval requests`);
    }
    
    // Check 2: Database trigger status
    console.log('\n2️⃣  Checking database trigger...');
    
    const triggers = await query<{
      trigger_name: string;
      event_manipulation: string;
      action_timing: string;
      event_object_table: string;
    }>(
      `SELECT trigger_name, event_manipulation, action_timing, event_object_table
       FROM information_schema.triggers
       WHERE trigger_name = 'trigger_create_po_approval_request'
       AND event_object_table = 'purchase_orders'`
    );
    
    if (triggers.length > 0) {
      console.log('✅ Trigger is active');
    } else {
      console.log('❌ Trigger is missing!');
      issues.push('Database trigger is missing or disabled');
    }
    
    // Check 3: Trigger function exists
    const functions = await query<{ proname: string }>(
      `SELECT proname FROM pg_proc WHERE proname = 'create_po_approval_request'`
    );
    
    if (functions.length > 0) {
      console.log('✅ Trigger function exists');
    } else {
      console.log('❌ Trigger function is missing!');
      issues.push('Trigger function create_po_approval_request() is missing');
    }
    
    // Check 4: Stale pending approvals (over 7 days old)
    console.log('\n3️⃣  Checking for stale approvals...');
    
    const staleApprovals = await query<{
      id: number;
      po_number: string;
      total_amount: string;
      requested_at: string;
      days_pending: number;
    }>(
      `SELECT 
        ar.id,
        po.po_number,
        po.total_amount,
        ar.requested_at,
        EXTRACT(DAY FROM NOW() - ar.requested_at) as days_pending
       FROM po_approval_requests ar
       JOIN purchase_orders po ON po.id = ar.purchase_order_id
       WHERE ar.status = 'PENDING'
         AND ar.requested_at < NOW() - INTERVAL '7 days'
       ORDER BY ar.requested_at ASC`
    );
    
    if (staleApprovals.length === 0) {
      console.log('✅ No stale approvals (>7 days)');
    } else {
      console.log(`⚠️  Found ${staleApprovals.length} stale approval(s):`);
      staleApprovals.forEach(approval => {
        console.log(`   - ${approval.po_number} ($${Number(approval.total_amount).toLocaleString()}) - Pending ${Math.floor(approval.days_pending)} days`);
      });
      issues.push(`${staleApprovals.length} approval(s) pending for over 7 days`);
    }
    
    // Check 5: Admin users without emails
    console.log('\n4️⃣  Checking admin email configuration...');
    
    const adminsWithoutEmail = await query<{
      id: string;
      name: string;
    }>(
      `SELECT id, name FROM admin_users WHERE email IS NULL OR email = ''`
    );
    
    if (adminsWithoutEmail.length === 0) {
      console.log('✅ All admin users have email addresses');
    } else {
      console.log(`⚠️  ${adminsWithoutEmail.length} admin(s) without email:`);
      adminsWithoutEmail.forEach(admin => {
        console.log(`   - ${admin.name} (ID: ${admin.id})`);
      });
      issues.push(`${adminsWithoutEmail.length} admin(s) cannot receive approval emails`);
    }
    
    // Check 6: Pending approvals statistics
    console.log('\n5️⃣  Approval statistics...');
    
    const stats = await query<{
      total_pending: number;
      total_value: string;
      assigned_count: number;
      unassigned_count: number;
    }>(
      `SELECT 
        COUNT(*) as total_pending,
        COALESCE(SUM(po.total_amount), 0) as total_value,
        COUNT(ar.assigned_to) FILTER (WHERE ar.assigned_to IS NOT NULL) as assigned_count,
        COUNT(*) FILTER (WHERE ar.assigned_to IS NULL) as unassigned_count
       FROM po_approval_requests ar
       JOIN purchase_orders po ON po.id = ar.purchase_order_id
       WHERE ar.status = 'PENDING'`
    );
    
    if (stats.length > 0) {
      const stat = stats[0];
      console.log(`   Total pending: ${stat.total_pending}`);
      console.log(`   Total value: $${Number(stat.total_value).toLocaleString()}`);
      console.log(`   Assigned: ${stat.assigned_count}`);
      console.log(`   Unassigned: ${stat.unassigned_count}`);
      
      if (stat.unassigned_count > 0) {
        issues.push(`${stat.unassigned_count} unassigned approval(s)`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 HEALTH CHECK SUMMARY');
    console.log('='.repeat(60));
    
    if (issues.length === 0) {
      console.log('\n✅ ALL CHECKS PASSED');
      console.log('The PO approval system is healthy.');
    } else {
      console.log(`\n⚠️  Found ${issues.length} issue(s):`);
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue}`);
      });
      console.log('\nRecommended Actions:');
      
      if (orphanedPOs.length > 0) {
        console.log('- Run: pnpm exec dotenv -e .env.local -- npx tsx scripts/fix-po-approval.ts');
      }
      
      if (triggers.length === 0 || functions.length === 0) {
        console.log('- Check database migrations are up to date');
        console.log('- Ensure migration 037 was applied successfully');
      }
      
      if (staleApprovals.length > 0) {
        console.log('- Follow up with admins to approve pending POs');
      }
      
      if (adminsWithoutEmail.length > 0) {
        console.log('- Update admin user records with email addresses');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Exit with error code if there are issues
    if (issues.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Error during health check:', error);
    throw error;
  }
}

// Run monitoring
monitorPOApprovals()
  .then(() => {
    console.log('✅ Health check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  });
