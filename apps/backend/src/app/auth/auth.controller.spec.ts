import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response;
}

describe('AuthController password reset', () => {
  const prisma = {
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const mail = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };

  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    controller = new AuthController(
      config as never,
      prisma as never,
      mail as never,
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockAdminToken(): void {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse({ access_token: 'admin-token' }));
      }
      if (target.includes('/users?search=')) {
        return Promise.resolve(
          jsonResponse([{ id: 'user-1', email: 'user@example.com' }]),
        );
      }
      if (target.endsWith('/reset-password')) {
        return Promise.resolve(jsonResponse({}));
      }
      return Promise.resolve(jsonResponse({}));
    });
  }

  it('returns ok without creating a token when the email is unknown', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse({ access_token: 'admin-token' }));
      }
      if (target.includes('/users?search=')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const result = await controller.forgotPassword({
      email: 'nobody@example.com',
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('creates a token and sends an email for a known user', async () => {
    mockAdminToken();

    const result = await controller.forgotPassword({
      email: 'USER@example.com',
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.passwordResetToken.create.mock.calls[0][0];
    expect(createArg.data.email).toBe('user@example.com');
    expect(createArg.data.tokenHash).toEqual(expect.any(String));
    expect(createArg.data.expiresAt).toBeInstanceOf(Date);
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendPasswordResetEmail.mock.calls[0][0]).toBe(
      'user@example.com',
    );
    expect(mail.sendPasswordResetEmail.mock.calls[0][1]).toContain(
      '/reset-password?token=',
    );
  });

  it('rejects an invalid or already-used token', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      controller.resetPassword({ token: 'bad-token', password: 'NewPass123' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resets the password and marks the token used', async () => {
    mockAdminToken();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      email: 'user@example.com',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    prisma.passwordResetToken.update.mockResolvedValue({});

    const result = await controller.resetPassword({
      token: 'valid-token',
      password: 'NewPass123',
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'reset-1' },
      data: { usedAt: expect.any(Date) },
    });
    const resetCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/reset-password'),
    );
    expect(resetCalls).toHaveLength(1);
    expect(JSON.parse(String((resetCalls[0][1] as RequestInit).body))).toEqual({
      type: 'password',
      value: 'NewPass123',
      temporary: false,
    });
  });
});
