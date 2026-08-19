import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestHandlers = vi.hoisted(() => [] as Array<(config: Record<string, unknown>) => Promise<Record<string, unknown>>>);
const responseHandlers = vi.hoisted(() => [] as Array<(error: unknown) => Promise<unknown>>);

const hoisted = vi.hoisted(() => ({
  tokenValue: 'jwt-token' as string | null,
  createAlert: vi.fn(),
  signOut: vi.fn(async () => {}),
}));

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
      key === 'auth_token' ? { value: hoisted.tokenValue } : { value: null }
    )),
  },
}));

vi.mock('@ionic/vue', () => ({
  alertController: {
    create: (...args: unknown[]) => hoisted.createAlert(...args),
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
    signOut: (...args: unknown[]) => hoisted.signOut(...args),
  },
}));

function unauthorizedError(overrides: Record<string, unknown> = {}) {
  return {
    response: { status: 401 },
    config: {},
    ...overrides,
  };
}

describe('api.service', () => {
  beforeEach(async () => {
    vi.resetModules();
    requestHandlers.length = 0;
    responseHandlers.length = 0;
    hoisted.tokenValue = 'jwt-token';
    hoisted.signOut.mockClear();
    hoisted.signOut.mockResolvedValue(undefined);
    hoisted.createAlert.mockReset();
    hoisted.createAlert.mockResolvedValue({
      present: vi.fn(async () => {}),
      onDidDismiss: vi.fn(async () => {}),
    });
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
    const error = unauthorizedError();

    await expect(handler(error)).rejects.toEqual(error);
    expect(hoisted.signOut).toHaveBeenCalledOnce();
    expect(window.location.href).toBe('/login');
  });

  it('does not open the session alert when there is no stored token', async () => {
    hoisted.tokenValue = null;
    const handler = responseHandlers[0];
    const error = unauthorizedError();

    await expect(handler(error)).rejects.toEqual(error);
    expect(hoisted.createAlert).not.toHaveBeenCalled();
    expect(hoisted.signOut).not.toHaveBeenCalled();
  });

  it('does not open the session alert for logout cleanup 401s', async () => {
    const handler = responseHandlers[0];
    const error = unauthorizedError({
      config: { skipAuthHandling: true },
    });

    await expect(handler(error)).rejects.toEqual(error);
    expect(hoisted.createAlert).not.toHaveBeenCalled();
    expect(hoisted.signOut).not.toHaveBeenCalled();
  });

  it('shows a single auth alert when several 401s arrive together', async () => {
    const handler = responseHandlers[0];
    let dismiss!: () => void;
    hoisted.createAlert.mockResolvedValue({
      present: vi.fn(async () => {}),
      onDidDismiss: () => new Promise<void>((resolve) => {
        dismiss = resolve;
      }),
    });

    const firstError = unauthorizedError();
    const secondError = unauthorizedError();
    const settled = Promise.allSettled([
      handler(firstError),
      handler(secondError),
    ]);

    await vi.waitFor(() => {
      expect(hoisted.createAlert).toHaveBeenCalledTimes(1);
      expect(dismiss).toBeTypeOf('function');
    });

    dismiss();
    await settled;

    expect(hoisted.createAlert).toHaveBeenCalledTimes(1);
    expect(hoisted.signOut).toHaveBeenCalledOnce();
  });

  it('retries the session alert if signOut fails', async () => {
    const handler = responseHandlers[0];
    hoisted.signOut.mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(handler(unauthorizedError())).rejects.toThrow('cleanup failed');
    expect(window.location.href).toBe('');

    const retryError = unauthorizedError();
    await expect(handler(retryError)).rejects.toEqual(retryError);
    expect(hoisted.createAlert).toHaveBeenCalledTimes(2);
    expect(hoisted.signOut).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe('/login');
  });
});
