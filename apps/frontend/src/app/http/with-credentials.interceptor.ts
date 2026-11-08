import { HttpInterceptorFn } from '@angular/common/http';

/**
 * The session cookie is httpOnly and SameSite=Lax; this makes sure browser XHR
 * requests carry it in cross-origin setups. Same-origin deployments (dev proxy,
 * prod nginx) work regardless.
 */
export const withCredentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));
