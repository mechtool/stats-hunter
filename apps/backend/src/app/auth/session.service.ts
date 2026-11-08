import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { CredentialsService } from '../credentials/credentials.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SessionCookieOptions,
  SessionCookieSameSite,
} from './cookie';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionRecord {
  /** Raw cookie value (the only thing the browser ever receives). */
  raw: string;
  subject: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Server-side session store. The browser holds only an opaque 256-bit id
 * (stored here as its SHA-256); the actual Keycloak tokens are encrypted
 * with AES-256-GCM and never leave the backend.
 */
@Injectable()
export class SessionService {
  private readonly encryptionKey: string;
  private readonly ttlMs: number;
  private readonly cookieSecure: boolean;
  private readonly cookieSameSite: SessionCookieSameSite;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {
    this.encryptionKey =
      config.get('STATS_HUNTER_ENCRYPTION_KEY') ?? 'stats-hunter-dev-key';
    this.ttlMs = Number(config.get('SESSION_TTL_MS') ?? DEFAULT_TTL_MS);
    this.cookieSecure =
      (config.get('SESSION_COOKIE_SECURE') ?? 'false') === 'true';
    this.cookieSameSite = this.normalizeSameSite(
      config.get('SESSION_COOKIE_SAMESITE'),
    );
  }

  async create(
    subject: string,
    email: string,
    tokens: SessionTokens,
  ): Promise<SessionRecord> {
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.userSession.create({
      data: {
        tokenHash: this.hashToken(raw),
        subject,
        email,
        accessTokenEncrypted: this.credentials.encrypt(
          tokens.accessToken,
          this.encryptionKey,
        ),
        refreshTokenEncrypted: this.credentials.encrypt(
          tokens.refreshToken,
          this.encryptionKey,
        ),
        expiresAt,
      },
    });

    return {
      raw,
      subject,
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    };
  }

  async find(raw: string): Promise<SessionRecord | null> {
    if (!raw) {
      return null;
    }

    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: this.hashToken(raw) },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.revoke(raw);
      return null;
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      raw,
      subject: session.subject,
      email: session.email,
      accessToken: this.credentials.decrypt(
        session.accessTokenEncrypted,
        this.encryptionKey,
      ),
      refreshToken: this.credentials.decrypt(
        session.refreshTokenEncrypted,
        this.encryptionKey,
      ),
      expiresAt: session.expiresAt,
    };
  }

  /** Rotates the tokens in place; the cookie id stays the same. */
  async updateTokens(raw: string, tokens: SessionTokens): Promise<void> {
    if (!raw) {
      return;
    }
    await this.prisma.userSession.update({
      where: { tokenHash: this.hashToken(raw) },
      data: {
        accessTokenEncrypted: this.credentials.encrypt(
          tokens.accessToken,
          this.encryptionKey,
        ),
        refreshTokenEncrypted: this.credentials.encrypt(
          tokens.refreshToken,
          this.encryptionKey,
        ),
        lastUsedAt: new Date(),
      },
    });
  }

  async revoke(raw: string): Promise<void> {
    if (!raw) {
      return;
    }
    await this.prisma.userSession.deleteMany({
      where: { tokenHash: this.hashToken(raw) },
    });
  }

  cookieOptions(): SessionCookieOptions {
    return {
      secure: this.cookieSecure,
      sameSite: this.cookieSameSite,
      maxAgeSeconds: Math.floor(this.ttlMs / 1000),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeSameSite(value: string | undefined): SessionCookieSameSite {
    if (value === 'strict' || value === 'none') {
      return value;
    }
    return 'lax';
  }
}
