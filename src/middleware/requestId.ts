import { RequestHandler } from 'express';
import crypto from 'node:crypto';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    userEmail?: string;
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
