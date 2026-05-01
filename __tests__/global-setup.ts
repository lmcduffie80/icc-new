/**
 * Vitest globalSetup — runs ONCE in the main process before any workers start.
 *
 * Purpose: detect conditions that cause workers to hang (e.g. live database
 * URLs in .env.test) and fail fast with a human-readable error message rather
 * than letting the suite silently time out after 300+ seconds.
 */

export function setup() {
  const checks: Array<{ name: string; value: string | undefined; isSafe: (v: string) => boolean }> = [
    {
      name: 'DATABASE_URL',
      value: process.env.DATABASE_URL,
      // Safe values: undefined/empty, or a clearly fake/local string
      isSafe: (v) =>
        v === '' ||
        v.includes('localhost') ||
        v.includes('127.0.0.1') ||
        v.startsWith('mock') ||
        v.startsWith('test') ||
        v.startsWith('fake'),
    },
    {
      name: 'UPSTASH_REDIS_REST_URL',
      value: process.env.UPSTASH_REDIS_REST_URL,
      isSafe: (v) =>
        v === '' ||
        v.includes('localhost') ||
        v.includes('127.0.0.1') ||
        v.startsWith('mock') ||
        v.startsWith('http://fake') ||
        v.startsWith('https://fake'),
    },
  ];

  const violations: string[] = [];

  for (const check of checks) {
    if (check.value && !check.isSafe(check.value)) {
      violations.push(check.name);
    }
  }

  if (violations.length > 0) {
    const list = violations.map((n) => `  - ${n}`).join('\n');
    throw new Error(
      `\n\n` +
      `⛔  LIVE CREDENTIALS DETECTED IN TEST ENVIRONMENT\n` +
      `${'─'.repeat(60)}\n` +
      `The following environment variables contain what appear to be\n` +
      `real connection strings. This will cause test workers to hang\n` +
      `while attempting live network connections:\n\n` +
      `${list}\n\n` +
      `Fix options:\n` +
      `  1. Remove the variable from .env.test (preferred)\n` +
      `  2. Replace the value with a clearly fake placeholder, e.g.:\n` +
      `       DATABASE_URL=postgresql://fake:fake@localhost:5432/testdb\n` +
      `  3. Ensure __tests__/setup.ts has a vi.mock() for every module\n` +
      `     that reads this variable at import time.\n\n` +
      `See .cursor/rules/test-mock-hygiene.mdc for the full guide.\n`,
    );
  }
}
