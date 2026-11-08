export const SESSION_COOKIE_NAME = 'stats-hunter.session';
export const SESSION_COOKIE_PATH = '/api';

export type SessionCookieSameSite = 'lax' | 'strict' | 'none';

export interface SessionCookieOptions {
  secure: boolean;
  sameSite: SessionCookieSameSite;
  /** Lifetime in seconds; omitted for a session cookie. */
  maxAgeSeconds?: number;
}

/**
 * Parses the raw `Cookie` request header into a name/value map.
 * Kept dependency-free; only used for the single session cookie.
 */
export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    const rawValue = part.slice(eq + 1).trim();
    if (!name) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

export function serializeSessionCookie(
  value: string,
  options: SessionCookieOptions,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Path=${SESSION_COOKIE_PATH}`,
    'HttpOnly',
  ];
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAgeSeconds)}`);
  }
  if (options.secure) {
    parts.push('Secure');
  }
  const sameSite =
    options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
  parts.push(`SameSite=${sameSite}`);
  return parts.join('; ');
}

export function clearSessionCookie(options: SessionCookieOptions): string {
  return serializeSessionCookie('', { ...options, maxAgeSeconds: 0 });
}
