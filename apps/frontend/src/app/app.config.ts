import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNzI18n, ru_RU } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  EyeInvisibleOutline,
  EyeOutline,
  LockOutline,
  MailOutline,
} from '@ant-design/icons-angular/icons';
import { appRoutes } from './app.routes';
import { withCredentialsInterceptor } from './http/with-credentials.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([withCredentialsInterceptor])),
    provideAnimationsAsync(),
    provideNzI18n(ru_RU),
    provideNzIcons([
      MailOutline,
      LockOutline,
      EyeOutline,
      EyeInvisibleOutline,
    ]),
  ],
};
