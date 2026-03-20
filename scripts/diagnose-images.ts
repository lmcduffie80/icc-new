/**
 * Diagnostic script to check product image configuration
 * Run with: pnpm diagnose:images
 */

import { pool } from '@/lib/db';

async function diagnoseImageSetup() {
  console.log('🔍 Diagnosing Product Image Configuration\n');
  console.log('=' .repeat(60));

  // Check 1: Environment Variables
  console.log('\n1️⃣  CHECKING ENVIRONMENT VARIABLES');
  console.log('-'.repeat(60));
  
  const requiredEnvVars = [
    'AWS_S3_BUCKET_NAME',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
  ];

  let missingVars = 0;
  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (value) {
      // Mask sensitive values
      const displayValue = envVar.includes('KEY') || envVar.includes('SECRET')
        ? value.substring(0, 4) + '...' + value.substring(value.length - 4)
        : value;
      console.log(`  ✅ ${envVar}: ${displayValue}`);
    } else {
      console.log(`  ❌ ${envVar}: NOT SET`);
      missingVars++;
    }
  }

  if (missingVars > 0) {
    console.log('\n⚠️  ISSUE FOUND: Missing AWS credentials!');
    console.log('\nTo fix this, add the following to your .env.local file:');
    console.log('');
    console.log('AWS_S3_BUCKET_NAME=your-bucket-name');
    console.log('AWS_ACCESS_KEY_ID=AKIA...');
    console.log('AWS_SECRET_ACCESS_KEY=your-secret-key');
    console.log('AWS_REGION=us-east-1  # or your region');
    console.log('');
    console.log('Then restart your dev server with: pnpm dev');
  }

  // Check 2: Database Image URLs
  console.log('\n2️⃣  CHECKING DATABASE IMAGE URLS');
  console.log('-'.repeat(60));
  
  try {
    const result = await pool.query(
      'SELECT id, name, image FROM products WHERE image IS NOT NULL LIMIT 5'
    );

    if (result.rows.length === 0) {
      console.log('  ℹ️  No products with images found in database');
    } else {
      console.log(`  Found ${result.rows.length} products with images:\n`);
      
      for (const product of result.rows) {
        console.log(`  Product: ${product.name}`);
        console.log(`  Image URL: ${product.image}`);
        
        // Analyze URL format
        const url = product.image as string;
        const isS3 = url.includes('s3.amazonaws.com') || url.includes('.s3.');
        const isFullUrl = url.startsWith('http://') || url.startsWith('https://');
        
        if (isS3 && isFullUrl) {
          console.log(`  Status: ✅ Valid S3 URL format`);
        } else if (isS3 && !isFullUrl) {
          console.log(`  Status: ⚠️  S3 URL missing protocol (http:// or https://)`);
        } else if (!isFullUrl) {
          console.log(`  Status: ⚠️  Relative path - not an S3 URL`);
        } else {
          console.log(`  Status: ℹ️  External URL (not S3)`);
        }
        console.log('');
      }
    }
  } catch (error) {
    console.log(`  ❌ Database query failed: ${error}`);
  }

  // Check 3: S3 Configuration
  console.log('\n3️⃣  S3 CLIENT CONFIGURATION');
  console.log('-'.repeat(60));
  
  if (missingVars === 0) {
    console.log('  ✅ S3 client can be initialized');
    console.log('  ✅ Image proxy should work if IAM permissions are correct');
  } else {
    console.log('  ❌ S3 client CANNOT be initialized - missing credentials');
    console.log('  ❌ Image proxy will fail with 403 or 500 errors');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 DIAGNOSIS SUMMARY');
  console.log('='.repeat(60));
  
  if (missingVars > 0) {
    console.log('\n🔴 ROOT CAUSE: Missing AWS Credentials');
    console.log('\nThe product images are not loading because AWS credentials');
    console.log('are not configured in your .env.local file.');
    console.log('\nQUICK FIX:');
    console.log('1. Add AWS credentials to .env.local (see above)');
    console.log('2. Restart dev server: pnpm dev');
    console.log('3. Check browser console for any remaining errors');
    console.log('4. Verify IAM user has s3:GetObject permission');
  } else {
    console.log('\n🟢 AWS credentials are configured');
    console.log('\nIf images still don\'t load, check:');
    console.log('1. Browser console for specific errors');
    console.log('2. IAM permissions (user needs s3:GetObject)');
    console.log('3. S3 bucket name matches AWS_S3_BUCKET_NAME');
    console.log('4. Network tab in dev tools for proxy endpoint responses');
  }
  
  console.log('\n' + '='.repeat(60));
  process.exit(missingVars > 0 ? 1 : 0);
}

// Run diagnosis
diagnoseImageSetup().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
