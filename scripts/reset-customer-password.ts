/**
 * Reset a customer (Better Auth) password by email.
 * Usage: pnpm exec tsx scripts/reset-customer-password.ts <email> <new-password>
 *
 * Better Auth stores passwords in the `account` table using scrypt:
 *   salt:hex(derivedKey)  — N=16384, r=16, p=1, dkLen=64
 */

import { Pool } from '@neondatabase/serverless';
import { randomBytes } from 'crypto';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function hashBetterAuthPassword(password: string): Promise<string> {
  const salt = bytesToHex(randomBytes(16));
  const normalizedPassword = password.normalize('NFKC');
  const derivedKey = await scryptAsync(normalizedPassword, salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
  });
  return `${salt}:${bytesToHex(derivedKey)}`;
}

async function resetCustomerPassword(email: string, newPassword: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Find the user
    const userResult = await pool.query(
      `SELECT id, email, name, "emailVerified" FROM "user" WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      console.error(`No customer account found for: ${email}`);
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`Found user: ${user.name} (${user.email}) — id: ${user.id}`);
    console.log(`Email verified: ${user.emailVerified}`);

    // Hash the new password
    const hashedPassword = await hashBetterAuthPassword(newPassword);

    // Update or insert the credential account record
    const accountResult = await pool.query(
      `UPDATE "account"
       SET password = $1, "updatedAt" = NOW()
       WHERE "userId" = $2 AND "providerId" = 'credential'
       RETURNING id`,
      [hashedPassword, user.id]
    );

    if (accountResult.rowCount === 0) {
      // No credential account exists — create one
      await pool.query(
        `INSERT INTO "account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
        [`${user.id}-credential`, user.id, email, hashedPassword]
      );
      console.log('Created new credential account record.');
    } else {
      console.log('Updated existing credential account record.');
    }

    // Ensure email is verified (required for login)
    if (!user.emailVerified) {
      await pool.query(
        `UPDATE "user" SET "emailVerified" = true, "updatedAt" = NOW() WHERE id = $1`,
        [user.id]
      );
      console.log('Marked email as verified.');
    }

    console.log('');
    console.log('✅ Password reset successfully!');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${newPassword}`);
  } finally {
    await pool.end();
  }
}

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: pnpm exec tsx scripts/reset-customer-password.ts <email> <new-password>');
  process.exit(1);
}

resetCustomerPassword(email, password);
