import { CredentialsService } from '../credentials/credentials.service';
import { SessionService } from './session.service';

describe('SessionService', () => {
  const prisma = {
    userSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const credentials = new CredentialsService();
  const key = 'stats-hunter-dev-key';

  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionService(config as never, prisma as never, credentials);
  });

  it('creates a session with encrypted tokens and an opaque raw id', async () => {
    prisma.userSession.create.mockResolvedValue({});

    const record = await service.create('sub-1', 'a@b.com', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(record.raw).toEqual(expect.any(String));
    expect(record.subject).toBe('sub-1');
    expect(record.email).toBe('a@b.com');

    const createData = prisma.userSession.create.mock.calls[0][0].data;
    expect(createData.tokenHash).toEqual(expect.any(String));
    expect(createData.subject).toBe('sub-1');
    expect(credentials.decrypt(createData.accessTokenEncrypted, key)).toBe(
      'access-token',
    );
    expect(credentials.decrypt(createData.refreshTokenEncrypted, key)).toBe(
      'refresh-token',
    );
    expect(createData.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns decrypted tokens for a valid session', async () => {
    prisma.userSession.findUnique.mockResolvedValue({
      id: 's-1',
      tokenHash: 'hash',
      subject: 'sub-1',
      email: 'a@b.com',
      accessTokenEncrypted: credentials.encrypt('access-token', key),
      refreshTokenEncrypted: credentials.encrypt('refresh-token', key),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    });
    prisma.userSession.update.mockResolvedValue({});

    const record = await service.find('raw-abc');

    expect(record?.accessToken).toBe('access-token');
    expect(record?.refreshToken).toBe('refresh-token');
    expect(record?.email).toBe('a@b.com');
    expect(prisma.userSession.update).toHaveBeenCalledTimes(1);
  });

  it('revokes and returns null for an expired session', async () => {
    prisma.userSession.findUnique.mockResolvedValue({
      id: 's-1',
      tokenHash: 'hash',
      subject: 'sub-1',
      email: 'a@b.com',
      accessTokenEncrypted: credentials.encrypt('access-token', key),
      refreshTokenEncrypted: credentials.encrypt('refresh-token', key),
      expiresAt: new Date(Date.now() - 1_000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
    });
    prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

    const record = await service.find('raw-abc');

    expect(record).toBeNull();
    expect(prisma.userSession.deleteMany).toHaveBeenCalled();
  });

  it('rotates tokens without changing the cookie id', async () => {
    prisma.userSession.update.mockResolvedValue({});

    await service.updateTokens('raw-abc', {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    const updateData = prisma.userSession.update.mock.calls[0][0].data;
    expect(credentials.decrypt(updateData.accessTokenEncrypted, key)).toBe(
      'new-access',
    );
    expect(credentials.decrypt(updateData.refreshTokenEncrypted, key)).toBe(
      'new-refresh',
    );
  });

  it('revokes by raw cookie value', async () => {
    prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

    await service.revoke('raw-abc');

    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    });
  });
});
