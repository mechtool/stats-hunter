import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// Register the service worker. This is the browser-only entry point; it is
// not executed during build-time prerendering (which uses main.server.ts).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('ngsw-worker.js')
    .catch((err) => console.error('Service worker registration failed', err));
}
