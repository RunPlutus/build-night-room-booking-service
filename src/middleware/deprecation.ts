import { RequestHandler } from 'express';

/** Adds RFC 8594 Deprecation/Sunset headers. */
export function deprecated(sunset: string, link?: string): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('deprecation', 'true');
    res.setHeader('sunset', sunset);
    if (link) res.setHeader('link', `<${link}>; rel="deprecation"`);
    next();
  };
}
