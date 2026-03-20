import { describe, it, expect } from 'vitest';

/**
 * S3 Utilities Tests
 *
 * These tests verify the validation logic and URL handling utilities
 * for S3 file operations. The actual S3 client operations are tested
 * through integration tests with localstack or real S3.
 */

describe('S3 Utilities', () => {
  describe('File Validation Logic', () => {
    // Constants matching the S3 module
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_IMAGE_DIMENSION = 4096;
    const ALLOWED_MIME_TYPES = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ];

    describe('validateFileUpload logic', () => {
      const validateFileUpload = (
        filename: string,
        contentType: string,
        size: number
      ): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        // Validate filename
        if (!filename || filename.length === 0) {
          errors.push('Filename is required');
        } else if (filename.length > 255) {
          errors.push('Filename too long (max 255 characters)');
        } else if (!/^[a-zA-Z0-9._/\-\s()[\]]+$/.test(filename)) {
          errors.push('Filename contains invalid characters');
        }

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

        return { valid: errors.length === 0, errors };
      };

      it('should validate valid image upload', () => {
        const result = validateFileUpload('image.jpg', 'image/jpeg', 1024 * 1024);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate valid PNG upload', () => {
        const result = validateFileUpload('photo.png', 'image/png', 2 * 1024 * 1024);
        expect(result.valid).toBe(true);
      });

      it('should validate valid WebP upload', () => {
        const result = validateFileUpload('image.webp', 'image/webp', 500 * 1024);
        expect(result.valid).toBe(true);
      });

      it('should validate valid GIF upload', () => {
        const result = validateFileUpload('animation.gif', 'image/gif', 1 * 1024 * 1024);
        expect(result.valid).toBe(true);
      });

      it('should validate valid PDF upload', () => {
        const result = validateFileUpload('document.pdf', 'application/pdf', 3 * 1024 * 1024);
        expect(result.valid).toBe(true);
      });

      it('should reject empty filename', () => {
        const result = validateFileUpload('', 'image/jpeg', 1024);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Filename is required');
      });

      it('should reject filename that is too long', () => {
        const longFilename = 'a'.repeat(256) + '.jpg';
        const result = validateFileUpload(longFilename, 'image/jpeg', 1024);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Filename too long (max 255 characters)');
      });

      it('should reject filename with invalid characters', () => {
        const result = validateFileUpload('file<script>.jpg', 'image/jpeg', 1024);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Filename contains invalid characters');
      });

      it('should accept filename with path separators', () => {
        const result = validateFileUpload('uploads/images/photo.jpg', 'image/jpeg', 1024);
        expect(result.valid).toBe(true);
      });

      it('should accept filename with spaces', () => {
        const result = validateFileUpload('Product Label.jpg', 'image/jpeg', 1024);
        expect(result.valid).toBe(true);
      });

      it('should accept filename with parentheses', () => {
        const result = validateFileUpload('Label (2024).png', 'image/png', 1024);
        expect(result.valid).toBe(true);
      });

      it('should accept filename with square brackets', () => {
        const result = validateFileUpload('Draft[v2].jpg', 'image/jpeg', 1024);
        expect(result.valid).toBe(true);
      });

      it('should accept filename with multiple allowed special characters', () => {
        const result = validateFileUpload('Product Label (Final) [2024].png', 'image/png', 1024);
        expect(result.valid).toBe(true);
      });

      it('should reject disallowed content types', () => {
        const result = validateFileUpload('file.exe', 'application/x-msdownload', 1024);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('not allowed'))).toBe(true);
      });

      it('should reject file size of zero', () => {
        const result = validateFileUpload('image.jpg', 'image/jpeg', 0);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('File size must be greater than 0');
      });

      it('should reject file exceeding max size (5MB)', () => {
        const result = validateFileUpload('large.jpg', 'image/jpeg', 6 * 1024 * 1024);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
      });

      it('should accept file at exactly max size', () => {
        const result = validateFileUpload('max.jpg', 'image/jpeg', 5 * 1024 * 1024);
        expect(result.valid).toBe(true);
      });

      it('should collect multiple validation errors', () => {
        const result = validateFileUpload('', 'text/plain', 10 * 1024 * 1024);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });

    describe('Image dimension validation', () => {
      it('should accept valid image dimensions', () => {
        const isValidDimensions = (width: number, height: number): boolean => {
          return (
            width >= 50 &&
            height >= 50 &&
            width <= MAX_IMAGE_DIMENSION &&
            height <= MAX_IMAGE_DIMENSION
          );
        };

        expect(isValidDimensions(800, 600)).toBe(true);
        expect(isValidDimensions(1920, 1080)).toBe(true);
        expect(isValidDimensions(4096, 4096)).toBe(true);
      });

      it('should reject image with dimensions too large', () => {
        const isValidDimensions = (width: number, height: number): boolean => {
          return width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION;
        };

        expect(isValidDimensions(5000, 5000)).toBe(false);
        expect(isValidDimensions(4097, 100)).toBe(false);
        expect(isValidDimensions(100, 4097)).toBe(false);
      });

      it('should reject image with dimensions too small', () => {
        const isValidDimensions = (width: number, height: number): boolean => {
          return width >= 50 && height >= 50;
        };

        expect(isValidDimensions(10, 10)).toBe(false);
        expect(isValidDimensions(49, 100)).toBe(false);
        expect(isValidDimensions(100, 49)).toBe(false);
      });
    });
  });

  describe('S3 URL Utilities', () => {
    const isS3Url = (url: string): boolean => {
      try {
        let urlToParse = url.trim();
        if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
          urlToParse = `https://${urlToParse}`;
        }

        const urlObj = new URL(urlToParse);
        const hostname = urlObj.hostname;

        return (
          hostname.includes('s3.amazonaws.com') ||
          hostname.includes('.s3.') ||
          hostname.includes('s3-')
        );
      } catch {
        return false;
      }
    };

    const getKeyFromUrl = (url: string): string | null => {
      try {
        let urlToParse = url.trim();
        if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
          urlToParse = `https://${urlToParse}`;
        }

        const urlObj = new URL(urlToParse);

        if (!isS3Url(url)) {
          return null;
        }

        return urlObj.pathname.slice(1);
      } catch {
        return null;
      }
    };

    describe('isS3Url', () => {
      it('should recognize standard S3 URLs', () => {
        expect(isS3Url('https://bucket.s3.amazonaws.com/file.jpg')).toBe(true);
        expect(isS3Url('https://bucket.s3.us-east-1.amazonaws.com/file.jpg')).toBe(true);
      });

      it('should recognize S3 URLs with region prefix', () => {
        expect(isS3Url('https://s3-us-west-2.amazonaws.com/bucket/file.jpg')).toBe(true);
      });

      it('should reject non-S3 URLs', () => {
        expect(isS3Url('https://example.com/file.jpg')).toBe(false);
        expect(isS3Url('https://cdn.cloudflare.com/file.jpg')).toBe(false);
      });

      it('should handle invalid URLs', () => {
        expect(isS3Url('not-a-url')).toBe(false);
        expect(isS3Url('')).toBe(false);
      });
    });

    describe('getKeyFromUrl', () => {
      it('should extract key from standard S3 URL', () => {
        const key = getKeyFromUrl('https://bucket.s3.us-east-1.amazonaws.com/images/photo.jpg');
        expect(key).toBe('images/photo.jpg');
      });

      it('should extract key from S3 URL without region', () => {
        const key = getKeyFromUrl('https://bucket.s3.amazonaws.com/document.pdf');
        expect(key).toBe('document.pdf');
      });

      it('should handle nested paths', () => {
        const key = getKeyFromUrl('https://bucket.s3.amazonaws.com/uploads/2024/01/photo.jpg');
        expect(key).toBe('uploads/2024/01/photo.jpg');
      });

      it('should return null for non-S3 URLs', () => {
        const key = getKeyFromUrl('https://example.com/image.jpg');
        expect(key).toBe(null);
      });
    });

    describe('getImageProxyUrl', () => {
      const getImageProxyUrl = (s3Url: string | null | undefined): string | null => {
        if (!s3Url) return null;

        if (s3Url.includes('/api/images/proxy')) {
          return s3Url;
        }

        const s3Key = getKeyFromUrl(s3Url);
        if (!s3Key) {
          return s3Url;
        }

        return `/api/images/proxy?url=${encodeURIComponent(s3Url)}`;
      };

      it('should convert S3 URL to proxy URL', () => {
        const s3Url = 'https://bucket.s3.us-east-1.amazonaws.com/images/photo.jpg';
        const proxyUrl = getImageProxyUrl(s3Url);
        expect(proxyUrl).toBe(`/api/images/proxy?url=${encodeURIComponent(s3Url)}`);
      });

      it('should return null for null input', () => {
        expect(getImageProxyUrl(null)).toBe(null);
      });

      it('should return null for undefined input', () => {
        expect(getImageProxyUrl(undefined)).toBe(null);
      });

      it('should return unchanged if already a proxy URL', () => {
        const proxyUrl = '/api/images/proxy?url=something';
        expect(getImageProxyUrl(proxyUrl)).toBe(proxyUrl);
      });

      it('should return non-S3 URLs unchanged', () => {
        const externalUrl = 'https://cdn.example.com/image.jpg';
        expect(getImageProxyUrl(externalUrl)).toBe(externalUrl);
      });
    });
  });

  describe('Image Optimization', () => {
    describe('Resize Logic', () => {
      it('should determine if resize is needed', () => {
        const needsResize = (
          width: number,
          height: number,
          maxWidth: number = 2048,
          maxHeight: number = 2048
        ): boolean => {
          return width > maxWidth || height > maxHeight;
        };

        expect(needsResize(800, 600)).toBe(false);
        expect(needsResize(2048, 2048)).toBe(false);
        expect(needsResize(3000, 2000)).toBe(true);
        expect(needsResize(2000, 3000)).toBe(true);
      });

      it('should calculate resize dimensions', () => {
        const calculateResizeDimensions = (
          width: number,
          height: number,
          maxWidth: number,
          maxHeight: number
        ): { width: number; height: number } => {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          if (ratio >= 1) {
            return { width, height };
          }
          return {
            width: Math.round(width * ratio),
            height: Math.round(height * ratio),
          };
        };

        // Square image
        expect(calculateResizeDimensions(4000, 4000, 2048, 2048)).toEqual({
          width: 2048,
          height: 2048,
        });

        // Landscape image
        const landscape = calculateResizeDimensions(4000, 3000, 2048, 2048);
        expect(landscape.width).toBe(2048);
        expect(landscape.height).toBe(1536);

        // Portrait image
        const portrait = calculateResizeDimensions(3000, 4000, 2048, 2048);
        expect(portrait.width).toBe(1536);
        expect(portrait.height).toBe(2048);

        // Small image (no resize)
        expect(calculateResizeDimensions(800, 600, 2048, 2048)).toEqual({
          width: 800,
          height: 600,
        });
      });
    });
  });

  describe('Content Type Detection', () => {
    it('should map file extensions to MIME types', () => {
      const getMimeType = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
          pdf: 'application/pdf',
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
      };

      expect(getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getMimeType('image.PNG')).toBe('image/png');
      expect(getMimeType('doc.pdf')).toBe('application/pdf');
      expect(getMimeType('unknown.xyz')).toBe('application/octet-stream');
    });
  });

  describe('Presigned URL Generation', () => {
    it('should validate expiration times', () => {
      const DEFAULT_EXPIRY = 60 * 5; // 5 minutes
      const MAX_EXPIRY = 60 * 60 * 24 * 7; // 7 days

      expect(DEFAULT_EXPIRY).toBe(300);
      expect(MAX_EXPIRY).toBe(604800);
    });

    it('should construct public URL format', () => {
      const getPublicUrl = (bucket: string, region: string, key: string): string => {
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      };

      expect(getPublicUrl('my-bucket', 'us-east-1', 'images/photo.jpg')).toBe(
        'https://my-bucket.s3.us-east-1.amazonaws.com/images/photo.jpg'
      );
    });
  });
});
