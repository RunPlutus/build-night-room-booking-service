import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Database } from '../../src/db/Database';
import { App, availability, book, booking } from '../helpers/app';

let app: App;
let db: Database;
beforeEach(() => {
  db = new Database({ rooms: [{ id: 'test', name: 'Test', floor: 1, capacity: 4, status: 'active', createdAt: '2026-01-01T00:00:00Z' }], bookings: [] }, 0);
  app = createApp({ db });
});

describe('scheduling incident regressions', () => {
  it('accepts adjacent recurring meetings and rejects real overlap', async () => {
    await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { recurrence: { freq: 'DAILY', count: 12 } })).expect(201);
    await book(app, booking('test', '2026-11-03T11:00', '2026-11-03T12:00', { recurrence: { freq: 'DAILY', count: 12 } })).expect(201);
    await book(app, booking('test', '2026-11-14T10:45', '2026-11-14T11:15')).expect(409);
  });

  it.each(['2026-11-11', '2026-11-14'])('detects existing late recurrence on %s with full conflict detail', async (date) => {
    const created = await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { title: 'Series', recurrence: { freq: 'DAILY', count: 12 } })).expect(201);
    const response = await book(app, booking('test', `${date}T10:30`, `${date}T11:30`)).expect(409);
    expect(response.body.error).toMatchObject({ code: 'CONFLICT', details: [{ bookingId: created.body.id, title: 'Series', start: `${date}T10:00`, end: `${date}T11:00` }] });
  });

  it('rejects an entire candidate series when only its final occurrence conflicts', async () => {
    const existing = await book(app, booking('test', '2026-11-14T10:30', '2026-11-14T11:30')).expect(201);
    const response = await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { recurrence: { freq: 'DAILY', count: 12 } })).expect(409);
    expect(response.body.error.details[0].bookingId).toBe(existing.body.id);
    expect(await db.query((t) => t.bookings.size)).toBe(1);
  });

  it('detects late series against series and returns only one detail per booking', async () => {
    await book(app, booking('test', '2026-11-14T10:30', '2026-11-14T11:30', { recurrence: { freq: 'WEEKLY', count: 2 } })).expect(201);
    const response = await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { recurrence: { freq: 'DAILY', count: 26 } })).expect(409);
    expect(response.body.error.details).toHaveLength(1);
    expect(response.body.error.details[0].start).toBe('2026-11-14T10:30');
  });

  it('shows final cross-midnight occurrence on both days with original endpoints', async () => {
    const created = await book(app, booking('test', '2026-11-03T23:30', '2026-11-04T00:30', { recurrence: { freq: 'DAILY', count: 12 } })).expect(201);
    for (const date of ['2026-11-14', '2026-11-15']) {
      const response = await availability(app, 'test', date).expect(200);
      expect(response.body.busy).toContainEqual(expect.objectContaining({ bookingId: created.body.id, start: '2026-11-14T23:30', end: '2026-11-15T00:30' }));
    }
    const listed = await request(app).get('/api/bookings').query({ roomId: 'test', from: '2026-11-15', to: '2026-11-15' }).expect(200);
    expect(listed.body.occurrences).toHaveLength(1);
    expect(listed.body.occurrences[0].start).toBe('2026-11-14T23:30');
  });

  it('excludes an occurrence ending at the requested day boundary', async () => {
    await book(app, booking('test', '2026-11-03T23:00', '2026-11-04T00:00')).expect(201);
    const response = await availability(app, 'test', '2026-11-04').expect(200);
    expect(response.body.busy).toEqual([]);
  });

  it.each([{ freq: 'DAILY', count: 367 }, { freq: 'WEEKLY', count: 53 }])('accepts the policy horizon boundary %j', async (recurrence) => {
    await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { recurrence })).expect(201);
  });

  it.each([undefined, null, { freq: 'DAILY', until: '2026-11-03' }, { freq: 'DAILY', count: 2, until: '2028-01-01' }])('accepts valid boundary recurrence %j', async (recurrence) => {
    await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { recurrence })).expect(201);
  });

  it.each([[], 'DAILY', { freq: 'DAILY', count: 0 }, { freq: 'DAILY', count: -1 }, { freq: 'DAILY', count: 1.5 }, { freq: 'DAILY', count: '2' }, { freq: 'DAILY', count: true }, { freq: 'DAILY', count: null, until: '2026-11-04' }, { freq: 'DAILY', count: 1, until: ['2026-11-04'] }, { freq: 'DAILY', count: 1, until: '2026-02-30' }, { freq: 'DAILY', count: 368 }, { freq: 'DAILY', interval: Number.MAX_SAFE_INTEGER, count: 1 }])('rejects malformed recurrence without inserting %j', async (recurrence) => {
    const response = await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { recurrence })).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await db.query((t) => t.bookings.size)).toBe(0);
  });

  it('rejects array timestamps without coercion', async () => {
    await book(app, booking('test', '2026-11-03T10:00', '2026-11-03T11:00', { start: ['2026-11-03T10:00'] })).expect(400);
  });
});
