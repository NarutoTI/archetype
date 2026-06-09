/**
 * Vitest Global Setup
 * 
 * Configures test environment with necessary mocks and polyfills.
 * This runs before all tests.
 */

import { vi } from 'vitest';

// ============================================================================
// Browser API Mocks
// ============================================================================

/**
 * Mock window.matchMedia
 * Used by settingsStore for theme detection
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? false : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/**
 * Mock IntersectionObserver
 * Used by some Ionic components
 */
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

/**
 * Mock ResizeObserver
 * Used by some Ionic components
 */
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

/**
 * Mock localStorage
 * Some tests may need this
 */
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

/**
 * Mock performance.now()
 * Ensure it exists for performance tests
 */
if (!global.performance) {
  (global as any).performance = {
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
  };
}

// ============================================================================
// Console Methods
// ============================================================================

/**
 * Suppress console methods during tests (optional)
 * Uncomment if tests are too noisy
 */
// global.console = {
//   ...console,
//   log: vi.fn(),
//   debug: vi.fn(),
//   info: vi.fn(),
//   warn: vi.fn(),
//   error: vi.fn(),
// };

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Set test environment variables
 */
process.env.NODE_ENV = 'test';
process.env.VITE_API_URL = 'http://localhost:3000';
process.env.VITE_USE_FAKE_LOGIN = 'false';

// ============================================================================
// Global Test Utilities
// ============================================================================

/**
 * Wait utility for async tests
 */
(global as any).wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Flush promises utility
 */
(global as any).flushPromises = () => new Promise(resolve => setImmediate(resolve));

console.log('✅ Test environment setup complete');
