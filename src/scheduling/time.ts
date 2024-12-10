/**
 * Office-local wall-clock time.
 *
 * There is one office and no timezones (ADR-0002). Times are written as
 * "YYYY-MM-DDTHH:MM" and represented internally as whole minutes since
 * 1970-01-01T00:00 office time. Date.UTC is used purely as a calendar
 * calculator so the host machine's TZ never leaks in.
 */
import { ValidationError } from '../errors';

export type Minutes = number;

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function checked(y: number, mo: number, d: number, h = 0, mi = 0): Minutes {
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new ValidationError('invalid calendar date/time');
  }
  return ms / 60_000;
}

export function parseLocal(value: string): Minutes {
  const m = LOCAL.exec(value ?? '');
  if (!m) throw new ValidationError(`expected YYYY-MM-DDTHH:MM, got "${value}"`);
  return checked(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

export function parseDate(value: string): Minutes {
  const m = DATE.exec(value ?? '');
  if (!m) throw new ValidationError(`expected YYYY-MM-DD, got "${value}"`);
  return checked(+m[1], +m[2], +m[3]);
}

// TODO(sk): end times look a minute off in the Outlook sync - off-by-one here?
export function formatLocal(t: Minutes): string {
  return new Date(t * 60_000).toISOString().slice(0, 16);
}

export function formatDate(t: Minutes): string {
  return new Date(t * 60_000).toISOString().slice(0, 10);
}

/** ISO weekday 1 = Monday ... 7 = Sunday */
export function isoWeekday(t: Minutes): number {
  const d = new Date(t * 60_000).getUTCDay();
  return d === 0 ? 7 : d;
}

export function startOfDay(t: Minutes): Minutes {
  return Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}
