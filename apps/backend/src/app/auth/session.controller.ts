import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  clearSessionCookie,
  parseCookies,
  SESSION_COOKIE_NAME,
  serializeSessionCookie,
} from './cookie';
import { KeycloakAdminService } from './keycloak-admin.service';
import { KeycloakTokenService, TokenSet } from './keycloak-token.service';
import { Public } from './public.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { SessionService } from './session.service';

interface LoginDto {
  email: string;
  password: string;
}

interface AuthenticatedRequest {
  headers?: { cookie?: string };
  session?: { raw: string; email: string; subject: string };
}

/**
 * Session endpoints (BFF login). `me` and `logout` rely on the session cookie;
 * login is public and rate-limited like the other auth endpoints.
 */
@Controller('auth')
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly tokens: KeycloakTokenService,
    private readonly admin: KeycloakAdminService,
  ) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean; email: string }> {
    const email = (dto.email ?? '').trim().toLowerCase();
    const password = dto.password ?? '';
    if (!email || !password) {
      throw new UnauthorizedException('Email и пароль обязательны');
    }

    try {
      const user = await this.admin.findUserByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Пользователь не зарегистрирован');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Existence check unavailable — fall back to the password grant below.
    }

    let tokenSet: TokenSet;
    try {
      tokenSet = await this.tokens.passwordGrant(email, password);
    } catch {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const subject = this.extractSubject(tokenSet.accessToken) ?? email;
    const session = await this.sessions.create(subject, email, tokenSet);
    res.setHeader(
      'Set-Cookie',
      serializeSessionCookie(session.raw, this.sessions.cookieOptions()),
    );

    return { ok: true, email };
  }

  @Get('me')
  me(@Req() req: AuthenticatedRequest): {
    email: string | null;
    subject: string | null;
  } {
    return {
      email: req.session?.email ?? null,
      subject: req.session?.subject ?? null,
    };
  }

  /** Public/idempotent: always clears the cookie, even with a stale session. */
  @Public()
  @Post('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean }> {
    const cookies = parseCookies(req.headers?.cookie);
    await this.sessions.revoke(cookies[SESSION_COOKIE_NAME]);
    res.setHeader(
      'Set-Cookie',
      clearSessionCookie(this.sessions.cookieOptions()),
    );
    return { ok: true };
  }

  private extractSubject(accessToken: string): string | null {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
      ) as { sub?: string };
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
