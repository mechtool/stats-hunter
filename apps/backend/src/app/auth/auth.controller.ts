import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { CredentialsService } from '../credentials/credentials.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from './public.decorator';
import { RateLimitGuard } from './rate-limit.guard';

interface RegisterDto {
  email: string;
  password: string;
}

interface ForgotPasswordDto {
  email: string;
}

interface ResetPasswordDto {
  token: string;
  password: string;
}

interface ResendVerificationDto {
  email: string;
}

interface VerifyEmailDto {
  token: string;
}

interface CancelRegistrationDto {
  email: string;
}

interface KeycloakUser {
  id: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
}

@Public()
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPassword: string;
  private readonly frontendUrl: string;
  private readonly clientId: string;
  private readonly encryptionKey: string;
  private readonly resetTokenTtlMs: number;
  private readonly verificationTtlMs: number;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly credentials: CredentialsService,
  ) {
    this.baseUrl = config.get('KEYCLOAK_URL') ?? 'http://localhost:8080';
    this.realm = config.get('KEYCLOAK_REALM') ?? 'stats-hunter';
    this.adminUser = config.get('KEYCLOAK_ADMIN') ?? 'admin';
    this.adminPassword = config.get('KEYCLOAK_ADMIN_PASSWORD') ?? 'admin';
    this.frontendUrl = config.get('FRONTEND_URL') ?? 'http://localhost:4200';
    this.clientId = config.get('KEYCLOAK_CLIENT_ID') ?? 'stats-hunter-frontend';
    this.encryptionKey =
      config.get('STATS_HUNTER_ENCRYPTION_KEY') ?? 'stats-hunter-dev-key';
    this.resetTokenTtlMs = Number(
      config.get('RESET_TOKEN_TTL_MS') ?? 30 * 60 * 1000,
    );
    this.verificationTtlMs = Number(
      config.get('EMAIL_VERIFY_TTL_MS') ?? 24 * 60 * 60 * 1000,
    );
  }

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<{ ok: boolean }> {
    const email = (dto.email ?? '').trim().toLowerCase();
    const password = dto.password ?? '';

    if (!email) {
      throw new BadRequestException('Email обязателен');
    }
    if (password.length < 8) {
      throw new BadRequestException('Пароль должен быть не короче 8 символов');
    }

    const existing = await this.findUserByEmail(email);
    if (existing?.enabled && existing.emailVerified) {
      throw new ConflictException('Пользователь уже существует');
    }

    await this.createOrUpdatePendingUser(email, password, existing?.id);

    const token = randomBytes(32).toString('base64url');
    await this.saveVerificationToken(email, password, token);

    await this.sendVerificationEmail(email, token);

    return { ok: true };
  }

  @Post('resend-verification')
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ ok: boolean }> {
    const email = (dto.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email обязателен');
    }

    // Always answer the same to avoid account enumeration.
    const pending = await this.prisma.emailVerificationToken.findUnique({
      where: { email },
    });
    if (!pending || pending.usedAt) {
      return { ok: true };
    }

    const password = this.credentials.decrypt(
      pending.passwordEncrypted,
      this.encryptionKey,
    );

    const token = randomBytes(32).toString('base64url');
    await this.saveVerificationToken(email, password, token);
    await this.sendVerificationEmail(email, token);

    return { ok: true };
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{
    ok: boolean;
    email: string;
    access_token: string;
  }> {
    const token = (dto.token ?? '').trim();
    if (!token) {
      throw new BadRequestException('Токен подтверждения обязателен');
    }

    const tokenHash = this.hashToken(token);
    const pending = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!pending || pending.usedAt || pending.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Ссылка недействительна или срок её действия истёк',
      );
    }

    const user = await this.findUserByEmail(pending.email);
    if (!user) {
      throw new BadRequestException('Пользователь не найден');
    }

    const password = this.credentials.decrypt(
      pending.passwordEncrypted,
      this.encryptionKey,
    );

    await this.setUserVerification(user.id, true);
    const access_token = await this.issuePasswordToken(pending.email, password);

    await this.prisma.emailVerificationToken.update({
      where: { id: pending.id },
      data: { usedAt: new Date() },
    });

    return { ok: true, email: pending.email, access_token };
  }

  @Post('cancel-registration')
  async cancelRegistration(
    @Body() dto: CancelRegistrationDto,
  ): Promise<{ ok: boolean }> {
    const email = (dto.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email обязателен');
    }

    // Revoke any pending verification link (idempotent).
    await this.prisma.emailVerificationToken.deleteMany({
      where: { email },
    });

    // Remove the pending Keycloak user, but never a verified account.
    const user = await this.findUserByEmail(email);
    if (user && user.enabled === false && user.emailVerified === false) {
      await this.deleteUser(user.id);
    }

    return { ok: true };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: boolean }> {
    const email = (dto.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email обязателен');
    }

    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.resetTokenTtlMs);

    await this.prisma.passwordResetToken.create({
      data: {
        email,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    const link = `${this.frontendUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.sendPasswordResetEmail(email, link);

    return { ok: true };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: boolean }> {
    const token = (dto.token ?? '').trim();
    const password = dto.password ?? '';

    if (!token) {
      throw new BadRequestException('Токен сброса обязателен');
    }
    if (password.length < 8) {
      throw new BadRequestException('Пароль должен быть не короче 8 символов');
    }

    const tokenHash = this.hashToken(token);
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Ссылка недействительна или срок её действия истёк',
      );
    }

    const user = await this.findUserByEmail(reset.email);
    if (!user) {
      throw new BadRequestException('Пользователь не найден');
    }

    await this.resetUserPassword(user.id, password);
    await this.prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });

    return { ok: true };
  }

  private async createOrUpdatePendingUser(
    email: string,
    password: string,
    userId?: string,
  ): Promise<void> {
    const adminToken = await this.adminToken();

    if (userId) {
      await this.resetUserPassword(userId, password);
      await this.setUserVerification(userId, false);
      return;
    }

    const res = await fetch(`${this.baseUrl}/admin/realms/${this.realm}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: email,
        email,
        // Keycloak's declarative user profile requires `firstName` for users,
        // but the register form no longer asks for a name — derive it from email.
        firstName: email.split('@')[0] || 'user',
        enabled: false,
        emailVerified: false,
        credentials: [{ type: 'password', value: password, temporary: false }],
      }),
    });

    if (res.status === 409) {
      // A pending user may already exist (e.g. after a declined registration).
      const user = await this.findUserByEmail(email);
      if (user) {
        await this.resetUserPassword(user.id, password);
        await this.setUserVerification(user.id, false);
        return;
      }
    }
    if (!res.ok) {
      throw new BadRequestException('Не удалось зарегистрировать пользователя');
    }
  }

  private async setUserVerification(
    userId: string,
    verified: boolean,
  ): Promise<void> {
    const adminToken = await this.adminToken();
    const res = await fetch(
      `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: verified,
          emailVerified: verified,
        }),
      },
    );
    if (!res.ok) {
      throw new BadRequestException('Не удалось обновить пользователя');
    }
  }

  private async deleteUser(userId: string): Promise<void> {
    const adminToken = await this.adminToken();
    const res = await fetch(
      `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new BadRequestException('Не удалось отменить регистрацию');
    }
  }

  private async issuePasswordToken(
    email: string,
    password: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      username: email,
      password,
      scope: 'openid',
    });
    const res = await fetch(
      `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    if (!res.ok) {
      throw new BadRequestException('Не удалось выполнить вход');
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  private async saveVerificationToken(
    email: string,
    password: string,
    token: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(token);
    const passwordEncrypted = this.credentials.encrypt(
      password,
      this.encryptionKey,
    );
    const expiresAt = new Date(Date.now() + this.verificationTtlMs);

    await this.prisma.emailVerificationToken.upsert({
      where: { email },
      create: { email, tokenHash, passwordEncrypted, expiresAt },
      update: { tokenHash, passwordEncrypted, expiresAt, usedAt: null },
    });
  }

  private async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const link = `${this.frontendUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
    await this.mail.sendEmailVerificationEmail(email, link);
  }

  private async findUserByEmail(email: string): Promise<KeycloakUser | null> {
    const adminToken = await this.adminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users?search=${encodeURIComponent(email)}&max=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      throw new BadRequestException('Не удалось получить пользователя');
    }

    const users = (await res.json()) as KeycloakUser[];
    return (
      users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ??
      null
    );
  }

  private async resetUserPassword(userId: string, password: string): Promise<void> {
    const adminToken = await this.adminToken();
    const res = await fetch(
      `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}/reset-password`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'password',
          value: password,
          temporary: false,
        }),
      },
    );
    if (!res.ok) {
      throw new BadRequestException('Не удалось изменить пароль');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async adminToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.adminUser,
      password: this.adminPassword,
    });
    const res = await fetch(
      `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    if (!res.ok) {
      throw new BadRequestException('Keycloak admin auth failed');
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
}
