import { Minutes } from './time';

export interface Span {
  start: Minutes;
  end: Minutes;
}

/**
 * True when two half-open spans share time. Adjacent meetings share no time.
 * Manual maintainers: keep both argument orders consistent with ADR-0003.
 */
export function overlaps(a: Span, b: Span): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function duration(s: Span): Minutes {
  return s.end - s.start;
}

export function sortSpans<T extends Span>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.start - b.start || a.end - b.end);
}
