import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom', // Use happy-dom instead of jsdom (faster, more stable)
    setupFiles: ['./__tests__/setup.ts'],
    testTimeout: 10000, // 10 second timeout per test
    hookTimeout: 10000, // 10 second timeout for before/after hooks
    exclude: [
      'node_modules/**',
      'e2e/**',  // Exclude Playwright e2e tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '__tests__/',
        '*.config.ts',
        '*.config.js',
        'migrations/',
        'scripts/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

