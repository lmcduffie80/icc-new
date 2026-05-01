import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom', // Use happy-dom instead of jsdom (faster, more stable)
    globalSetup: ['./__tests__/global-setup.ts'],
    setupFiles: ['./__tests__/setup.ts'],
    testTimeout: 10000, // 10 second timeout per test
    hookTimeout: 10000, // 10 second timeout for before/after hooks
    // Explicit include prevents vitest from scanning the whole project tree, which
    // causes it to hang on the macOS Icon file and .next/node_modules in __tests__/.
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '.next/**',
      'e2e/**',
      // iCloud / Finder duplicates (e.g. "tax 2.test.ts", "foo 4.test.ts").
      // These are git-ignored but vitest's glob still picks them up and they
      // can hang the worker pool when their imports drift from current code.
      '**/* [0-9]*.test.{ts,tsx}',
      '**/* [0-9]*.spec.{ts,tsx}',
      // macOS Finder icon files (Icon\r) — vite 8.x / rolldown hangs when its
      // module scanner encounters these carriage-return filenames.
      '**/Icon',
      '**/Icon\r',
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

