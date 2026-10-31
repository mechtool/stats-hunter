import { ConfigService } from '@nestjs/config';
import { CredentialsService } from '../credentials/credentials.service';
import { MarketplaceCredentialsService } from './marketplace-credentials.service';

type StoredRow = {
  id: string;
  userId: string;
  marketplace: string;
  name: string;
  encryptedPayload: string;
  createdAt: Date;
};

describe('MarketplaceCredentialsService', () => {
  let service: MarketplaceCredentialsService;
  let rows: Map<string, StoredRow>;

  const prisma = {
    marketplaceCredential: {
      async upsert({ where, create, update }: any): Promise<StoredRow> {
        const key = `${where.userId_marketplace.userId}:${where.userId_marketplace.marketplace}`;
        const prev = rows.get(key);
        const row = prev
          ? { ...prev, ...update }
          : { id: key, ...create, createdAt: new Date() };
        rows.set(key, row);
        return row;
      },
      async findUnique({ where }: any): Promise<StoredRow | null> {
        const key = `${where.userId_marketplace.userId}:${where.userId_marketplace.marketplace}`;
        return rows.get(key) ?? null;
      },
      async findMany({ where }: any): Promise<StoredRow[]> {
        return [...rows.values()].filter((r) => r.userId === where.userId);
      },
      async deleteMany({ where }: any): Promise<{ count: number }> {
        let count = 0;
        for (const [k, v] of rows) {
          if (v.userId === where.userId && v.marketplace === where.marketplace) {
            rows.delete(k);
            count++;
          }
        }
        return { count };
      },
    },
  };

  beforeEach(() => {
    rows = new Map();
    const config = {
      getOrThrow: (k: string) =>
        k === 'STATS_HUNTER_ENCRYPTION_KEY' ? 'test-master-key' : undefined,
    };
    service = new MarketplaceCredentialsService(
      prisma as any,
      new CredentialsService(),
      config as unknown as ConfigService,
    );
  });

  it('encrypts at rest and decrypts on read', async () => {
    await service.save('user-1', 'ozon', 'Мой Ozon', {
      clientId: '123',
      apiKey: 'secret-key',
    });

    const [stored] = [...rows.values()];
    expect(stored.encryptedPayload).not.toContain('secret-key');
    expect(stored.encryptedPayload).not.toContain('123');

    await expect(service.get('user-1', 'ozon')).resolves.toEqual({
      clientId: '123',
      apiKey: 'secret-key',
    });
  });

  it('lists metadata without secrets', async () => {
    await service.save('user-1', 'ozon', 'Ozon', { apiKey: 'k' });
    const list = await service.list('user-1');
    expect(list).toHaveLength(1);
    expect(list[0].marketplace).toBe('ozon');
    expect(list[0]).not.toHaveProperty('encryptedPayload');
  });

  it('throws when credential not found', async () => {
    await expect(service.get('user-1', 'wb')).rejects.toThrow();
  });
});
