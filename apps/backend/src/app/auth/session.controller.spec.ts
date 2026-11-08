import { UnauthorizedException } from '@nestjs/common';
import { SessionController } from './session.controller';

describe('SessionController', () => {
  const sessions = {
    create: jest.fn(),
    revoke: jest.fn(),
    cookieOptions: jest.fn(),
  };
  const tokens = {
    passwordGrant: jest.fn(),
  };
  const admin = {
    findUserByEmail: jest.fn(),
  };

  let controller: SessionController;

  beforeEach(() => {
    jest.clearAllMocks();
    sessions.cookieOptions.mockReturnValue({
      secure: false,
      sameSite: 'lax',
      maxAgeSeconds: 604800,
    });
    controller = new SessionController(
      sessions as never,
      tokens as never,
      admin as never,
    );
  });

  describe('login', () => {
    it('creates a session and sets the httpOnly cookie', async () => {
      const accessToken = [
        Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: 'sub-1' })).toString('base64url'),
        'signature',
      ].join('.');
      tokens.passwordGrant.mockResolvedValue({
        accessToken,
        refreshToken: 'refresh',
        expiresIn: 300,
      });
      admin.findUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        enabled: true,
        emailVerified: true,
      });
      sessions.create.mockResolvedValue({
        raw: 'raw-session',
        subject: 'sub-1',
        email: 'a@b.com',
        accessToken,
        refreshToken: 'refresh',
        expiresAt: new Date(),
      });
      const res = { setHeader: jest.fn() };

      const result = await controller.login(
        { email: 'A@B.com', password: 'Secret123' },
        res as never,
      );

      expect(result).toEqual({ ok: true, email: 'a@b.com' });
      expect(tokens.passwordGrant).toHaveBeenCalledWith(
        'a@b.com',
        'Secret123',
      );
      expect(sessions.create).toHaveBeenCalledWith(
        'sub-1',
        'a@b.com',
        expect.objectContaining({ accessToken }),
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('HttpOnly'),
      );
    });

    it('rejects missing credentials', async () => {
      await expect(
        controller.login({ email: '', password: '' }, {} as never),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokens.passwordGrant).not.toHaveBeenCalled();
    });

    it('maps a failed password grant to a 401', async () => {
      admin.findUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        enabled: true,
        emailVerified: true,
      });
      tokens.passwordGrant.mockRejectedValue(new Error('bad'));

      await expect(
        controller.login({ email: 'a@b.com', password: 'Secret123' }, {} as never),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a not-registered email', async () => {
      admin.findUserByEmail.mockResolvedValue(null);

      await expect(
        controller.login(
          { email: 'nobody@example.com', password: 'Secret123' },
          {} as never,
        ),
      ).rejects.toThrow('Пользователь не зарегистрирован');
      expect(tokens.passwordGrant).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session and clears the cookie', async () => {
      sessions.revoke.mockResolvedValue(undefined);
      const res = { setHeader: jest.fn() };
      const req = { headers: { cookie: 'stats-hunter.session=raw-session' } };

      const result = await controller.logout(req as never, res as never);

      expect(result).toEqual({ ok: true });
      expect(sessions.revoke).toHaveBeenCalledWith('raw-session');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('Max-Age=0'),
      );
    });
  });

  describe('me', () => {
    it('returns the session identity', () => {
      const result = controller.me({
        session: { raw: 'r', email: 'a@b.com', subject: 'sub-1' },
      } as never);

      expect(result).toEqual({ email: 'a@b.com', subject: 'sub-1' });
    });
  });
});
