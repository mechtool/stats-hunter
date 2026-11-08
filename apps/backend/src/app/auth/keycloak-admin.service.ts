import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KeycloakUser {
  id: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
}

/**
 * Keycloak Admin API helpers (service-user based). Used for existence checks
 * that the OIDC token endpoint intentionally does not reveal.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly serviceUser: string;
  private readonly servicePassword: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('KEYCLOAK_URL') ?? 'http://localhost:8080';
    this.realm = config.get('KEYCLOAK_REALM') ?? 'stats-hunter';
    this.serviceUser = config.get('KEYCLOAK_SERVICE_USER') ?? 'svc-user-admin';
    this.servicePassword = config.get('KEYCLOAK_SERVICE_PASSWORD') ?? '';
  }

  /**
   * Returns the user, or `null` when definitively not found. Throws when the
   * Admin API call itself fails (so callers can distinguish "not found" from
   * "lookup unavailable").
   */
  async findUserByEmail(email: string): Promise<KeycloakUser | null> {
    const token = await this.serviceToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users?search=${encodeURIComponent(email)}&max=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error('Keycloak admin request failed');
    }

    const users = (await res.json()) as KeycloakUser[];
    return (
      users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ??
      null
    );
  }

  private async serviceToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.serviceUser,
      password: this.servicePassword,
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
      throw new Error('Keycloak admin auth failed');
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
}
