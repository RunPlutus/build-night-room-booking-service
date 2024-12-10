import { Router } from 'express';
import { deprecated } from '../../middleware/deprecation';

/** v1 retired in 1.0 (ADR-0003). Returns 410 so old kiosks get a clear signal. */
export function v1Routes(): Router {
  const r = Router();
  r.use(deprecated('Mon, 01 Sep 2025 00:00:00 GMT'));
  r.all('*', (_req, res) => res.status(410).json({ error: { code: 'GONE', message: 'API v1 has been retired. Use /api.' } }));
  return r;
}
