import { describe, expect, it } from 'vitest';
import { overlaps } from '../../src/scheduling/overlap';
import { lastOccurrenceStart, occurrences, Recurrence, seriesLimit, stepMinutes } from '../../src/scheduling/recurrence';
import { formatLocal, MINUTES_PER_DAY, parseDate, parseLocal } from '../../src/scheduling/time';
import { validateBookingInput } from '../../src/services/BookingValidator';
import { DEFAULT_POLICIES } from '../../src/config/policies';
import { ValidationError } from '../../src/errors';

const first = '2026-11-03T10:00';
const end = '2026-11-03T11:00';
const booking = (recurrence?: Recurrence | null) => ({ start: first, end, recurrence });
const input = (recurrence?: unknown) => ({ ...booking(), roomId: 'test', title: ' Meeting ', organizer: 'test@example.com', recurrence });

describe('complete, bounded office-local scheduling', () => {
  it('allows adjacency in both orders and preserves real overlap', () => {
    const a = { start: 600, end: 660 };
    const b = { start: 660, end: 720 };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
    for (const c of [a, { start: 615, end: 645 }, { start: 645, end: 675 }]) {
      expect(overlaps(a, c)).toBe(true);
      expect(overlaps(c, a)).toBe(true);
    }
  });

  it.each(['DAILY', 'WEEKLY'] as const)('expands every %s occurrence and computes arithmetic helpers', (freq) => {
    for (const count of [1, 8, 9, 12]) {
      const recurrence = { freq, count };
      const all = occurrences(booking(recurrence));
      expect(all).toHaveLength(count);
      all.forEach((span, i) => expect(span).toEqual({ start: parseLocal(first) + i * stepMinutes(recurrence), end: parseLocal(end) + i * stepMinutes(recurrence) }));
      expect(lastOccurrenceStart(booking(recurrence))).toBe(all.at(-1)!.start);
      expect(seriesLimit(parseLocal(first), recurrence)).toBe(parseLocal(first) + count * stepMinutes(recurrence));
    }
  });

  it('includes until dates, including same-day and cross-midnight endpoints', () => {
    expect(occurrences(booking({ freq: 'DAILY', until: '2026-11-03' }))).toHaveLength(1);
    expect(validateBookingInput(input({ freq: 'DAILY', until: '2026-11-03' }), DEFAULT_POLICIES).title).toBe('Meeting');
    const all = occurrences({ start: '2026-11-03T23:30', end: '2026-11-04T00:30', recurrence: { freq: 'DAILY', until: '2026-11-12' } });
    expect(all).toHaveLength(10);
    expect(formatLocal(all.at(-1)!.end)).toBe('2026-11-13T00:30');
    expect(seriesLimit(parseLocal(first), { freq: 'DAILY', until: '2026-11-03' })).toBe(parseDate('2026-11-04'));
  });

  it('honors intervals, nonaligned until, and the earlier of two validated bounds', () => {
    expect(occurrences(booking({ freq: 'DAILY', interval: 3, until: '2026-11-13' }))).toHaveLength(4);
    expect(occurrences(booking({ freq: 'WEEKLY', interval: 2, count: 12, until: '2026-12-01' }))).toHaveLength(3);
    expect(occurrences(booking({ freq: 'DAILY', count: 2, until: '2028-01-01' }))).toHaveLength(2);
    expect(validateBookingInput(input({ freq: 'DAILY', count: 2, until: '2028-01-01' }), DEFAULT_POLICIES).recurrence?.count).toBe(2);
  });

  it.each([{ freq: 'DAILY', count: 367 }, { freq: 'WEEKLY', count: 53 }, { freq: 'DAILY', interval: 200, until: '2027-11-05' }])('uses actual first-to-last horizon: %j', (recurrence) => {
    const b = booking(recurrence as Recurrence);
    expect(lastOccurrenceStart(b) - parseLocal(first)).toBeLessThanOrEqual(366 * MINUTES_PER_DAY);
    expect(() => validateBookingInput(input(recurrence), DEFAULT_POLICIES)).not.toThrow();
  });

  it.each([{ freq: 'DAILY', count: 368 }, { freq: 'WEEKLY', count: 54 }])('rejects actual horizon overflow: %j', (recurrence) => {
    expect(() => occurrences(booking(recurrence as Recurrence))).toThrow(ValidationError);
    expect(() => validateBookingInput(input(recurrence), DEFAULT_POLICIES)).toThrow(ValidationError);
  });

  it.each([undefined, null])('preserves one-off recurrence %s', (recurrence) => {
    expect(occurrences(booking(recurrence))).toEqual([{ start: parseLocal(first), end: parseLocal(end) }]);
    expect(lastOccurrenceStart(booking(recurrence))).toBe(parseLocal(first));
    expect(validateBookingInput(input(recurrence), DEFAULT_POLICIES).recurrence).toBeNull();
  });

  it.each([0, -1, 1.5, true, '2', {}, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, null])('rejects malformed count %s even with valid until', (count) => {
    const recurrence = { freq: 'DAILY', count, until: '2026-11-04' };
    expect(() => occurrences(booking(recurrence as Recurrence))).toThrow(ValidationError);
    expect(() => validateBookingInput(input(recurrence), DEFAULT_POLICIES)).toThrow(ValidationError);
  });

  it.each([[], 'DAILY', true, { freq: 'MONTHLY', count: 1 }, { freq: 'DAILY' }, { freq: 'DAILY', interval: 0, count: 1 }, { freq: 'DAILY', interval: Number.MAX_SAFE_INTEGER, count: 1 }, { freq: 'DAILY', count: Number.MAX_SAFE_INTEGER }, { freq: 'DAILY', until: ['2026-11-04'] }, { freq: 'DAILY', count: 1, until: '2026-02-30' }, { freq: 'DAILY', until: '2026-11-02' }])('rejects unsupported or unbounded direct recurrence %j', (recurrence) => {
    expect(() => occurrences(booking(recurrence as Recurrence))).toThrow(ValidationError);
    expect(() => validateBookingInput(input(recurrence), DEFAULT_POLICIES)).toThrow(ValidationError);
  });

  it('rejects coercible timestamp/date objects and handles leap days', () => {
    for (const value of [[first], { toString: () => first }, 1, null, undefined]) expect(() => parseLocal(value as string)).toThrow(ValidationError);
    expect(() => parseDate(['2026-11-03'] as unknown as string)).toThrow(ValidationError);
    expect(formatLocal(parseLocal('2028-02-29T10:00'))).toBe('2028-02-29T10:00');
    expect(() => parseLocal('2027-02-29T10:00')).toThrow(ValidationError);
    expect(formatLocal(parseLocal('2026-03-08T02:30'))).toBe('2026-03-08T02:30');
  });

  it('applies a stricter configured policy after shared arithmetic validation', () => {
    expect(() => validateBookingInput(input({ freq: 'DAILY', count: 3 }), { ...DEFAULT_POLICIES, maxSeriesDays: 1 })).toThrow(ValidationError);
    expect(() => validateBookingInput(input({ freq: 'DAILY', count: 2 }), { ...DEFAULT_POLICIES, maxSeriesDays: 1 })).not.toThrow();
  });

  it('validates helpers without expanding and rejects unsafe bound arithmetic', () => {
    expect(stepMinutes({ freq: 'WEEKLY', interval: 3 })).toBe(21 * MINUTES_PER_DAY);
    expect(() => stepMinutes({ freq: 'DAILY', interval: '2' } as unknown as Recurrence)).toThrow(ValidationError);
    expect(() => seriesLimit(Number.MAX_SAFE_INTEGER, { freq: 'DAILY', count: 1 })).toThrow(ValidationError);
    expect(() => seriesLimit(parseLocal(first), { freq: 'DAILY', count: 1, until: 'bad' })).toThrow(ValidationError);
    expect(() => lastOccurrenceStart(booking({ freq: 'DAILY' }))).toThrow(ValidationError);
  });

  it('rejects a final occurrence that cannot use the four-digit local timestamp format', () => {
    const b = { start: '9999-12-31T10:00', end: '9999-12-31T11:00', recurrence: { freq: 'DAILY' as const, count: 2 } };
    expect(() => occurrences(b)).toThrow(ValidationError);
    expect(() => lastOccurrenceStart(b)).toThrow(ValidationError);
  });
});
