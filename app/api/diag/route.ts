import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/diag - Diagnose import chain issues
 * Tests which modules can be imported without hanging.
 * Use ?test=neon|pool|db|query to test specific imports.
 */
export async function GET(request: NextRequest) {
  const test = request.nextUrl.searchParams.get('test') || 'info';
  const results: Record<string, unknown> = { test, time: new Date().toISOString() };

  if (test === 'info') {
    results.instructions = {
      '?test=neon': 'Test @neondatabase/serverless import',
      '?test=pool': 'Test Pool creation (no connect)',
      '?test=db': 'Test lib/db import',
      '?test=query': 'Test actual DB query (SELECT 1)',
    };
    return NextResponse.json(results);
  }

  if (test === 'neon') {
    try {
      const startMs = Date.now();
      const mod = await import('@neondatabase/serverless');
      results.neonImport = {
        success: true,
        ms: Date.now() - startMs,
        exports: Object.keys(mod),
      };
    } catch (error) {
      results.neonImport = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return NextResponse.json(results);
  }

  if (test === 'pool') {
    try {
      const startMs = Date.now();
      const { Pool } = await import('@neondatabase/serverless');
      results.importMs = Date.now() - startMs;

      const poolStartMs = Date.now();
      const dbUrl = process.env.DATABASE_URL;
      results.hasDbUrl = !!dbUrl;
      results.dbUrlPrefix = dbUrl ? dbUrl.substring(0, 30) + '...' : 'NOT SET';

      const pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 5000 });
      results.poolCreated = { success: true, ms: Date.now() - poolStartMs };

      // Try to end the pool to clean up
      await pool.end();
      results.poolEnded = true;
    } catch (error) {
      results.poolError = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      };
    }
    return NextResponse.json(results);
  }

  if (test === 'db') {
    try {
      const startMs = Date.now();
      const dbMod = await import('@/lib/db');
      results.dbImport = {
        success: true,
        ms: Date.now() - startMs,
        exports: Object.keys(dbMod),
      };
    } catch (error) {
      results.dbImport = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      };
    }
    return NextResponse.json(results);
  }

  if (test === 'query') {
    try {
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      });

      const startMs = Date.now();
      const result = await pool.query('SELECT 1 as ok');
      results.query = {
        success: true,
        ms: Date.now() - startMs,
        rows: result.rows,
      };
      await pool.end();
    } catch (error) {
      results.query = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      };
    }
    return NextResponse.json(results);
  }

  if (test === 'tables') {
    try {
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      });

      const tables = [
        'products', 'orders', 'order_items', 'supplier_users',
        'supplier_sessions', 'product_margin_history', 'product_warehouses',
        'warehouses', 'contact_submissions', 'site_settings',
        'margin_approval_history', 'product_approval_history',
      ];

      const tableResults: Record<string, boolean> = {};
      for (const table of tables) {
        try {
          await pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
          tableResults[table] = true;
        } catch {
          tableResults[table] = false;
        }
      }

      // Check specific columns on products table
      const columnChecks: Record<string, boolean> = {};
      const columns = [
        'deleted_at', 'supplier_id', 'approval_status', 'margin_proposal_source',
        'supplier_margin_approval_status', 'margin_split_percentage',
        'icc_margin_percent', 'customer_margin_percent', 'margin_approval_status',
        'icc_available_quantity', 'label_url',
      ];
      for (const col of columns) {
        try {
          await pool.query(`SELECT ${col} FROM products LIMIT 0`);
          columnChecks[col] = true;
        } catch {
          columnChecks[col] = false;
        }
      }

      await pool.end();
      results.tables = tableResults;
      results.productColumns = columnChecks;
    } catch (error) {
      results.error = error instanceof Error ? error.message : String(error);
    }
    return NextResponse.json(results);
  }

  if (test === 'supplier') {
    const queryResults: Record<string, { success: boolean; ms: number; error?: string; rows?: number }> = {};
    try {
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 8000,
      });

      // Test 1: supplier_sessions table
      try {
        const s = Date.now();
        const r = await pool.query('SELECT COUNT(*) FROM supplier_sessions');
        queryResults['supplier_sessions_count'] = { success: true, ms: Date.now() - s, rows: r.rows[0]?.count };
      } catch (e) {
        queryResults['supplier_sessions_count'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 2: Dashboard product stats query
      try {
        const s = Date.now();
        const r = await pool.query(`SELECT COUNT(*) as total FROM products WHERE deleted_at IS NULL LIMIT 1`);
        queryResults['dashboard_product_stats'] = { success: true, ms: Date.now() - s, rows: r.rows[0]?.total };
      } catch (e) {
        queryResults['dashboard_product_stats'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 3: Dashboard order stats (JOIN query)
      try {
        const s = Date.now();
        await pool.query(`SELECT COUNT(DISTINCT o.id) as c FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE p.deleted_at IS NULL LIMIT 1`);
        queryResults['dashboard_order_join'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['dashboard_order_join'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 4: product_margin_history table
      try {
        const s = Date.now();
        await pool.query(`SELECT COUNT(*) FROM product_margin_history LIMIT 1`);
        queryResults['product_margin_history'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['product_margin_history'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 5: product_warehouses + warehouses JOIN
      try {
        const s = Date.now();
        await pool.query(`SELECT pw.warehouse_id, w.name FROM product_warehouses pw JOIN warehouses w ON w.id = pw.warehouse_id LIMIT 1`);
        queryResults['product_warehouses_join'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['product_warehouses_join'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 6: margin_proposal_source column
      try {
        const s = Date.now();
        await pool.query(`SELECT margin_proposal_source, supplier_margin_approval_status FROM products LIMIT 1`);
        queryResults['margin_proposal_columns'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['margin_proposal_columns'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      await pool.end();
    } catch (error) {
      results.connectionError = error instanceof Error ? error.message : String(error);
    }
    results.queries = queryResults;
    return NextResponse.json(results);
  }

  if (test === 'admin') {
    const queryResults: Record<string, { success: boolean; ms: number; error?: string; count?: number }> = {};
    try {
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 8000,
      });

      // Test 1: Admin products page main query (SELECT p.*)
      try {
        const s = Date.now();
        const r = await pool.query(
          `SELECT p.*, su.name as supplier_name, su.company_name as supplier_company
           FROM products p
           LEFT JOIN supplier_users su ON su.id = p.supplier_id
           WHERE p.deleted_at IS NULL
             AND (p.approval_status IS NULL OR p.approval_status != 'rejected')
           LIMIT 1`
        );
        queryResults['admin_products_query'] = { success: true, ms: Date.now() - s, count: r.rowCount ?? 0 };
      } catch (e) {
        queryResults['admin_products_query'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 2: Warehouse inventory query
      try {
        const s = Date.now();
        await pool.query(
          `SELECT pw.product_id, pw.warehouse_id, w.name as warehouse_name, pw.inventory_count
           FROM product_warehouses pw
           JOIN warehouses w ON w.id = pw.warehouse_id
           LIMIT 1`
        );
        queryResults['admin_warehouse_query'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['admin_warehouse_query'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 3: Orders page query
      try {
        const s = Date.now();
        await pool.query(
          `SELECT o.*, u.email as user_email, u.name as user_name
           FROM orders o
           JOIN "user" u ON u.id = o.user_id
           LIMIT 1`
        );
        queryResults['admin_orders_query'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['admin_orders_query'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 4: Customers page query (user_invoices + user_profiles)
      try {
        const s = Date.now();
        await pool.query(
          `SELECT ui.id FROM user_invoices ui
           INNER JOIN "user" u ON u.id = ui.user_id
           LIMIT 1`
        );
        queryResults['admin_customers_query'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['admin_customers_query'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 5: user_profiles table exists
      try {
        const s = Date.now();
        await pool.query('SELECT 1 FROM user_profiles LIMIT 0');
        queryResults['user_profiles_table'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['user_profiles_table'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 6: user_invoices table exists
      try {
        const s = Date.now();
        await pool.query('SELECT 1 FROM user_invoices LIMIT 0');
        queryResults['user_invoices_table'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['user_invoices_table'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 7: admin_audit_log table
      try {
        const s = Date.now();
        await pool.query('SELECT 1 FROM admin_audit_log LIMIT 0');
        queryResults['admin_audit_log_table'] = { success: true, ms: Date.now() - s };
      } catch (e) {
        queryResults['admin_audit_log_table'] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }

      // Test 8: Additional product columns that might be missing
      const extraCols = ['msrp', 'cost', 'full_description', 'sds_url', 'admin_label_url', 'documents', 'features', 'specifications', 'approved_states', 'restricted_use'];
      for (const col of extraCols) {
        try {
          await pool.query(`SELECT ${col} FROM products LIMIT 0`);
          queryResults[`products.${col}`] = { success: true, ms: 0 };
        } catch (e) {
          queryResults[`products.${col}`] = { success: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
        }
      }

      await pool.end();
    } catch (error) {
      results.connectionError = error instanceof Error ? error.message : String(error);
    }
    results.queries = queryResults;
    return NextResponse.json(results);
  }

  if (test === 'supplier_columns') {
    const columnResults: Record<string, { success: boolean; error?: string }> = {};
    try {
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      });

      // Columns from migration 048_restructure_supplier_workflow.sql
      const supplierWorkflowCols = [
        'supplier_review_status',
        'supplier_pricing_completed',
        'supplier_inventory_completed',
        'supplier_documents_completed',
        'assigned_to_supplier_at',
      ];
      for (const col of supplierWorkflowCols) {
        try {
          await pool.query(`SELECT ${col} FROM products LIMIT 0`);
          columnResults[`products.${col}`] = { success: true };
        } catch (e) {
          columnResults[`products.${col}`] = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }

      // Check supplier_users columns from migrations 035 and 037
      const supplierUserCols = ['tax_exempt', 'address_street', 'address_city', 'address_state', 'address_zip'];
      for (const col of supplierUserCols) {
        try {
          await pool.query(`SELECT ${col} FROM supplier_users LIMIT 0`);
          columnResults[`supplier_users.${col}`] = { success: true };
        } catch (e) {
          columnResults[`supplier_users.${col}`] = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }

      // Check deletion_requested_at on products (used by DELETE /api/supplier/products/[id])
      try {
        await pool.query(`SELECT deletion_requested_at FROM products LIMIT 0`);
        columnResults['products.deletion_requested_at'] = { success: true };
      } catch (e) {
        columnResults['products.deletion_requested_at'] = { success: false, error: e instanceof Error ? e.message : String(e) };
      }

      await pool.end();
    } catch (error) {
      results.connectionError = error instanceof Error ? error.message : String(error);
    }
    results.columns = columnResults;
    return NextResponse.json(results);
  }

  return NextResponse.json({ error: 'Unknown test', test });
}
