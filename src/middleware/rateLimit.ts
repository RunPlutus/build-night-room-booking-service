import { RequestHandler } from 'express';
import { RateLimitedError } from '../errors';

/**
 * Token bucket per API key (or IP when unauthenticated). In-memory, so limits
 * are per-instance; Cloud Armor enforces the global limit in front of us.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(private readonly capacity: number, private readonly refillPerSec: number, now = Date.now()) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    const elapsed = (now - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  retryAfter(): number {
    return Math.ceil((1 - this.tokens) / this.refillPerSec);
  }
}

export function rateLimit(opts: { capacity: number; refillPerSec: number; enabled?: boolean }): RequestHandler {
  const buckets = new Map<string, TokenBucket>();
  return (req, res, next) => {
    if (opts.enabled === false) return next();
    const key = req.header('x-api-key') ?? req.ip ?? 'anon';
    let b = buckets.get(key);
    if (!b) {
      b = new TokenBucket(opts.capacity, opts.refillPerSec);
      buckets.set(key, b);
    }
    if (!b.take()) {
      res.setHeader('retry-after', String(b.retryAfter()));
      return next(new RateLimitedError(b.retryAfter()));
    }
    next();
  };
}
