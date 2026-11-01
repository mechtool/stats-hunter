import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
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

@Public()
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPassword: string;
  private readonly frontendUrl: string;
  private readonly resetTokenTtlMs: number;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    this.baseUrl = config.get('KEYCLOAK_URL') ?? 'http://localhost:8080';
    this.realm = config.get('KEYCLOAK_REALM') ?? 'stats-hunter';
    this.adminUser = config.get('KEYCLOAK_ADMIN') ?? 'admin';
    this.adminPassword = config.get('KEYCLOAK_ADMIN_PASSWORD') ?? 'admin';
    this.frontendUrl = config.get('FRONTEND_URL') ?? 'http://localhost:4200';
    this.resetTokenTtlMs = Number(
      config.get('RESET_TOKEN_TTL_MS') ?? 30 * 60 * 1000,
    );
  }

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<{ ok: boolean }> {
    const adminToken = await this.adminToken();
    const email = (dto.email ?? '').trim();

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
        enabled: true,
        emailVerified: true,
        credentials: [
          { type: 'password', value: dto.password, temporary: false },
        ],
      }),
    });

    if (res.status === 409) {
      throw new ConflictException('Пользователь уже существует');
    }
    if (!res.ok) {
      throw new BadRequestException('Не удалось зарегистрировать пользователя');
    }
    return { ok: true };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: boolean }> {
    const email = (dto.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email обязателен');
    }

    // Always answer the same to avoid account enumeration.
    const user = await this.findUserByEmail(email);
    if (!user) {
      return { ok: true };
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

  private async findUserByEmail(
    email: string,
  ): Promise<{ id: string; email?: string } | null> {
    const adminToken = await this.adminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users?search=${encodeURIComponent(email)}&max=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      throw new BadRequestException('Не удалось получить пользователя');
    }

    const users = (await res.json()) as { id: string; email?: string }[];
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
