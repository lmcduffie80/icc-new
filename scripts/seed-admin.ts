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
    
    // Note: In a real terminal, you'd want to hide input
    // For simplicity, we show it here
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

loadEnv();

async function seedAdmin() {
  // Parse arguments, filtering out flags
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const flags = process.argv.slice(2).filter(arg => arg.startsWith('--'));
  
  const email = args[0];
  const adminName = args[1];
  const roleId = args[2] || 'super-admin';
  const generatePassword = flags.includes('--generate-password');

  if (!email || !adminName) {
    console.error('Usage: pnpm tsx scripts/seed-admin.ts <email> <name> [role-id] [--generate-password]');
    console.error('');
    console.error('Arguments:');
    console.error('  email               The email for the standalone admin account');
    console.error('  name                The display name for the admin');
    console.error('  role-id             Optional role ID (default: super-admin)');
    console.error('  --generate-password Generate a random secure password');
    console.error('');
    console.error('Available roles:');
    console.error('  super-admin  Full access to all features');
    console.error('  admin        Administrative access without system settings');
    console.error('  support      Customer support access');
    console.error('');
    console.error('Note: This creates a STANDALONE admin account, completely separate from customer accounts.');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm tsx scripts/seed-admin.ts admin@example.com "Admin User"');
    console.error('  pnpm tsx scripts/seed-admin.ts admin@example.com "John Doe" super-admin --generate-password');
    console.error('  pnpm tsx scripts/seed-admin.ts admin@example.com "Admin" --generate-password');
    console.error('  pnpm tsx scripts/seed-admin.ts support@example.com "Support Team" support');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log(`Creating standalone admin account for: ${email}`);

    // Check if admin with this email already exists
    const existingAdmin = await pool.query(
      'SELECT id, email, name, role_id FROM admin_users WHERE email = $1',
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      console.error(`Error: An admin with email "${email}" already exists.`);
      console.error('Use scripts/set-admin-password.ts to reset the password if needed.');
      process.exit(1);
    }

    // Check if role exists
    const roleResult = await pool.query(
      'SELECT id, name FROM admin_roles WHERE id = $1',
      [roleId]
    );

    if (roleResult.rows.length === 0) {
      console.error(`Error: No role found with ID "${roleId}"`);
      console.error('Run migrations first to create default roles.');
      process.exit(1);
    }

    const role = roleResult.rows[0];

    // Get or generate admin password
    let adminPassword: string;
    if (generatePassword) {
      adminPassword = generateSecurePassword(20);
      console.log('');
      console.log('Generated secure password for admin portal.');
    } else {
      console.log('');
      adminPassword = await promptPassword('Enter admin portal password (min 8 characters): ');
      if (adminPassword.length < 8) {
        console.error('Error: Password must be at least 8 characters');
        process.exit(1);
      }
      const confirmPassword = await promptPassword('Confirm admin portal password: ');
      if (adminPassword !== confirmPassword) {
        console.error('Error: Passwords do not match');
        process.exit(1);
      }
    }

    // Hash the password
    const passwordHash = await hashAdminPassword(adminPassword);

    // Create new standalone admin user
    await pool.query(
      `INSERT INTO admin_users (email, name, password_hash, password_set_at, role_id) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [email, adminName, passwordHash, roleId]
    );
    
    console.log(`Created standalone admin: ${adminName} (${email}) with role: ${role.name}`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  STANDALONE ADMIN ACCOUNT CREATED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Email:    ${email}`);
    console.log(`  Name:     ${adminName}`);
    console.log(`  Role:     ${role.name}`);
    if (generatePassword) {
      console.log(`  Password: ${adminPassword}`);
      console.log('');
      console.log('  ⚠️  SAVE THIS PASSWORD - it will not be shown again!');
    }
    console.log('');
    console.log('  The admin can now log in at /admin/login');
    console.log('  Note: This is a standalone admin account, completely separate');
    console.log('        from any customer accounts.');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();

