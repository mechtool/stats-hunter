import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { KeycloakService } from './keycloak.service';

export const authGuard: CanActivateFn = async () => {
  const keycloak = inject(KeycloakService);
  const router = inject(Router);

  await keycloak.loadSession();
  if (keycloak.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
