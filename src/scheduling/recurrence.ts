import { Span } from './overlap';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK, Minutes, parseDate, parseLocal } from './time';
import { ValidationError } from '../errors';

export type Frequency = 'DAILY' | 'WEEKLY';

export interface Recurrence {
  freq: Frequency;
  /** every N days/weeks; default 1 */
  interval?: number;
  /** last date (inclusive), YYYY-MM-DD */
  until?: string;
  /** total number of occurrences, including the first */
  count?: number;
}

export interface Schedulable {
  start: string;
  end: string;
  recurrence?: Recurrence | null;
}

/** Shared clients support the same first-to-last horizon as Facilities policy. */
export const SUPPORTED_MAX_SERIES_DAYS = 366;

/** Maximum possible daily starts within the supported horizon; never a truncation cap. */
export const MAX_OCCURRENCES = SUPPORTED_MAX_SERIES_DAYS + 1;

function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value)) throw new ValidationError('recurrence arithmetic exceeds the supported integer range');
  return value;
}

function positiveInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`recurrence.${field} must be a positive safe integer`);
  }
}

function checkedStep(r: Recurrence): Minutes {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new ValidationError('recurrence must be an object');
  if (r.freq !== 'DAILY' && r.freq !== 'WEEKLY') throw new ValidationError('recurrence.freq must be DAILY or WEEKLY');
  if (r.interval !== undefined) positiveInteger(r.interval, 'interval');
  return safeInteger((r.freq === 'WEEKLY' ? MINUTES_PER_WEEK : MINUTES_PER_DAY) * (r.interval ?? 1));
}

function checkedSeries(first: Minutes, r: Recurrence) {
  safeInteger(first);
  const step = checkedStep(r);
  if (r.count !== undefined) positiveInteger(r.count, 'count');
  if (r.count === undefined && r.until === undefined) throw new ValidationError('recurrence needs until or count');
  const byUntil = r.until === undefined ? Infinity : safeInteger(parseDate(r.until) + MINUTES_PER_DAY);
  const byCount = r.count === undefined ? Infinity : safeInteger(first + safeInteger(r.count * step));
  const limit = Math.min(byUntil, byCount);
  const count = Math.max(0, Math.ceil(safeInteger(limit - first) / step));
  if (count < 1) throw new ValidationError('recurrence ends before it starts');
  const offset = safeInteger((count - 1) * step);
  const lastStart = safeInteger(first + offset);
  if (offset > SUPPORTED_MAX_SERIES_DAYS * MINUTES_PER_DAY) {
    throw new ValidationError(`recurring series may span at most ${SUPPORTED_MAX_SERIES_DAYS} days`);
  }
  return { step, limit, count, lastStart };
}

export function stepMinutes(r: Recurrence): Minutes {
  return checkedStep(r);
}

/** Last instant a series may start an occurrence (exclusive bound). */
export function seriesLimit(first: Minutes, r: Recurrence): Minutes {
  return checkedSeries(first, r).limit;
}

function checkedBooking(b: Schedulable) {
  const start = parseLocal(b.start);
  const end = parseLocal(b.end);
  if (end <= start) throw new ValidationError('end must be after start');
  const duration = safeInteger(end - start);
  const series = b.recurrence == null ? null : checkedSeries(start, b.recurrence);
  const finalEnd = safeInteger((series?.lastStart ?? start) + duration);
  const finalDate = new Date(finalEnd * 60_000);
  if (!Number.isFinite(finalDate.getTime()) || finalDate.getUTCFullYear() > 9999) {
    throw new ValidationError('recurrence ends outside the supported calendar');
  }
  return { start, end, duration, series };
}

/**
 * Concrete occurrences of a booking (a one-off booking has exactly one).
 * Manual maintainers: the output must cover the complete requested series,
 * within the supported booking horizon, for every caller of this module.
 */
export function occurrences(b: Schedulable): Span[] {
  const { start, end, duration, series } = checkedBooking(b);
  if (!series) return [{ start, end }];
  return Array.from({ length: series.count }, (_, i) => {
    const s = start + i * series.step;
    return { start: s, end: s + duration };
  });
}

export function lastOccurrenceStart(b: Schedulable): Minutes {
  const { start, series } = checkedBooking(b);
  return series?.lastStart ?? start;
}
