import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

// Security constraints
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_DIMENSION = 4096; // 4096px
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf', // PDF support for invoice uploads
];

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  metadata?: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

/**
 * Validate file before upload
 */
export function validateFileUpload(
  filename: string,
  contentType: string,
  size: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate filename
  if (!filename || filename.length === 0) {
    errors.push('Filename is required');
  } else if (filename.length > 255) {
    errors.push('Filename too long (max 255 characters)');
  }
  // Note: Character validation removed - filenames are sanitized before S3 upload

  // Validate content type
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    errors.push(`Content type ${contentType} is not allowed`);
  }

  // Validate file size
  if (size <= 0) {
    errors.push('File size must be greater than 0');
  } else if (size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate image dimensions and metadata
 */
export async function validateImageBuffer(buffer: Buffer): Promise<FileValidationResult> {
  const errors: string[] = [];

  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      errors.push('Unable to determine image dimensions');
      return { valid: false, errors };
    }

    // Check dimensions
    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      errors.push(
        `Image dimensions exceed maximum of ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}px`
      );
    }

    // Check minimum dimensions
    if (metadata.width < 50 || metadata.height < 50) {
      errors.push('Image dimensions too small (minimum 50x50px)');
    }

    return {
      valid: errors.length === 0,
      errors,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: buffer.length,
      },
    };
  } catch {
    errors.push('Invalid image file or corrupted data');
    return { valid: false, errors };
  }
}

/**
 * Optimize and resize image if needed
 */
export async function optimizeImage(
  buffer: Buffer,
  maxWidth: number = 2048,
  maxHeight: number = 2048
): Promise<Buffer> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Resize if dimensions exceed limits
    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > maxWidth || metadata.height > maxHeight)
    ) {
      return await image
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    // Just optimize without resizing
    return await image.jpeg({ quality: 85 }).toBuffer();
  } catch (error) {
    console.error('Image optimization failed:', error);
    return buffer;
  }
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  size: number,
  expiresIn: number = 60 * 5 // 5 minutes
): Promise<{ uploadUrl: string; publicUrl: string } | { error: string }> {
  // Validate file before generating URL
  const validation = validateFileUpload(key, contentType, size);
  if (!validation.valid) {
    return { error: validation.errors.join(', ') };
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    // Add metadata for security
    Metadata: {
      'upload-timestamp': new Date().toISOString(),
      'max-file-size': MAX_FILE_SIZE.toString(),
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  // Public URL format depends on bucket configuration
  // Using path-style URL for compatibility
  const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl };
}

export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

export function getKeyFromUrl(url: string): string | null {
  try {
    // Ensure URL has a protocol for parsing
    let urlToParse = url.trim();
    if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
      urlToParse = `https://${urlToParse}`;
    }
    
    const urlObj = new URL(urlToParse);
    
    // Check if it's an S3 URL (various formats)
    const hostname = urlObj.hostname;
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    
    const isS3Url = 
      hostname.includes('s3.amazonaws.com') ||
      hostname.includes('.s3.') ||
      hostname.includes('s3-') ||
      (bucketName && hostname === bucketName) ||
      (bucketName && hostname === `${bucketName}.s3.amazonaws.com`) ||
      (bucketName && hostname === `${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`);
    
    if (!isS3Url) {
      console.log(`🔍 S3: URL is not an S3 URL: ${url}`);
      return null;
    }
    
    // Extract key from path (remove leading slash)
    const key = urlObj.pathname.slice(1);
    console.log(`🔍 S3: Extracted key "${key}" from URL: ${url}`);
    return key;
  } catch (error) {
    console.error(`🔍 S3: Error parsing URL ${url}:`, error);
    return null;
  }
}

/**
 * Convert S3 URL to Next.js image proxy URL
 * This allows Next.js Image component to fetch images from private S3 buckets
 */
export function getImageProxyUrl(s3Url: string | null | undefined): string | null {
  if (!s3Url) return null;
  
  // Check if it's already a proxy URL
  if (s3Url.includes('/api/images/proxy')) {
    return s3Url;
  }
  
  // Check if it's an S3 URL
  const s3Key = getKeyFromUrl(s3Url);
  if (!s3Key) {
    // Not an S3 URL, return as-is (might be external URL)
    return s3Url;
  }
  
  // Convert to proxy URL
  return `/api/images/proxy?url=${encodeURIComponent(s3Url)}`;
}

/**
 * Convert S3 URL to proxy URL for documents (PDFs, etc.)
 * Server-side function to convert S3 URLs before sending to client
 */
export function getDocumentProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // If already a proxy URL, return as-is
  if (url.includes('/api/images/proxy')) {
    return url;
  }
  
  // Check if it's an S3 URL using the same logic as getKeyFromUrl
  try {
    let urlToParse = url.trim();
    if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
      urlToParse = `https://${urlToParse}`;
    }
    
    const urlObj = new URL(urlToParse);
    const hostname = urlObj.hostname;
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    
    const isS3Url = 
      hostname.includes('s3.amazonaws.com') ||
      hostname.includes('.s3.') ||
      hostname.includes('s3-') ||
      (bucketName && hostname === bucketName) ||
      (bucketName && hostname === `${bucketName}.s3.amazonaws.com`) ||
      (bucketName && hostname === `${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`);
    
    if (isS3Url) {
      const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(url)}`;
      console.log(`[getDocumentProxyUrl] Converting S3 URL to proxy: ${url} -> ${proxyUrl}`);
      return proxyUrl;
    }
  } catch {
    // If URL parsing fails, check with simple string matching as fallback
    const urlLower = url.toLowerCase();
    if (urlLower.includes('s3.amazonaws.com') || urlLower.includes('.s3.') || urlLower.includes('amazonaws.com')) {
      const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(url)}`;
      console.log(`[getDocumentProxyUrl] Converting S3 URL to proxy (fallback): ${url} -> ${proxyUrl}`);
      return proxyUrl;
    }
  }
  
  console.log(`[getDocumentProxyUrl] Not an S3 URL, returning as-is: ${url}`);
  return url;
}

/**
 * Upload a file directly to S3 from server-side code
 * Returns the S3 key and a presigned download URL
 */
export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream',
  expiresIn: number = 60 * 60 * 24 * 7 // 7 days default for download links
): Promise<{ key: string; downloadUrl: string } | { error: string }> {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      Body: buffer,
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
        'uploaded-by': 'server',
      },
    });

    await s3Client.send(command);
    console.log(`🔍 S3: Successfully uploaded file "${key}", size: ${buffer.length} bytes`);

    // Generate presigned download URL
    const downloadUrl = await generatePresignedDownloadUrl(key, expiresIn);

    return { key, downloadUrl };
  } catch (error) {
    console.error(`🔍 S3: Error uploading file "${key}":`, error);
    return { error: error instanceof Error ? error.message : 'Failed to upload to S3' };
  }
}

/**
 * Generate a presigned URL for downloading a file from S3
 * This allows downloading from a private bucket without making it public
 */
export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = 60 * 60 * 24 * 7 // 7 days default
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get file content directly from S3 using AWS SDK
 * More reliable than fetching via URL for private buckets
 */
export async function getFileFromS3(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    console.log(`🔍 S3: Attempting to fetch file with key: "${key}" from bucket: "${BUCKET_NAME}"`);
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      console.error(`🔍 S3: File "${key}" exists but has no body`);
      return null;
    }

    // Convert the readable stream to a buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log(`🔍 S3: Successfully fetched file "${key}", size: ${buffer.length} bytes, content-type: ${response.ContentType || 'application/octet-stream'}`);

    return {
      buffer,
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error) {
    const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    console.error(`🔍 S3: Error fetching file "${key}" from bucket "${BUCKET_NAME}":`, error);
    if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
      console.error(`🔍 S3: File "${key}" does not exist in bucket "${BUCKET_NAME}"`);
    } else if (s3Error.name === 'AccessDenied' || s3Error.$metadata?.httpStatusCode === 403) {
      console.error(`🔍 S3: Access denied to file "${key}" in bucket "${BUCKET_NAME}"`);
      console.error(`🔍 S3: Check that AWS_ACCESS_KEY_ID has s3:GetObject permission for bucket "${BUCKET_NAME}"`);
      // Re-throw AccessDenied errors so the API route can handle them properly
      throw error;
    }
    return null;
  }
}

