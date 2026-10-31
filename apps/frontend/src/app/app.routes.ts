import { Route } from '@angular/router';
import { LoginComponent } from '../components/keycloak/login/login';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginComponent },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
