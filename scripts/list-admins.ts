import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env.local or .env
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
      console.log(`Loaded environment from ${file}`);
      return;
    }
  }
  console.warn('No .env.local or .env file found');
}

loadEnv();

async function listAdmins() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Listing all admin accounts...\n');

    const result = await pool.query(`
      SELECT 
        au.id,
        au.email,
        au.name,
        au.user_id,
        au.password_hash IS NOT NULL as has_password,
        au.password_set_at,
        ar.name as role_name,
        au.created_at
      FROM admin_users au
      JOIN admin_roles ar ON ar.id = au.role_id
      ORDER BY au.created_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('No admin accounts found.');
      console.log('\nTo create a new standalone admin, run:');
      console.log('  pnpm tsx scripts/seed-admin.ts <email> <name> [role-id] [--generate-password]');
      return;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ADMIN ACCOUNTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const admin of result.rows) {
      console.log(`  Email:        ${admin.email || 'N/A'}`);
      console.log(`  Name:         ${admin.name || 'N/A'}`);
      console.log(`  Role:         ${admin.role_name}`);
      console.log(`  Has Password: ${admin.has_password ? 'Yes' : 'NO - CANNOT LOGIN'}`);
      console.log(`  User ID:      ${admin.user_id || 'null (standalone)'}`);
      console.log(`  Created:      ${admin.created_at}`);
      
      if (!admin.has_password) {
        console.log(`\n  ⚠️  This admin needs a password! Run:`);
        console.log(`      pnpm tsx scripts/set-admin-password.ts ${admin.email}`);
      }
      
      console.log('\n' + '─'.repeat(63) + '\n');
    }

    console.log(`Total: ${result.rows.length} admin(s)\n`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

listAdmins();

