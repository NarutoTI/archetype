import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestHandlers = vi.hoisted(() => [] as Array<(config: Record<string, unknown>) => Promise<Record<string, unknown>>>);
const responseHandlers = vi.hoisted(() => [] as Array<(error: unknown) => Promise<unknown>>);

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: {
          use: vi.fn((handler: (config: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
            requestHandlers.push(handler);
          }),
        },
        response: {
          use: vi.fn((_onFulfilled: unknown, onRejected: (error: unknown) => Promise<unknown>) => {
            responseHandlers.push(onRejected);
          }),
        },
      },
    })),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => (
      key === 'auth_token' ? { value: 'jwt-token' } : { value: null }
    )),
  },
}));

vi.mock('@ionic/vue', () => ({
  alertController: {
    create: vi.fn(async () => ({
      present: vi.fn(async () => {}),
      onDidDismiss: vi.fn(async () => {}),
    })),
  },
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: vi.fn((key: string) => key),
    },
  },
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    signOut: vi.fn(async () => {}),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('api.service', () => {
  beforeEach(async () => {
    vi.resetModules();
    requestHandlers.length = 0;
    responseHandlers.length = 0;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
    await import('@/services/api.service');
  });

  it('adds Authorization header when auth_token exists', async () => {
    const handler = requestHandlers[0];
    const config = { headers: {} as Record<string, string> };

    const result = await handler(config);

    expect(result.headers.Authorization).toBe('Bearer jwt-token');
  });

  it('rejects 401 responses when a token is still stored', async () => {
    const handler = responseHandlers[0];
    const error = { response: { status: 401 } };

    await expect(handler(error)).rejects.toEqual(error);
  });
});
