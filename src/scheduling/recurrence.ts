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

export function stepMinutes(r: Recurrence): Minutes {
  return (r.freq === 'WEEKLY' ? MINUTES_PER_WEEK : MINUTES_PER_DAY) * (r.interval ?? 1);
}

/** Last instant a series may start an occurrence (exclusive bound). */
export function seriesLimit(first: Minutes, r: Recurrence): Minutes {
  const byUntil = r.until ? parseDate(r.until) + MINUTES_PER_DAY : Number.POSITIVE_INFINITY;
  const byCount = r.count ? first + r.count * stepMinutes(r) : Number.POSITIVE_INFINITY;
  return Math.min(byUntil, byCount);
}

/** Concrete occurrences of a booking (a one-off booking has exactly one). */
export function occurrences(b: Schedulable): Span[] {
  const start = parseLocal(b.start);
  const end = parseLocal(b.end);
  if (!b.recurrence) return [{ start, end }];
  const step = stepMinutes(b.recurrence);
  const limit = seriesLimit(start, b.recurrence);
  const out: Span[] = [];
  for (let i = 0; i < 10_000; i++) {
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
