import { RequestHandler } from 'express';
import crypto from 'node:crypto';
import { UnauthorizedError } from '../errors';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function apiKeyAuth(opts: { enabled: boolean; headerName: string; keys: string[] }): RequestHandler {
  return (req, _res, next) => {
    if (!opts.enabled) return next();
    if (req.path.startsWith('/health')) return next();
    const presented = req.header(opts.headerName);
    if (!presented || !opts.keys.some((k) => safeEqual(k, presented))) {
      return next(new UnauthorizedError());
    }
    next();
  };
}

export function keysFromEnv(env: NodeJS.ProcessEnv): string[] {
  return (env.API_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
