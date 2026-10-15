import { describe, it, expect } from 'vitest';
import { parseLocal, formatLocal, isoWeekday, parseDate } from '../../src/scheduling/time';
import { overlaps } from '../../src/scheduling/overlap';
import { occurrences, seriesLimit } from '../../src/scheduling/recurrence';

const span = (a: string, b: string) => ({ start: parseLocal(a), end: parseLocal(b) });

describe('time', () => {
  it('round-trips', () => {
    expect(formatLocal(parseLocal('2026-11-03T14:15'))).toBe('2026-11-03T14:15');
  });
  it('rejects nonsense', () => {
    expect(() => parseLocal('2026-13-01T10:00')).toThrow();
    expect(() => parseLocal('2026-11-03 10:00')).toThrow();
  });
  it('weekday', () => {
    expect(isoWeekday(parseDate('2026-11-02'))).toBe(1);
  });
});

describe('overlaps', () => {
  it('detects partial overlap', () => {
    expect(overlaps(span('2026-11-03T10:00', '2026-11-03T11:00'), span('2026-11-03T10:30', '2026-11-03T11:30'))).toBe(true);
  });
  it('detects containment', () => {
    expect(overlaps(span('2026-11-03T10:00', '2026-11-03T12:00'), span('2026-11-03T10:30', '2026-11-03T11:00'))).toBe(true);
  });
  it('separate spans do not overlap', () => {
    expect(overlaps(span('2026-11-03T10:00', '2026-11-03T11:00'), span('2026-11-03T13:00', '2026-11-03T14:00'))).toBe(false);
  });
  it('back-to-back spans do not overlap (half-open intervals, FAC-12)', () => {
    const first = span('2026-10-07T14:00', '2026-10-07T15:00');
    const second = span('2026-10-07T15:00', '2026-10-07T16:00');
    expect(overlaps(first, second)).toBe(false);
    expect(overlaps(second, first)).toBe(false);
  });
  it('a one-minute overlap at the boundary is still detected', () => {
    expect(overlaps(span('2026-10-07T14:00', '2026-10-07T15:01'), span('2026-10-07T15:00', '2026-10-07T16:00'))).toBe(true);
  });
});

describe('recurrence', () => {
  it('one-off has a single occurrence', () => {
    expect(occurrences({ start: '2026-11-03T10:00', end: '2026-11-03T11:00' })).toHaveLength(1);
  });
  it('weekly with count', () => {
    const occ = occurrences({ start: '2026-11-03T10:00', end: '2026-11-03T11:00', recurrence: { freq: 'WEEKLY', count: 3 } });
    expect(occ.map((o) => formatLocal(o.start))).toEqual(['2026-11-03T10:00', '2026-11-10T10:00', '2026-11-17T10:00']);
  });
  it('daily until', () => {
    const occ = occurrences({ start: '2026-11-03T10:00', end: '2026-11-03T10:30', recurrence: { freq: 'DAILY', until: '2026-11-05' } });
    expect(occ).toHaveLength(3);
  });
  it('every other week', () => {
    const occ = occurrences({ start: '2026-11-03T10:00', end: '2026-11-03T10:30', recurrence: { freq: 'WEEKLY', interval: 2, count: 2 } });
    expect(formatLocal(occ[1].start)).toBe('2026-11-17T10:00');
  });
  it('expands a weekly series past eight occurrences', () => {
    const occ = occurrences({ start: '2027-01-04T09:30', end: '2027-01-04T10:00', recurrence: { freq: 'WEEKLY', count: 12 } });
    expect(occ).toHaveLength(12);
    expect(formatLocal(occ[11].start)).toBe('2027-03-22T09:30');
  });
  it('includes the final day of a long daily series', () => {
    const occ = occurrences({ start: '2026-11-01T10:00', end: '2026-11-01T10:30', recurrence: { freq: 'DAILY', until: '2026-11-10' } });
    expect(occ).toHaveLength(10);
    expect(formatLocal(occ[9].start)).toBe('2026-11-10T10:00');
  });
  it('covers a full year of weekly meetings', () => {
    const occ = occurrences({ start: '2026-07-07T09:30', end: '2026-07-07T09:45', recurrence: { freq: 'WEEKLY', until: '2027-06-29' } });
    expect(occ).toHaveLength(52);
    expect(formatLocal(occ[occ.length - 1].start)).toBe('2027-06-29T09:30');
  });
  it('series limit', () => {
    expect(seriesLimit(parseLocal('2026-11-03T10:00'), { freq: 'WEEKLY', until: '2026-11-10' })).toBe(parseDate('2026-11-11'));
  });
});
