import { Route } from '@angular/router';
import { LoginComponent } from '../components/keycloak/login/login';
import { RegisterComponent } from '../components/keycloak/register/register';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
