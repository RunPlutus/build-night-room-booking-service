import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors';
import { logger } from '../logging/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'malformed JSON' } });
  }
  logger.error('unhandled error', { requestId: req.id, err: String(err), stack: err?.stack });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};
