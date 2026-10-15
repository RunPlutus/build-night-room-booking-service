import { Span } from './overlap';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK, Minutes, parseDate, parseLocal } from './time';

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

/**
 * Upper bound on occurrences generated per series. Expanding long series on
 * every conflict check was the main cost in PERF-12; meetings further out than
 * this are rare and get caught when they're edited.
 */
export const MAX_OCCURRENCES = 367;

export function stepMinutes(r: Recurrence): Minutes {
  return (r.freq === 'WEEKLY' ? MINUTES_PER_WEEK : MINUTES_PER_DAY) * (r.interval ?? 1);
}

/** Last instant a series may start an occurrence (exclusive bound). */
export function seriesLimit(first: Minutes, r: Recurrence): Minutes {
  const byUntil = r.until ? parseDate(r.until) + MINUTES_PER_DAY : Number.POSITIVE_INFINITY;
  const byCount = r.count ? first + r.count * stepMinutes(r) : Number.POSITIVE_INFINITY;
  return Math.min(byUntil, byCount);
}

/**
 * Concrete occurrences of a booking (a one-off booking has exactly one).
 * Manual maintainers: the output must cover the complete requested series,
 * within the supported booking horizon, for every caller of this module.
 */
export function occurrences(b: Schedulable): Span[] {
  const start = parseLocal(b.start);
  const end = parseLocal(b.end);
  if (!b.recurrence) return [{ start, end }];
  const step = stepMinutes(b.recurrence);
  const limit = seriesLimit(start, b.recurrence);
  const out: Span[] = [];
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const s = start + i * step;
    if (s >= limit) break;
    out.push({ start: s, end: s + (end - start) });
  }
  return out;
}

export function lastOccurrenceStart(b: Schedulable): Minutes {
  const all = occurrences(b);
  return all[all.length - 1].start;
}
