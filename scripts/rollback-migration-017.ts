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

async function rollback() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Rolling back migration 017...');
    
    // Drop the constraints added in migration 017
    await pool.query(`
      ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_standalone_only;
      ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_required_fields;
    `);
    console.log('✓ Dropped constraints');

    // Restore the old check constraint
    await pool.query(`
      ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_valid_account CHECK (
        user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL)
      );
    `);
    console.log('✓ Restored old constraint');

    // Remove the migration record
    await pool.query(`
      DELETE FROM schema_migrations WHERE filename = '017_enforce_standalone_admins.sql';
    `);
    console.log('✓ Removed migration record');

    console.log('');
    console.log('Migration 017 rolled back successfully!');
    console.log('');
    console.log('Note: Admin users data was NOT modified. If you had admins converted');
    console.log('to standalone with user_id = NULL, they remain that way.');
    console.log('You can now update the migration file and re-run it.');
  } catch (error) {
    console.error('Error rolling back:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

rollback();

