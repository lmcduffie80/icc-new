import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Upload Logo to S3
 * 
 * This script uploads the company logo from the public folder to S3
 * for use in PDFs and email templates.
 * 
 * Usage:
 *   pnpm tsx scripts/upload-logo.ts
 * 
 * The script will output the S3 URL which should be added to .env.local as LOGO_URL
 */

async function uploadLogo() {
  console.log('🚀 Starting logo upload to S3...\n');

  // Validate environment variables
  const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    console.error('\nPlease set these in your .env.local file.');
    process.exit(1);
  }

  const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET_NAME!;
  const logoPath = join(process.cwd(), 'public', 'logo.png');
  const s3Key = 'logos/company-logo.png';

  try {
    // Read the logo file
    console.log('📖 Reading logo file from:', logoPath);
    const logoBuffer = readFileSync(logoPath);
    console.log('✅ Logo file read successfully');
    console.log(`   Size: ${(logoBuffer.length / 1024).toFixed(2)} KB\n`);

    // Upload to S3
    console.log('📤 Uploading to S3...');
    console.log(`   Bucket: ${bucketName}`);
    console.log(`   Key: ${s3Key}`);
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: logoBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
      // Make it publicly readable
      ACL: 'public-read',
    });

    await s3Client.send(command);
    console.log('✅ Logo uploaded successfully!\n');

    // Generate the public URL
    const region = process.env.AWS_REGION;
    const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ SUCCESS! Logo is now available at:\n');
    console.log(`   ${s3Url}\n`);
    console.log('📝 Next steps:');
    console.log('   1. Add this to your .env.local file:');
    console.log(`      LOGO_URL=${s3Url}`);
    console.log('   2. Restart your development server');
    console.log('   3. Test by generating an invoice, quote, or BOL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error uploading logo:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

// Run the upload
uploadLogo();
