import express, { Express } from 'express';
import { buildContainer, AppOptions } from './container/bootstrap';
import { TOKENS } from './container/tokens';
import { buildRouter } from './routes';
import { requestId } from './middleware/requestId';
import { userHeader } from './middleware/userHeader';
import { apiKeyAuth, keysFromEnv } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { requestMetrics } from './middleware/requestMetrics';
import { errorHandler, notFound } from './middleware/errorHandler';

/**
 * Builds the Express app. Tests use this directly via supertest.
 *
 * Keep this signature stable: createApp(options?) => Express.
 * Pass the same `db` to several createApp() calls to simulate multiple
 * replicas sharing one database (that's how production runs: 3+ Cloud Run
 * instances on one Cloud SQL database).
 */
export function createApp(opts: AppOptions = {}): Express {
  const c = buildContainer(opts);
  const cfg = c.resolve(TOKENS.Config);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use(requestId);
  app.use(requestMetrics(true));
  app.use(userHeader(cfg.features.userHeaderWarning));
  app.use(apiKeyAuth({ enabled: cfg.auth.enabled, headerName: cfg.auth.headerName, keys: keysFromEnv(process.env) }));
  app.use(rateLimit({ capacity: 120, refillPerSec: 2, enabled: process.env.NODE_ENV === 'production' }));
  app.use(buildRouter(c));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
