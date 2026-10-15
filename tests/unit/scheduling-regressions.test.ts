import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { overlaps } from '../../src/scheduling/overlap';
import { lastOccurrenceStart, occurrences, Schedulable } from '../../src/scheduling/recurrence';
import { formatLocal, parseLocal } from '../../src/scheduling/time';
import { availability, book, booking, freshApp } from '../helpers/app';

const weekly: Schedulable = {
  start: '2027-01-04T09:30',
  end: '2027-01-04T10:15',
  recurrence: { freq: 'WEEKLY', count: 12 },
};

describe('shared scheduling regression coverage', () => {
  it.each([false, true])('allows half-open adjacency (reverse order: %s)', (reverse) => {
    const before = { start: parseLocal('2027-01-04T14:00'), end: parseLocal('2027-01-04T15:00') };
    const after = { start: parseLocal('2027-01-04T15:00'), end: parseLocal('2027-01-04T16:00') };
    expect(reverse ? overlaps(after, before) : overlaps(before, after)).toBe(false);
  });

  it.each([
    [885, 945],
    [855, 885],
    [840, 900],
  ])('still detects actual shared time for [%s, %s)', (start, end) => {
    expect(overlaps({ start: 840, end: 900 }, { start, end })).toBe(true);
    expect(overlaps({ start, end }, { start: 840, end: 900 })).toBe(true);
  });

  it('expands every weekly occurrence and preserves its duration', () => {
    const all = occurrences(weekly);
    expect(all).toHaveLength(12);
    expect(all.at(-1)).toEqual({ start: parseLocal('2027-03-22T09:30'), end: parseLocal('2027-03-22T10:15') });
    expect(new Set(all.map((o) => o.end - o.start))).toEqual(new Set([45]));
  });

  it('reports the actual last start for a long series', () => {
    expect(formatLocal(lastOccurrenceStart(weekly))).toBe('2027-03-22T09:30');
  });

  it('includes the final date of a daily series after the eighth day', () => {
    const all = occurrences({ ...weekly, recurrence: { freq: 'DAILY', until: '2027-01-13' } });
    expect(all).toHaveLength(10);
    expect(formatLocal(all.at(-1)!.start)).toBe('2027-01-13T09:30');
  });

  it('respects the interval and the earlier of count and until', () => {
    const all = occurrences({ ...weekly, recurrence: { freq: 'WEEKLY', interval: 2, count: 20, until: '2027-06-07' } });
    expect(all).toHaveLength(12);
    expect(formatLocal(all[1].start)).toBe('2027-01-18T09:30');
    expect(formatLocal(all.at(-1)!.start)).toBe('2027-06-07T09:30');
    expect(occurrences({ ...weekly, recurrence: { freq: 'WEEKLY', count: 12, until: '2027-12-31' } })).toHaveLength(12);
  });

  it('covers a daily series spanning the full 366-day policy horizon', () => {
    const all = occurrences({ start: '2026-01-01T10:00', end: '2026-01-01T11:00', recurrence: { freq: 'DAILY', count: 367 } });
    expect(all).toHaveLength(367);
    expect(formatLocal(all.at(-1)!.start)).toBe('2027-01-02T10:00');
  });

  it.each([
    { freq: 'DAILY' as const },
    { freq: 'DAILY' as const, count: 2, interval: 0 },
    { freq: 'DAILY' as const, count: 2, interval: Number.POSITIVE_INFINITY },
    { freq: 'DAILY' as const, count: 2, interval: Number.MIN_VALUE },
  ])('rejects unsafe or unbounded expansion: %j', (recurrence) => {
    expect(() => occurrences({ ...weekly, recurrence })).toThrow();
  });
});

describe('scheduling through the public API', () => {
  it('accepts consecutive bookings without changing their requested endpoints', async () => {
    const app = freshApp();
    await book(app, booking('rm-rainier', '2027-01-04T14:00', '2027-01-04T15:00')).expect(201);
    const adjacent = await book(app, booking('rm-rainier', '2027-01-04T15:00', '2027-01-04T16:00')).expect(201);
    expect(adjacent.body).toMatchObject({ start: '2027-01-04T15:00', end: '2027-01-04T16:00' });
    await book(app, booking('rm-rainier', '2027-01-04T14:45', '2027-01-04T15:15')).expect(409);
  });

  it('blocks a clash with the last occurrence and returns that occurrence in calendar queries', async () => {
    const app = freshApp();
    const created = await book(app, booking('rm-rainier', weekly.start, weekly.end, { recurrence: weekly.recurrence })).expect(201);
    const conflict = await book(app, booking('rm-rainier', '2027-03-22T09:45', '2027-03-22T10:00')).expect(409);
    expect(conflict.body.error.details).toContainEqual(expect.objectContaining({ bookingId: created.body.id, start: '2027-03-22T09:30' }));
    const day = await availability(app, 'rm-rainier', '2027-03-22').expect(200);
    expect(day.body.busy).toEqual([expect.objectContaining({ bookingId: created.body.id, start: '2027-03-22T09:30', end: '2027-03-22T10:15' })]);
    const range = await request(app).get('/api/bookings').query({ roomId: 'rm-rainier', from: '2027-03-22', to: '2027-03-22' }).expect(200);
    expect(range.body.occurrences).toEqual([expect.objectContaining({ bookingId: created.body.id, start: '2027-03-22T09:30' })]);
    await book(app, booking('rm-rainier', '2027-03-29T09:30', '2027-03-29T10:15')).expect(201);
  });

  it('checks later occurrences when creating a new series', async () => {
    const app = freshApp();
    const existing = await book(app, booking('rm-rainier', '2027-03-22T09:45', '2027-03-22T10:00')).expect(201);
    const conflict = await book(app, booking('rm-rainier', weekly.start, weekly.end, { recurrence: weekly.recurrence })).expect(409);
    expect(conflict.body.error.details).toContainEqual(expect.objectContaining({ bookingId: existing.body.id }));
  });
});
