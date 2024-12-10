/**
 * Pure office-local date utilities (platform-shared copy from the desk-booking
 * service). Half-open intervals throughout: [start, end).
 */
export interface Interval {
  start: number;
  end: number;
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function mergeIntervals(xs: Interval[]): Interval[] {
  const sorted = [...xs].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

export function freeGaps(busy: Interval[], window: Interval): Interval[] {
  const merged = mergeIntervals(busy.filter((b) => intervalsOverlap(b, window)));
  const gaps: Interval[] = [];
  let cur = window.start;
  for (const b of merged) {
    if (b.start > cur) gaps.push({ start: cur, end: Math.min(b.start, window.end) });
    cur = Math.max(cur, b.end);
  }
  if (cur < window.end) gaps.push({ start: cur, end: window.end });
  return gaps;
}

export function snapTo(minutes: number, slot: number, mode: 'floor' | 'ceil' = 'floor'): number {
  return (mode === 'floor' ? Math.floor : Math.ceil)(minutes / slot) * slot;
}
