import { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps sync/async handlers so thrown errors reach the error middleware. */
export function handle(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    try {
      const r = fn(req, res, next);
      if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(next);
    } catch (err) {
      next(err);
    }
  };
}
