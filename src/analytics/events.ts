/**
 * Product analytics. Events are buffered and flushed to the warehouse by the
 * sidecar (ANALYTICS_ENDPOINT). In dev/test they're dropped.
 */
import { logger } from '../logging/logger';

type Props = Record<string, string | number | boolean | null>;
const buffer: Array<{ name: string; props: Props; at: string }> = [];
const MAX = 500;

export const events = {
  track(name: string, props: Props = {}): void {
    if (!process.env.ANALYTICS_ENDPOINT) return;
    buffer.push({ name, props, at: new Date().toISOString() });
    if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  },
  async flush(): Promise<number> {
    const n = buffer.length;
    if (!n || !process.env.ANALYTICS_ENDPOINT) return 0;
    const batch = buffer.splice(0, n);
    try {
      await fetch(process.env.ANALYTICS_ENDPOINT, { method: 'POST', body: JSON.stringify(batch), headers: { 'content-type': 'application/json' } });
    } catch (err) {
      logger.warn('analytics flush failed', { err: String(err) });
      buffer.unshift(...batch);
    }
    return n;
  },
  pending(): number {
    return buffer.length;
  },
};
