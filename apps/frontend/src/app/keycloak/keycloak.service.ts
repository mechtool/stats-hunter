import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Auth through our backend (BFF). The browser never talks to Keycloak directly
 * and never stores tokens: the backend holds the Keycloak tokens in a server
 * session and hands back only an httpOnly cookie. This service keeps the
 * current user's email in memory and exposes the session state to the UI.
 */
@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private email: string | null = null;
  private sessionLoaded = false;

  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ email: string }>('/api/auth/login', { email, password }),
    );
    this.email = res.email;
    this.sessionLoaded = true;
  }

  async register(email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/register', { email, password }),
    );
  }

  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/resend-verification', { email }),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ email: string }>('/api/auth/verify-email', { token }),
    );
    this.email = res.email;
    this.sessionLoaded = true;
  }

  async cancelRegistration(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/cancel-registration', { email }),
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/forgot-password', { email }),
    );
  }

  async cancelPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/cancel-password-reset', { email }),
    );
  }

  async validateResetToken(token: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/validate-reset-token', { token }),
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/reset-password', { token, password }),
    );
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Ignore network/server errors — local state must still be cleared.
    }
    this.email = null;
    this.sessionLoaded = true;
  }

  /** Resolves the session once per app lifetime via the httpOnly cookie. */
  async loadSession(): Promise<void> {
    if (this.sessionLoaded) {
      return;
    }
    if (!isPlatformBrowser(this.platformId)) {
      this.sessionLoaded = true;
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.get<{ email: string | null }>('/api/auth/me'),
      );
      this.email = res.email ?? null;
    } catch {
      this.email = null;
    } finally {
      this.sessionLoaded = true;
    }
  }

  isAuthenticated(): boolean {
    return !!this.email;
  }

  get userEmail(): string | null {
    return this.email;
  }
}
