// This script is an alias for set-admin-password.ts
// Both scripts do the same thing: set/reset the password for an admin account

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { hashAdminPassword, generateSecurePassword } from '../lib/admin-password';

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

// Prompt for password input
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

loadEnv();

async function resetAdminPassword() {
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const flags = process.argv.slice(2).filter(arg => arg.startsWith('--'));
  
  const email = args[0];
  const generatePassword = flags.includes('--generate-password');

  if (!email) {
    console.error('Usage: pnpm tsx scripts/reset-admin-password.ts <email> [--generate-password]');
    console.error('');
    console.error('Arguments:');
    console.error('  email               The email of the admin account');
    console.error('  --generate-password Generate a random secure password');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm tsx scripts/reset-admin-password.ts admin@example.com');
    console.error('  pnpm tsx scripts/reset-admin-password.ts admin@example.com --generate-password');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log(`Looking for admin with email: ${email}`);

    // Find admin by email
    const adminResult = await pool.query(
      'SELECT id, email, name, role_id FROM admin_users WHERE email = $1',
      [email]
    );

    if (adminResult.rows.length === 0) {
      console.error(`Error: No admin found with email "${email}"`);
      console.error('Make sure the admin account exists first.');
      process.exit(1);
    }

    const admin = adminResult.rows[0];
    console.log(`Found admin: ${admin.name || admin.email} (ID: ${admin.id})`);

    // Get or generate admin password
    let adminPassword: string;
    if (generatePassword) {
      adminPassword = generateSecurePassword(20);
      console.log('');
      console.log('Generated secure password for admin portal.');
    } else {
      console.log('');
      adminPassword = await promptPassword('Enter new admin password (min 8 characters): ');
      if (adminPassword.length < 8) {
        console.error('Error: Password must be at least 8 characters');
        process.exit(1);
      }
      const confirmPassword = await promptPassword('Confirm new admin password: ');
      if (adminPassword !== confirmPassword) {
        console.error('Error: Passwords do not match');
        process.exit(1);
      }
    }

    // Hash the password
    const passwordHash = await hashAdminPassword(adminPassword);

    // Update admin password
    await pool.query(
      `UPDATE admin_users 
       SET password_hash = $1, password_set_at = NOW(), updated_at = NOW() 
       WHERE id = $2`,
      [passwordHash, admin.id]
    );

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ADMIN PASSWORD RESET SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Email:    ${admin.email}`);
    if (generatePassword) {
      console.log(`  Password: ${adminPassword}`);
      console.log('');
      console.log('  ⚠️  SAVE THIS PASSWORD - it will not be shown again!');
    }
    console.log('');
    console.log('  You can now log in to the admin panel at /admin/login');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();

