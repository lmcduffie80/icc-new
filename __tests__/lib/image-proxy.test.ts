import { describe, it, expect, beforeEach } from 'vitest';
import { getImageProxyUrl } from '@/lib/image-proxy';

// Set up environment variables
process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME = 'test-bucket';
process.env.NEXT_PUBLIC_AWS_REGION = 'us-east-1';

describe('Image Proxy Client Utilities', () => {
  beforeEach(() => {
    // Reset env vars for each test
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME = 'test-bucket';
    process.env.NEXT_PUBLIC_AWS_REGION = 'us-east-1';
  });

  describe('getImageProxyUrl', () => {
    describe('null/undefined handling', () => {
      it('should return null for null input', () => {
        expect(getImageProxyUrl(null)).toBe(null);
      });

      it('should return null for undefined input', () => {
        expect(getImageProxyUrl(undefined)).toBe(null);
      });

      it('should return null for empty string', () => {
        expect(getImageProxyUrl('')).toBe(null);
      });
    });

    describe('already proxied URLs', () => {
      it('should return unchanged if already a proxy URL', () => {
        const proxyUrl = '/api/images/proxy?url=https://bucket.s3.amazonaws.com/image.jpg';
        expect(getImageProxyUrl(proxyUrl)).toBe(proxyUrl);
      });

      it('should detect proxy URL anywhere in the string', () => {
        const proxyUrl = 'http://localhost:3000/api/images/proxy?url=test';
        expect(getImageProxyUrl(proxyUrl)).toBe(proxyUrl);
      });
    });

    describe('S3 URL detection and conversion', () => {
      it('should convert standard S3 URL to proxy URL', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/images/photo.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should convert S3 URL with region to proxy URL', () => {
        const s3Url = 'https://bucket.s3.us-east-1.amazonaws.com/image.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should convert S3 URL with s3- prefix to proxy URL', () => {
        const s3Url = 'https://s3-us-west-2.amazonaws.com/bucket/image.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should convert bucket subdomain S3 URL', () => {
        const s3Url = 'https://test-bucket.s3.amazonaws.com/photo.png';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should handle nested paths in S3 URL', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/uploads/2024/01/15/photo.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should handle S3 URL with query parameters', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/image.jpg?v=123';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });
    });

    describe('non-S3 URL handling', () => {
      it('should return external URLs unchanged', () => {
        const externalUrl = 'https://cdn.example.com/image.jpg';
        expect(getImageProxyUrl(externalUrl)).toBe(externalUrl);
      });

      it('should return relative URLs unchanged', () => {
        const relativeUrl = '/images/local-photo.jpg';
        expect(getImageProxyUrl(relativeUrl)).toBe(relativeUrl);
      });

      it('should return data URLs unchanged', () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        expect(getImageProxyUrl(dataUrl)).toBe(dataUrl);
      });

      it('should return blob URLs unchanged', () => {
        const blobUrl = 'blob:http://localhost:3000/12345-67890';
        expect(getImageProxyUrl(blobUrl)).toBe(blobUrl);
      });

      it('should return Cloudinary URLs unchanged', () => {
        const cloudinaryUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
        expect(getImageProxyUrl(cloudinaryUrl)).toBe(cloudinaryUrl);
      });
    });

    describe('bucket name matching', () => {
      it('should recognize URL with matching bucket name', () => {
        const s3Url = 'https://test-bucket.s3.us-east-1.amazonaws.com/image.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toContain('/api/images/proxy');
      });

      it('should work without bucket name in env', () => {
        delete process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;

        const s3Url = 'https://any-bucket.s3.amazonaws.com/image.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });
    });

    describe('edge cases', () => {
      it('should handle URL with special characters', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/images/photo%20name.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should handle URL with unicode characters', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/images/文件.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should handle malformed URL gracefully', () => {
        const malformedUrl = 'not-a-valid-url';
        const result = getImageProxyUrl(malformedUrl);

        // Should return as-is since it's not a valid S3 URL
        expect(result).toBe(malformedUrl);
      });

      it('should handle URL with port number', () => {
        const urlWithPort = 'http://localhost:9000/bucket/image.jpg';
        const result = getImageProxyUrl(urlWithPort);

        // Not an S3 URL, should return unchanged
        expect(result).toBe(urlWithPort);
      });
    });

    describe('URL encoding', () => {
      it('should properly encode the S3 URL', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/path/to/image.jpg';
        const result = getImageProxyUrl(s3Url);

        expect(result).toContain(encodeURIComponent(s3Url));
      });

      it('should double-encode if URL contains encoded characters', () => {
        const s3Url = 'https://bucket.s3.amazonaws.com/images/photo%2Bplus.jpg';
        const result = getImageProxyUrl(s3Url);

        // The %2B should be further encoded
        expect(result).toContain('%252B');
      });
    });
  });
});
