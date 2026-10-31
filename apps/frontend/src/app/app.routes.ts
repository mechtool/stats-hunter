import { Route } from '@angular/router';
import { LoginComponent } from '../components/keycloak/login/login';
import { RegisterComponent } from '../components/keycloak/register/register';
import { HomeComponent } from '../components/home/home';
import { authGuard } from './keycloak/auth.guard';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'home', component: HomeComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];
