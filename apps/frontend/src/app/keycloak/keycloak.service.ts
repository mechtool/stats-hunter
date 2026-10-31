import { Injectable } from '@angular/core';
import Keycloak from 'keycloak-js';

/**
 * Thin wrapper over the official Keycloak JS adapter (OIDC Authorization Code + PKCE).
 */
@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private readonly keycloak: Keycloak;

  constructor() {
    this.keycloak = new Keycloak({
      url: 'http://localhost:8080',
      realm: 'stats-hunter',
      clientId: 'stats-hunter-frontend',
    });
  }

  init(): Promise<boolean> {
    return this.keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
    });
  }

  login(): Promise<void> {
    return this.keycloak.login({
      redirectUri: `${window.location.origin}/login`,
    });
  }

  register(): Promise<void> {
    return this.keycloak.register({
      redirectUri: `${window.location.origin}/login`,
    });
  }

  logout(): Promise<void> {
    return this.keycloak.logout({
      redirectUri: `${window.location.origin}/login`,
    });
  }

  isAuthenticated(): boolean {
    return this.keycloak.authenticated ?? false;
  }

  get token(): string | undefined {
    return this.keycloak.token;
  }

  get profile(): Record<string, string> {
    return (this.keycloak.tokenParsed ?? {}) as Record<string, string>;
  }
}
