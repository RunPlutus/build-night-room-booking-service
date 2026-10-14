import { describe, expect, it } from 'vitest';
import { overlaps } from '../../src/scheduling/overlap';
import { lastOccurrenceStart, occurrences, Recurrence } from '../../src/scheduling/recurrence';
import { formatLocal } from '../../src/scheduling/time';

const series = (recurrence: Recurrence) => ({
  start: '2027-01-04T09:00',
  end: '2027-01-04T09:45',
  recurrence,
});

describe('complete scheduling contracts', () => {
  it.each([false, true])('allows adjacent spans, reversed=%s', (reverse) => {
    const first = { start: 840, end: 900 };
    const second = { start: 900, end: 960 };
    expect(reverse ? overlaps(second, first) : overlaps(first, second)).toBe(false);
  });

  it('still rejects partial overlaps and containment', () => {
    expect(overlaps({ start: 840, end: 900 }, { start: 885, end: 945 })).toBe(true);
    expect(overlaps({ start: 840, end: 960 }, { start: 870, end: 900 })).toBe(true);
  });

  it('expands seventeen weekly meetings and preserves the final duration', () => {
    const booking = series({ freq: 'WEEKLY', count: 17 });
    const expanded = occurrences(booking);
    expect(expanded).toHaveLength(17);
    expect(formatLocal(expanded.at(-1)!.start)).toBe('2027-04-26T09:00');
    expect(formatLocal(expanded.at(-1)!.end)).toBe('2027-04-26T09:45');
    expect(lastOccurrenceStart(booking)).toBe(expanded.at(-1)!.start);
  });

  it('covers all 367 daily starts in the permitted 366-day span', () => {
    const expanded = occurrences({
      start: '2027-01-01T09:00', end: '2027-01-01T10:00',
      recurrence: { freq: 'DAILY', count: 367 },
    });
    expect(expanded).toHaveLength(367);
    expect(formatLocal(expanded.at(-1)!.start)).toBe('2028-01-02T09:00');
    expect(expanded.every((span) => span.end - span.start === 60)).toBe(true);
  });

  it.each([{ count: 30, expected: 17 }, { count: 3, expected: 3 }])(
    'uses the earlier count/until bound for count=$count', ({ count, expected }) => {
      const expanded = occurrences(series({ freq: 'DAILY', count, until: '2027-01-20' }));
      expect(expanded).toHaveLength(expected);
      expect(formatLocal(expanded.at(-1)!.start)).toBe(count === 30 ? '2027-01-20T09:00' : '2027-01-06T09:00');
    },
  );

  it('keeps the interval when expanding an every-other-week series', () => {
    const expanded = occurrences(series({ freq: 'WEEKLY', interval: 2, count: 12 }));
    expect(expanded).toHaveLength(12);
    expect(formatLocal(expanded.at(-1)!.start)).toBe('2027-06-07T09:00');
  });
});
