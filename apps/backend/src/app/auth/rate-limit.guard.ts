import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lightweight fixed-window rate limiter for public auth endpoints.
 * In-memory (per-process), suitable for a single-instance deployment.
 * Configure with RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip: string =
      request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const key = `${context.getClass().name}:${ip}`;
    const now = Date.now();
    const windowMs = Number(this.config.get('RATE_LIMIT_WINDOW_MS') ?? 60_000);
    const max = Number(this.config.get('RATE_LIMIT_MAX') ?? 10);

    this.prune(now);

    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    current.count += 1;
    if (current.count > max) {
      throw new HttpException(
        'Слишком много запросов, попробуйте позже',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private prune(now: number): void {
    // Avoid unbounded growth while keeping the common path allocation-free.
    if (this.buckets.size < 5_000) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
