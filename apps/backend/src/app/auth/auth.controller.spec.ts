import { BadRequestException, ConflictException } from '@nestjs/common';
import { CredentialsService } from '../credentials/credentials.service';
import { AuthController } from './auth.controller';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response;
}

describe('AuthController', () => {
  const prisma = {
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const mail = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const credentials = new CredentialsService();

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
      credentials,
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockAdminToken(users: unknown[] = []): void {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/realms/master/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse({ access_token: 'admin-token' }));
      }
      if (target.includes('/realms/app-template/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse({ access_token: 'user-token' }));
      }
      if (target.includes('/users?search=')) {
        return Promise.resolve(jsonResponse(users));
      }
      if (target.endsWith('/reset-password')) {
        return Promise.resolve(jsonResponse({}));
      }
      if (/\/users\/user-1$/.test(target)) {
        return Promise.resolve(jsonResponse({}));
      }
      if (target.endsWith('/users')) {
        return Promise.resolve(jsonResponse({}, true));
      }
      return Promise.resolve(jsonResponse({}));
    });
  }

  describe('register', () => {
    it('creates a pending (unverified) user and sends a verification email', async () => {
      mockAdminToken();

      const result = await controller.register({
        email: 'USER@example.com',
        password: 'Secret123',
      });

      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = prisma.emailVerificationToken.upsert.mock.calls[0][0];
      expect(upsertArg.where).toEqual({ email: 'user@example.com' });
      expect(upsertArg.create.email).toBe('user@example.com');
      expect(upsertArg.create.tokenHash).toEqual(expect.any(String));
      expect(credentials.decrypt(upsertArg.create.passwordEncrypted, 'app-template-dev-key')).toBe(
        'Secret123',
      );
      expect(mail.sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mail.sendEmailVerificationEmail.mock.calls[0][0]).toBe(
        'user@example.com',
      );
      expect(mail.sendEmailVerificationEmail.mock.calls[0][1]).toContain(
        '/verify-email?token=',
      );

      // A newly registered user must NOT be enabled until email is verified.
      const createCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/admin/realms/app-template/users'),
      );
      expect(createCalls).toHaveLength(1);
      const createBody = JSON.parse(String((createCalls[0][1] as RequestInit).body));
      expect(createBody.enabled).toBe(false);
      expect(createBody.emailVerified).toBe(false);
    });

    it('rejects an already verified user', async () => {
      fetchMock.mockImplementation((url: RequestInfo | URL) => {
        const target = String(url);
        if (target.includes('/realms/master/protocol/openid-connect/token')) {
          return Promise.resolve(jsonResponse({ access_token: 'admin-token' }));
        }
        if (target.includes('/users?search=')) {
          return Promise.resolve(
            jsonResponse([
              {
                id: 'user-1',
                email: 'user@example.com',
                enabled: true,
                emailVerified: true,
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse({}));
      });

      await expect(
        controller.register({
          email: 'user@example.com',
          password: 'Secret123',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mail.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('resend-verification', () => {
    it('regenerates the token and sends a new email', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'v-1',
        email: 'user@example.com',
        tokenHash: 'old-hash',
        passwordEncrypted: credentials.encrypt('Secret123', 'app-template-dev-key'),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      });

      const result = await controller.resendVerification({
        email: 'user@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.upsert).toHaveBeenCalledTimes(1);
      expect(mail.sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
      const upsertArg = prisma.emailVerificationToken.upsert.mock.calls[0][0];
      expect(upsertArg.update.tokenHash).toEqual(expect.any(String));
      expect(upsertArg.update.tokenHash).not.toBe('old-hash');
    });

    it('answers ok when there is no pending registration', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      const result = await controller.resendVerification({
        email: 'nobody@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(mail.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('verify-email', () => {
    it('enables the user, issues a token and marks the link used', async () => {
      mockAdminToken([
        {
          id: 'user-1',
          email: 'user@example.com',
          enabled: false,
          emailVerified: false,
        },
      ]);
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'v-1',
        email: 'user@example.com',
        tokenHash: 'hash',
        passwordEncrypted: credentials.encrypt('Secret123', 'app-template-dev-key'),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      });
      prisma.emailVerificationToken.update.mockResolvedValue({});

      const result = await controller.verifyEmail({ token: 'valid-token' });

      expect(result).toEqual({
        ok: true,
        email: 'user@example.com',
        access_token: 'user-token',
      });
      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'v-1' },
        data: { usedAt: expect.any(Date) },
      });

      const verifyCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          /\/admin\/realms\/app-template\/users\/user-1$/.test(String(url)) &&
          (init as RequestInit).method === 'PUT',
      );
      expect(verifyCalls).toHaveLength(1);
      expect(
        JSON.parse(String((verifyCalls[0][1] as RequestInit).body)),
      ).toEqual({ enabled: true, emailVerified: true });
    });

    it('rejects an invalid token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(
        controller.verifyEmail({ token: 'bad-token' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel-registration', () => {
    it('revokes the pending token and removes the pending user', async () => {
      mockAdminToken([
        {
          id: 'user-1',
          email: 'user@example.com',
          enabled: false,
          emailVerified: false,
        },
      ]);
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await controller.cancelRegistration({
        email: 'user@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });

      const deleteCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          /\/admin\/realms\/app-template\/users\/user-1$/.test(String(url)) &&
          (init as RequestInit).method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it('does not remove a verified account', async () => {
      mockAdminToken([
        {
          id: 'user-1',
          email: 'user@example.com',
          enabled: true,
          emailVerified: true,
        },
      ]);
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });

      const result = await controller.cancelRegistration({
        email: 'user@example.com',
      });

      expect(result).toEqual({ ok: true });
      const deleteCalls = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe('password reset', () => {
    function mockResetToken(): void {
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
      mockResetToken();

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
      mockResetToken();
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
});
