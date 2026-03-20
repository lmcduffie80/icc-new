import { configureAxe, toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

// Extend Vitest's expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Configure axe for WCAG 2.1 AA compliance
export const axe = configureAxe({
  rules: {
    // WCAG 2.1 AA rules
    'color-contrast': { enabled: true },
    'valid-lang': { enabled: true },
    region: { enabled: true },
  },
});

// Helper to create a container element for testing
export function createTestContainer(): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('id', 'test-container');
  document.body.appendChild(container);
  return container;
}

// Helper to clean up test container
export function cleanupTestContainer(): void {
  const container = document.getElementById('test-container');
  if (container) {
    document.body.removeChild(container);
  }
}
