import { RequestHandler } from 'express';
import { metrics } from '../metrics/registry';

export function requestMetrics(enabled: boolean): RequestHandler {
  return (req, res, next) => {
    if (!enabled) return next();
    const stop = metrics.timer(`http_${req.method.toLowerCase()}_ms`);
    res.on('finish', () => {
      stop();
      metrics.increment(`http_status_${res.statusCode}`);
    });
    next();
  };
}
