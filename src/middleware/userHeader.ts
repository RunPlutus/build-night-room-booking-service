import { RequestHandler } from 'express';
import { logger } from '../logging/logger';

/**
 * The web app forwards the signed-in user's email in X-User-Email for audit
 * logs. Service-to-service callers (calendar sync, kiosks) don't send it.
 * Bookings always use the `organizer` field in the body, never this header.
 */
export function userHeader(warn: boolean): RequestHandler {
  return (req, _res, next) => {
    const email = req.header('x-user-email');
    if (!email && warn && req.method !== 'GET') {
      logger.warn('X-User-Email header missing; audit entry will be attributed to "anonymous"', { path: req.path, requestId: req.id });
    }
    req.userEmail = email ?? 'anonymous';
    next();
  };
}
