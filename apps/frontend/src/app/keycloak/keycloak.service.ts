import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'stats-hunter.access_token';
const EMAIL_KEY = 'stats-hunter.email';

/**
 * Custom login/registration against Keycloak, without redirecting to the
 * hosted Keycloak pages: login uses Resource Owner Password grant, registration
 * goes through our backend (which uses the Keycloak Admin API).
 */
@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private accessToken: string | null =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;

  private email: string | null =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(EMAIL_KEY)
      : null;

  private readonly http = inject(HttpClient);

  async login(email: string, password: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: environment.keycloakClientId,
      username: email,
      password,
      scope: 'openid',
    });

    const res = await fetch(
      `${environment.keycloakUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      let message = 'Неверный email или пароль';
      try {
        const data = (await res.json()) as {
          error?: string;
          error_description?: string;
        };
        const description = (data.error_description ?? '').toLowerCase();
        if (description.includes('not fully set up')) {
          message = 'Аккаунт не полностью настроен';
        } else if (description.includes('invalid user credentials')) {
          message = 'Неверный email или пароль';
        } else if (data.error_description) {
          message = data.error_description;
        }
      } catch {
        // keep the generic message when the response body cannot be parsed
      }
      throw new Error(message);
    }

    const data = (await res.json()) as { access_token: string };
    this.accessToken = data.access_token;
    this.email = email;
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(EMAIL_KEY, email);
  }

  async register(email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/register', { email, password }),
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/forgot-password', { email }),
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/reset-password', { token, password }),
    );
  }

  logout(): void {
    this.accessToken = null;
    this.email = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  get token(): string | null {
    return this.accessToken;
  }

  get userEmail(): string | null {
    return this.email;
  }
}
