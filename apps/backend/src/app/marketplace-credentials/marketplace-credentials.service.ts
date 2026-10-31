import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialsService } from '../credentials/credentials.service';
import { PrismaService } from '../prisma/prisma.service';

export type MarketplaceSecrets = Record<string, string>;

/**
 * Persists per-user marketplace API credentials. Secrets are serialized to JSON
 * and encrypted with AES-256-GCM before being written to Postgres; the master
 * key never touches the database.
 */
@Injectable()
export class MarketplaceCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly config: ConfigService,
  ) {}

  private get masterKey(): string {
    return this.config.getOrThrow<string>('STATS_HUNTER_ENCRYPTION_KEY');
  }

  async save(
    userId: string,
    marketplace: string,
    name: string,
    secrets: MarketplaceSecrets,
  ): Promise<void> {
    const payload = this.credentials.encrypt(
      JSON.stringify(secrets),
      this.masterKey,
    );
    await this.prisma.marketplaceCredential.upsert({
      where: { userId_marketplace: { userId, marketplace } },
      create: { userId, marketplace, name, encryptedPayload: payload },
      update: { name, encryptedPayload: payload },
    });
  }

  async get(userId: string, marketplace: string): Promise<MarketplaceSecrets> {
    const row = await this.prisma.marketplaceCredential.findUnique({
      where: { userId_marketplace: { userId, marketplace } },
    });
    if (!row) {
      throw new NotFoundException(
        `Credential for marketplace "${marketplace}" not found`,
      );
    }
    return JSON.parse(
      this.credentials.decrypt(row.encryptedPayload, this.masterKey),
    ) as MarketplaceSecrets;
  }

  async list(
    userId: string,
  ): Promise<{ id: string; marketplace: string; name: string; createdAt: Date }[]> {
    const rows = await this.prisma.marketplaceCredential.findMany({
      where: { userId },
      orderBy: { marketplace: 'asc' },
    });
    return rows.map(({ id, marketplace, name, createdAt }) => ({
      id,
      marketplace,
      name,
      createdAt,
    }));
  }

  async remove(userId: string, marketplace: string): Promise<void> {
    await this.prisma.marketplaceCredential.deleteMany({
      where: { userId, marketplace },
    });
  }
}
