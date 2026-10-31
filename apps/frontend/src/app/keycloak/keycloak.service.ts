import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const KC_URL = 'http://localhost:8080/realms/stats-hunter';
const CLIENT_ID = 'stats-hunter-frontend';
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
      client_id: CLIENT_ID,
      username: email,
      password,
      scope: 'openid',
    });

    const res = await fetch(`${KC_URL}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      throw new Error('Неверный email или пароль');
    }

    const data = (await res.json()) as { access_token: string };
    this.accessToken = data.access_token;
    this.email = email;
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(EMAIL_KEY, email);
  }

  async register(name: string, email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/register', { name, email, password }),
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
