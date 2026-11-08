import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwksClient } from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
import { parseCookies, SESSION_COOKIE_NAME } from './cookie';
import { KeycloakTokenService } from './keycloak-token.service';
import { SessionService } from './session.service';

const EXPIRY_SKEW_MS = 30_000;

/**
 * Authenticates a request either via the httpOnly session cookie (primary, BFF
 * flow) or a Bearer JWT (backward-compatible for API clients). The session flow
 * transparently refreshes an expired access token in place; the cookie id stays
 * stable, so no cookie rewrite is needed on refresh.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks: JwksClient;
  private readonly issuer: string;

  constructor(
    config: ConfigService,
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly keycloakTokens: KeycloakTokenService,
  ) {
    this.issuer =
      config.get<string>('KEYCLOAK_ISSUER') ??
      'http://localhost:8080/realms/stats-hunter';
    this.jwks = new JwksClient({
      jwksUri:
        config.get<string>('KEYCLOAK_JWKS_URI') ??
        'http://localhost:8080/realms/stats-hunter/protocol/openid-connect/certs',
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const cookies = parseCookies(request.headers?.cookie);
    const raw = cookies[SESSION_COOKIE_NAME];

    if (raw) {
      return this.authenticateSession(request, raw);
    }

    return this.authenticateBearer(request);
  }

  private async authenticateSession(
    request: any,
    raw: string,
  ): Promise<boolean> {
    const session = await this.sessions.find(raw);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    let accessToken = session.accessToken;
    if (this.isNearExpiry(accessToken)) {
      try {
        const tokens = await this.keycloakTokens.refreshGrant(
          session.refreshToken,
        );
        await this.sessions.updateTokens(raw, tokens);
        accessToken = tokens.accessToken;
      } catch {
        await this.sessions.revoke(raw);
        throw new UnauthorizedException('Session expired');
      }
    }

    request.user = await this.verifyToken(accessToken);
    request.session = {
      raw,
      email: session.email,
      subject: session.subject,
    };
    return true;
  }

  private async authenticateBearer(request: any): Promise<boolean> {
    const header = request.headers?.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    request.user = await this.verifyToken(token);
    return true;
  }

  private async verifyToken(token: string): Promise<unknown> {
    try {
      const decoded = jwt.decode(token, { complete: true }) as {
        header?: { kid?: string };
      } | null;
      const signingKey = await this.jwks.getSigningKey(decoded?.header?.kid);
      return jwt.verify(token, signingKey.getPublicKey(), {
        algorithms: ['RS256'],
        issuer: this.issuer,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private isNearExpiry(accessToken: string): boolean {
    try {
      const payload = jwt.decode(accessToken) as { exp?: number } | null;
      if (!payload?.exp) {
        return true;
      }
      return payload.exp * 1000 < Date.now() + EXPIRY_SKEW_MS;
    } catch {
      return true;
    }
  }
}
