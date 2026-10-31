import {
  APP_INITIALIZER,
  ApplicationConfig,
  PLATFORM_ID,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideNzI18n, ru_RU } from 'ng-zorro-antd/i18n';
import { appRoutes } from './app.routes';
import { KeycloakService } from './keycloak/keycloak.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideHttpClient(),
    provideAnimations(),
    provideNzI18n(ru_RU),
    {
      provide: APP_INITIALIZER,
      useFactory: (keycloak: KeycloakService, platformId: object) => () =>
        isPlatformBrowser(platformId)
          ? keycloak.init()
          : Promise.resolve(false),
      deps: [KeycloakService, PLATFORM_ID],
      multi: true,
    },
  ],
};
