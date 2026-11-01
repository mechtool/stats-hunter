import { Route } from '@angular/router';
import { LoginComponent } from '../components/keycloak/login/login';
import { RegisterComponent } from '../components/keycloak/register/register';
import { ForgotPasswordComponent } from '../components/keycloak/forgot-password/forgot-password';
import { ResetPasswordComponent } from '../components/keycloak/reset-password/reset-password';
import { HomeComponent } from '../components/home/home';
import { authGuard } from './keycloak/auth.guard';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'home', component: HomeComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];
