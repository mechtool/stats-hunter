import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Server-side OIDC token client for the BFF login flow. Uses the confidential
 * `stats-hunter-bff` client (direct access grants enabled) so the browser never
 * talks to the Keycloak token endpoint and never sees the client secret.
 */
@Injectable()
export class KeycloakTokenService {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('KEYCLOAK_URL') ?? 'http://localhost:8080';
    this.realm = config.get('KEYCLOAK_REALM') ?? 'stats-hunter';
    this.clientId = config.get('KEYCLOAK_BFF_CLIENT_ID') ?? 'stats-hunter-bff';
    this.clientSecret = config.get('KEYCLOAK_BFF_CLIENT_SECRET') ?? '';
  }

  private get tokenUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
  }

  async passwordGrant(email: string, password: string): Promise<TokenSet> {
    return this.exchange(
      new URLSearchParams({
        grant_type: 'password',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: email,
        password,
        scope: 'openid',
      }),
    );
  }

  async refreshGrant(refreshToken: string): Promise<TokenSet> {
    return this.exchange(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    );
  }

  private async exchange(body: URLSearchParams): Promise<TokenSet> {
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error('Не удалось выполнить вход');
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresIn: data.expires_in ?? 300,
    };
  }
}
