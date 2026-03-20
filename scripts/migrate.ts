import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

// Generate MD5 checksum of file contents
function generateChecksum(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// Ensure the schema_migrations table exists
async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Get already executed migrations
async function getExecutedMigrations(pool: Pool): Promise<Map<string, string>> {
  const result = await pool.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM schema_migrations'
  );
  const migrations = new Map<string, string>();
  for (const row of result.rows) {
    migrations.set(row.filename, row.checksum);
  }
  return migrations;
}

// Record a migration as executed
async function recordMigration(pool: Pool, filename: string, checksum: string): Promise<void> {
  await pool.query(
    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
    [filename, checksum]
  );
}

loadEnv();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Running migrations...');
    
    // Ensure the migrations tracking table exists first
    await ensureMigrationsTable(pool);
    
    // Get list of already executed migrations
    const executedMigrations = await getExecutedMigrations(pool);
    
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    let executedCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      const checksum = generateChecksum(sql);
      
      // Check if this migration was already executed
      const existingChecksum = executedMigrations.get(file);
      
      if (existingChecksum) {
        // Migration was already executed - check if it was modified
        if (existingChecksum !== checksum) {
          console.warn(`⚠️  WARNING: Migration ${file} has been modified after execution!`);
          console.warn(`   Previous checksum: ${existingChecksum}`);
          console.warn(`   Current checksum:  ${checksum}`);
          console.warn('   Skipping to avoid data inconsistency. Manual intervention may be required.');
        } else {
          console.log(`Skipping (already executed): ${file}`);
        }
        skippedCount++;
        continue;
      }
      
      // Execute the migration
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
      
      // Record the migration
      await recordMigration(pool, file, checksum);
      console.log(`✓ Completed: ${file}`);
      executedCount++;
    }
    
    console.log('');
    console.log('Migration summary:');
    console.log(`  Executed: ${executedCount}`);
    console.log(`  Skipped:  ${skippedCount}`);
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
