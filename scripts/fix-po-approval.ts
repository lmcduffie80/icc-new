import { query, queryOne } from '../lib/db';
import { Pool } from '@neondatabase/serverless';

async function fixPOApproval() {
  console.log('🔧 Fixing PO Approval System');
  console.log('='.repeat(60));
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Step 1: Reinstall the missing trigger
    console.log('\n1️⃣  Reinstalling database trigger...');
    
    // Drop existing trigger if it exists (in case it's corrupted)
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_create_po_approval_request ON purchase_orders;
    `);
    
    // Create the trigger
    await pool.query(`
      CREATE TRIGGER trigger_create_po_approval_request
        AFTER UPDATE ON purchase_orders
        FOR EACH ROW
        EXECUTE FUNCTION create_po_approval_request();
    `);
    
    console.log('✅ Trigger reinstalled successfully');
    
    // Verify trigger exists
    const trigger = await pool.query(`
      SELECT trigger_name, event_manipulation
      FROM information_schema.triggers
      WHERE trigger_name = 'trigger_create_po_approval_request'
      AND event_object_table = 'purchase_orders'
    `);
    
    if (trigger.rows.length > 0) {
      console.log('✅ Trigger verified in database');
    } else {
      console.log('❌ Warning: Trigger not found after creation');
    }
    
    // Step 2: Find all orphaned POs
    console.log('\n2️⃣  Finding orphaned POs...');
    
    const orphanedPOs = await query<{
      id: number;
      po_number: string;
      total_amount: string;
      status: string;
      buyer_user_id: string | null;
      buyer_name: string;
    }>(
      `SELECT po.id, po.po_number, po.total_amount, po.status, po.buyer_user_id, po.buyer_name
       FROM purchase_orders po
       LEFT JOIN po_approval_requests ar ON ar.purchase_order_id = po.id AND ar.status = 'PENDING'
       WHERE po.total_amount >= 25000
         AND po.status = 'SUBMITTED'
         AND ar.id IS NULL
       ORDER BY po.created_at DESC`
    );
    
    console.log(`Found ${orphanedPOs.length} orphaned PO(s)`);
    
    if (orphanedPOs.length === 0) {
      console.log('✅ No orphaned POs to fix');
      return;
    }
    
    // Step 3: Get Lee McDuffie's ID for assignment
    const lee = await queryOne<{ id: string }>(
      `SELECT id FROM admin_users 
       WHERE LOWER(name) LIKE '%lee%mcduffie%' OR LOWER(email) LIKE '%lee%'
       LIMIT 1`
    );
    
    if (!lee) {
      console.log('⚠️  Warning: Lee McDuffie not found, approvals will not be assigned');
    } else {
      console.log(`✅ Found Lee McDuffie (ID: ${lee.id})`);
    }
    
    // Step 4: Create approval requests for each orphaned PO
    console.log('\n3️⃣  Creating approval requests...');
    
    for (const po of orphanedPOs) {
      console.log(`\nProcessing ${po.po_number}...`);
      
      // Create approval request
      const result = await pool.query(
        `INSERT INTO po_approval_requests (
          purchase_order_id,
          requested_by,
          status,
          approval_threshold,
          assigned_to,
          requested_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id`,
        [
          po.id,
          po.buyer_user_id,
          'PENDING',
          25000.00,
          lee?.id || null
        ]
      );
      
      const approvalRequestId = result.rows[0].id;
      console.log(`  ✅ Created approval request (ID: ${approvalRequestId})`);
      
      // Log to approval history
      await pool.query(
        `INSERT INTO po_approval_history (
          purchase_order_id,
          action,
          admin_user_id,
          notes
        )
        VALUES ($1, $2, $3, $4)`,
        [
          po.id,
          'SUBMITTED',
          po.buyer_user_id,
          `Purchase order submitted for approval (over $25,000 threshold)${lee ? ' - Assigned to Lee McDuffie' : ''} - Created by fix script`
        ]
      );
      
      console.log(`  ✅ Added to approval history`);
    }
    
    // Step 5: Get admin emails for notification
    console.log('\n4️⃣  Getting admin email addresses...');
    
    const admins = await query<{
      id: string;
      name: string;
      email: string;
    }>(
      `SELECT id, name, email FROM admin_users WHERE email IS NOT NULL ORDER BY name`
    );
    
    console.log(`Found ${admins.length} admin(s) with email addresses:`);
    admins.forEach(admin => {
      console.log(`  - ${admin.name} <${admin.email}>`);
    });
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ FIX COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`\nFixed POs:`);
    orphanedPOs.forEach(po => {
      console.log(`  - ${po.po_number} ($${Number(po.total_amount).toLocaleString()})`);
    });
    
    console.log(`\nNext Steps:`);
    console.log(`1. Verify pending approvals appear at: /admin/purchase-orders/approvals`);
    console.log(`2. Send notification emails to admins (use send-po-notifications.ts)`);
    console.log(`3. Test the approval workflow`);
    
  } catch (error) {
    console.error('\n❌ Error during fix:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the fix
fixPOApproval()
  .then(() => {
    console.log('\n✅ Fix script complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fix script failed:', error);
    process.exit(1);
  });
