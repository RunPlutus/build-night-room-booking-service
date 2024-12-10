import { logger } from '../logging/logger';
import { GoogleCalendarProvider } from './google/GoogleCalendarProvider';
import { CalendarProvider } from './types';

const INTERVAL_MS = 5 * 60_000;
let last = new Date(Date.now() - INTERVAL_MS).toISOString();

/** Polls room calendars for external changes. Writes are disabled (read-only mirror). */
export function startCalendarSync(env = process.env): NodeJS.Timeout | undefined {
  if (!env.GOOGLE_SYNC_TOKEN || !env.GOOGLE_ROOM_CALENDARS) {
    logger.warn('calendar sync enabled but GOOGLE_SYNC_TOKEN / GOOGLE_ROOM_CALENDARS not set; skipping');
    return undefined;
  }
  const provider: CalendarProvider = new GoogleCalendarProvider(env.GOOGLE_SYNC_TOKEN);
  const calendars = env.GOOGLE_ROOM_CALENDARS.split(',');
  const t = setInterval(async () => {
    const since = last;
    last = new Date().toISOString();
    for (const cal of calendars) {
      const changes = await provider.listChanges(cal, since);
      logger.info('calendar sync', { calendar: cal, changes: changes.length });
    }
  }, INTERVAL_MS);
  t.unref();
  return t;
}
