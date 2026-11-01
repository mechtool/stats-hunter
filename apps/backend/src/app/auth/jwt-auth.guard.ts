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

/**
 * Validates a Keycloak-issued JWT (RS256) against the realm's JWKS endpoint.
 * Registered as a global guard; routes may opt out with the @Public() decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks: JwksClient;
  private readonly issuer: string;

  constructor(
    config: ConfigService,
    private readonly reflector: Reflector,
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
    const header = request.headers?.authorization as string | undefined;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);
    try {
      const decoded = jwt.decode(token, { complete: true }) as {
        header?: { kid?: string };
      } | null;
      const signingKey = await this.jwks.getSigningKey(decoded?.header?.kid);
      const payload = jwt.verify(token, signingKey.getPublicKey(), {
        algorithms: ['RS256'],
        issuer: this.issuer,
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
