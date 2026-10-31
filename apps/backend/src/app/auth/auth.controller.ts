import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RegisterDto {
  name: string;
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPassword: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('KEYCLOAK_URL') ?? 'http://localhost:8080';
    this.realm = config.get('KEYCLOAK_REALM') ?? 'stats-hunter';
    this.adminUser = config.get('KEYCLOAK_ADMIN_USER') ?? 'admin';
    this.adminPassword = config.get('KEYCLOAK_ADMIN_PASSWORD') ?? 'admin';
  }

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<{ ok: boolean }> {
    const adminToken = await this.adminToken();

    const res = await fetch(`${this.baseUrl}/admin/realms/${this.realm}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: dto.email,
        email: dto.email,
        firstName: dto.name,
        enabled: true,
        emailVerified: true,
        credentials: [
          { type: 'password', value: dto.password, temporary: false },
        ],
      }),
    });

    if (res.status === 409) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }
    if (!res.ok) {
      throw new BadRequestException('Не удалось зарегистрировать пользователя');
    }
    return { ok: true };
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
