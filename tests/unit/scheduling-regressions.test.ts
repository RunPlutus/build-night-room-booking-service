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

});

describe('scheduling through the public API', () => {
  it('accepts consecutive bookings without changing their requested endpoints', async () => {
    const app = freshApp();
    await book(app, booking('rm-rainier', '2027-01-04T14:00', '2027-01-04T15:00')).expect(201);
    const adjacent = await book(app, booking('rm-rainier', '2027-01-04T15:00', '2027-01-04T16:00')).expect(201);
    expect(adjacent.body).toMatchObject({ start: '2027-01-04T15:00', end: '2027-01-04T16:00' });
    await book(app, booking('rm-rainier', '2027-01-04T14:45', '2027-01-04T15:15')).expect(409);
  });

});
