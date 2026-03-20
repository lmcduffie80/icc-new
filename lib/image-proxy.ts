/**
 * Client-side utility for converting S3 URLs to Next.js image proxy URLs
 * This is a client-safe version that doesn't import server-only dependencies
 */

/**
 * Check if a URL is an S3 URL
 */
function isS3Url(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const bucketName = process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
    
    if (
      hostname.includes('s3.amazonaws.com') ||
      hostname.includes('.s3.') ||
      hostname.includes('s3-') ||
      hostname.startsWith('s3.') ||
      (hostname.includes('amazonaws.com') && hostname.includes('s3'))
    ) {
      return true;
    }
    
    if (bucketName) {
      return (
        hostname === bucketName ||
        hostname === `${bucketName}.s3.amazonaws.com` ||
        hostname === `${bucketName}.s3.${process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1'}.amazonaws.com`
      );
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract S3 key from URL
 */
function getKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    if (!isS3Url(url)) {
      return null;
    }
    
    // Extract key from path (remove leading slash)
    const key = urlObj.pathname.slice(1);
    return key;
  } catch {
    return null;
  }
}

/**
 * Convert S3 URL to Next.js image proxy URL
 * This allows Next.js Image component to fetch images from private S3 buckets
 * Safe to use in client components
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

