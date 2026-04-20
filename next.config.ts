import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ['resend', '@anthropic-ai/sdk', 'pg'],
  compress: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    qualities: [70, 75, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'innovativecropcare.odoo.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      // Removed S3 bucket from remotePatterns - we use /api/images/proxy for S3 images
      // This prevents Next.js from trying to optimize private S3 URLs directly
    ],
  },
  // Optimize file watching to prevent EMFILE errors
  webpack: (config, { isServer }) => {
    // Reduce watchpack overhead
    if (!isServer) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**',
          '**/.cursor/**',
          '**/logs/**',
          '**/.env*',
          '**/coverage/**',
        ],
        aggregateTimeout: 300,
        poll: false, // Use native file watching
      };
    }
    
    return config;
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/:path*',
        headers: [
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Prevent clickjacking attacks
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Legacy XSS protection (still useful for older browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // HSTS - Force HTTPS (only enable after testing!)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Content Security Policy - IMPORTANT: Test thoroughly!
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com https://js.stripe.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.vercel.app https://vercel.live https://va.vercel-scripts.com https://vitals.vercel-insights.com https://accounts.google.com https://appleid.apple.com https://*.amazonaws.com https://api.stripe.com https://*.stripe.com wss:",
              "frame-src 'self' https://accounts.google.com https://appleid.apple.com https://vercel.live https://js.stripe.com https://*.docusign.net https://*.docusign.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      {
        // Less restrictive headers for admin panel
        source: '/admin/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      {
        // Cache control for API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;