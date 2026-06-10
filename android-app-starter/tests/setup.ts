/**
 * Setup global do Vitest.
 * 
 * Configura o ambiente de teste com mocks e polyfills necessários.
 * Roda antes de todos os testes.
 */

import { vi } from 'vitest';

// ============================================================================
// Mocks de APIs do navegador
// ============================================================================

/**
 * Mock de window.matchMedia.
 * Usado pelo settingsStore para detectar tema.
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
 * Mock de IntersectionObserver.
 * Usado por alguns componentes Ionic.
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
 * Mock de ResizeObserver.
 * Usado por alguns componentes Ionic.
 */
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

/**
 * Mock de localStorage.
 * Alguns testes podem precisar disso.
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
 * Mock de performance.now().
 * Garante que exista para testes de performance.
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
// Métodos de console
// ============================================================================

/**
 * Suprime métodos de console durante testes (opcional).
 * Descomente se os testes ficarem ruidosos.
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
// Variáveis de ambiente
// ============================================================================

/**
 * Define variáveis de ambiente dos testes.
 */
process.env.NODE_ENV = 'test';
process.env.VITE_API_URL = 'http://localhost:3001';
process.env.VITE_USE_FAKE_LOGIN = 'false';

// ============================================================================
// Utilitários globais de teste
// ============================================================================

/**
 * Utilitário de espera para testes assíncronos.
 */
(global as any).wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Utilitário para drenar promises pendentes.
 */
(global as any).flushPromises = () => new Promise(resolve => setImmediate(resolve));

console.log('✅ Test environment setup complete');
