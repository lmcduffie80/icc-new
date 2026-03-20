#!/usr/bin/env tsx

/**
 * Script to create a supplier user
 * Usage: pnpm exec tsx scripts/create-supplier.ts <email> <name> <company> <password> [phone]
 */

import { createSupplierUser } from '../lib/supplier-auth';
import { queryOne } from '../lib/db';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error('Usage: pnpm exec tsx scripts/create-supplier.ts <email> <name> <company> <password> [phone]');
    process.exit(1);
  }

  const [email, name, company, password, phone] = args;

  try {
    // Check if email already exists
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM supplier_users WHERE email = $1',
      [email]
    );

    if (existing) {
      console.error(`Error: Supplier with email ${email} already exists`);
      process.exit(1);
    }

    // Create supplier user
    const supplier = await createSupplierUser(email, name, company, password, phone);

    console.log('✓ Supplier user created successfully!');
    console.log(`  ID: ${supplier.id}`);
    console.log(`  Email: ${supplier.email}`);
    console.log(`  Name: ${supplier.name}`);
    console.log(`  Company: ${supplier.company_name}`);
    console.log(`\nSupplier can now log in at: http://localhost:3000/supplier/login`);
  } catch (error) {
    console.error('Error creating supplier user:', error);
    process.exit(1);
  }
}

main();

