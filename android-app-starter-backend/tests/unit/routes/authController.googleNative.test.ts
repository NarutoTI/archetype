import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getGoogleClientId: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
  authService: {
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateLastLogin: vi.fn(),
    generateAuthToken: vi.fn(() => 'app-jwt'),
    sanitizeUserData: vi.fn((user: unknown) => user)
  }
}));

vi.mock('../../../src/config/passport.js', () => ({
  default: {},
  isGoogleOAuthEnabled: vi.fn(),
  getGoogleClientId: hoisted.getGoogleClientId,
  verifyGoogleIdToken: hoisted.verifyGoogleIdToken
}));

vi.mock('../../../src/routes/auth/authService.js', () => ({
  default: hoisted.authService
}));

vi.mock('../../../src/services/userService.js', () => ({}));

vi.mock('../../../src/config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const { handleGoogleNativeAuth } = await import('../../../src/routes/auth/authController.js');

const buildRequest = (body: Record<string, unknown>) =>
  ({ body }) as unknown as Request<unknown, unknown, { idToken: string; language?: string }>;

const buildResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
};

const verifiedPayload = {
  email: 'user@example.com',
  email_verified: true,
  name: 'User',
  picture: 'https://example.com/photo.png'
};

describe('handleGoogleNativeAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getGoogleClientId.mockReturnValue('web-client-id.apps.googleusercontent.com');
    hoisted.verifyGoogleIdToken.mockResolvedValue(verifiedPayload);
    hoisted.authService.findUserByEmail.mockResolvedValue(null);
    hoisted.authService.createUser.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'user-1',
      ...data
    }));
    hoisted.authService.updateLastLogin.mockResolvedValue(undefined);
  });

  it('creates the account in the app language and returns the app JWT', async () => {
    const res = buildResponse();

    await handleGoogleNativeAuth(buildRequest({ idToken: 'google-id-token', language: 'pt' }), res);

    expect(hoisted.verifyGoogleIdToken).toHaveBeenCalledWith('google-id-token');
    expect(hoisted.authService.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      provider: 'google',
      emailVerified: true,
      language: 'pt'
    }));
    // Mesmo shape do login por e-mail: o front consome sem caso especial.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      token: 'app-jwt',
      user: expect.objectContaining({ id: 'user-1' })
    }));
  });

  it('reuses an existing account and keeps its language', async () => {
    const existing = { id: 'user-1', email: 'user@example.com', name: 'Old', language: 'es', provider: 'email' };
    hoisted.authService.findUserByEmail.mockResolvedValue(existing);
    const res = buildResponse();

    await handleGoogleNativeAuth(buildRequest({ idToken: 'google-id-token', language: 'pt' }), res);

    expect(hoisted.authService.createUser).not.toHaveBeenCalled();
    expect(hoisted.authService.updateLastLogin).toHaveBeenCalledWith(expect.objectContaining({
      name: 'User',
      picture: 'https://example.com/photo.png',
      emailVerified: true,
      language: 'es'
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, token: 'app-jwt' }));
  });

  it('rejects an invalid ID token with 401', async () => {
    hoisted.verifyGoogleIdToken.mockResolvedValue(null);
    const res = buildResponse();

    await handleGoogleNativeAuth(buildRequest({ idToken: 'forged' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'OAUTH_FAILED' }));
    expect(hoisted.authService.findUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects an email Google has not verified with 403', async () => {
    hoisted.verifyGoogleIdToken.mockResolvedValue({ ...verifiedPayload, email_verified: false });
    const res = buildResponse();

    await handleGoogleNativeAuth(buildRequest({ idToken: 'google-id-token' }), res);

    // Sem isto o `createUser` marcaria o e-mail como verificado por ser provider OAuth.
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }));
    expect(hoisted.authService.createUser).not.toHaveBeenCalled();
  });

  it('answers 503 when GOOGLE_CLIENT_ID is not configured', async () => {
    hoisted.getGoogleClientId.mockReturnValue(null);
    const res = buildResponse();

    await handleGoogleNativeAuth(buildRequest({ idToken: 'google-id-token' }), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'OAUTH_NOT_CONFIGURED' }));
    expect(hoisted.verifyGoogleIdToken).not.toHaveBeenCalled();
  });
});
