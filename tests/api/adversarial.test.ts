import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Database, Queryable } from '../../src/db/Database';
import { BookingRecord, Seed, Tables } from '../../src/db/types';
import { BookingRepository } from '../../src/repositories/BookingRepository';
import { availability, book, booking } from '../helpers/app';

const room = { id: 'current', name: 'Current', floor: 1, capacity: 4, status: 'active' as const, createdAt: '2026-01-01' };
const seed = (bookings: BookingRecord[] = []): Seed => ({
  rooms: [room, { ...room, id: 'middle', status: 'retired', replacedBy: 'current' }, { ...room, id: 'original', status: 'retired', replacedBy: 'middle' }],
  bookings,
});
const record: BookingRecord = {
  ...booking('original', '2026-11-03T23:30', '2026-11-04T00:30'),
  id: 'historical', recurrence: { freq: 'DAILY', count: 12 }, status: 'confirmed', createdAt: '2026-01-01',
} as BookingRecord;
const latch = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

describe('adversarial scheduling and replica boundaries', () => {
  it('cancels a final cross-midnight recurrence through every alias and independent cache', async () => {
    const db = new Database(seed([record]), 0);
    const writer = createApp({ db });
    const reader = createApp({ db });
    for (const app of [writer, reader]) {
      for (const id of ['original', 'middle', 'current']) {
        for (const date of ['2026-11-14', '2026-11-15']) {
          const response = await availability(app, id, date).expect(200);
          expect(response.body.roomId).toBe(id);
          expect(response.body.busy).toContainEqual({ bookingId: record.id, title: record.title, start: '2026-11-14T23:30', end: '2026-11-15T00:30' });
        }
      }
    }
    await request(writer).delete(`/api/bookings/${record.id}`).expect(204);
    for (const app of [writer, reader, createApp({ db })]) {
      for (const id of ['original', 'middle', 'current']) {
        expect((await availability(app, id, '2026-11-15').expect(200)).body.busy).toEqual([]);
        expect((await request(app).get('/api/bookings').query({ roomId: id, from: '2026-11-14', to: '2026-11-15' }).expect(200)).body.occurrences).toEqual([]);
      }
    }
    const history = (await request(reader).get(`/api/bookings/${record.id}`).expect(200)).body;
    expect(history).toMatchObject({ ...record, status: 'cancelled' });
    expect(await new BookingRepository(db).revision('current')).toBe(1);
    await book(reader, booking('current', '2026-11-15T00:00', '2026-11-15T00:30')).expect(201);
    expect((await availability(writer, 'original', '2026-11-15').expect(200)).body.busy).toHaveLength(1);
  });

  it.each(['cancel-first', 'create-first'] as const)('serializes cancellation against replacement creation (%s)', async (ordering) => {
    const entered = latch();
    const release = latch();
    const secondSubmitted = latch();
    class ControlledDatabase extends Database {
      submitted = 0;
      override transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
        const position = ++this.submitted;
        if (position === 2) secondSubmitted.resolve();
        return super.transaction(async (tx) => {
          if (position === 1) { entered.resolve(); await release.promise; }
          return fn(tx);
        });
      }
    }
    const existing = { ...record, roomId: 'current', recurrence: null };
    const db = new ControlledDatabase(seed([existing]), 0);
    const a = createApp({ db });
    const b = createApp({ db });
    const cancel = () => request(a).delete(`/api/bookings/${record.id}`).then((r) => r);
    const create = () => book(b, booking('current', record.start, record.end)).then((r) => r);
    const first = ordering === 'cancel-first' ? cancel() : create();
    await entered.promise;
    const second = ordering === 'cancel-first' ? create() : cancel();
    await secondSubmitted.promise;
    release.resolve();
    const responses = await Promise.all([first, second]);
    expect(responses.map((r) => r.status)).toEqual(ordering === 'cancel-first' ? [204, 201] : [409, 204]);
    const stored = await db.query((t) => [...t.bookings.values()]);
    expect(stored.filter((b) => b.status === 'confirmed')).toHaveLength(ordering === 'cancel-first' ? 1 : 0);
    expect(stored.find((b) => b.id === record.id)?.status).toBe('cancelled');
    expect(await new BookingRepository(db).revision('current')).toBe(ordering === 'cancel-first' ? 2 : 1);
  });

  it('admits only one cross-app contender when a series and one-offs collide on the final overnight occurrence', async () => {
    const db = new Database(seed(), 0);
    const apps = Array.from({ length: 4 }, () => createApp({ db }));
    const bodies = [
      booking('current', record.start, record.end, { recurrence: record.recurrence }),
      booking('current', '2026-11-14T23:45', '2026-11-15T00:15'),
      booking('current', '2026-11-15T00:00', '2026-11-15T00:30'),
      booking('current', '2026-11-14T23:45', '2026-11-15T00:15', { recurrence: { freq: 'DAILY', count: 2 } }),
    ];
    const responses = await Promise.all(apps.map((app, i) => book(app, bodies[i])));
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    for (const response of responses.filter((r) => r.status === 409)) expect(response.body.error.code).toBe('CONFLICT');
    const stored = await db.query((t) => [...t.bookings.values()]);
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('confirmed');
    expect(await new BookingRepository(db).revision('current')).toBe(1);
    for (const app of apps) {
      const view = await availability(app, 'original', '2026-11-15').expect(200);
      expect(new Set(view.body.busy.map((b: { bookingId: string }) => b.bookingId))).toEqual(new Set([stored[0].id]));
    }
  });

  it('invalid input, rejected conflicts and missing cancellations cannot change rows or freshness', async () => {
    const db = new Database(seed([record]), 0);
    const app = createApp({ db });
    const before = await db.query((t) => t);
    for (const extra of [
      { start: { value: record.start } },
      { end: [record.end] },
      { recurrence: { freq: 'DAILY', count: 2, until: null } },
      { recurrence: { freq: 'WEEKLY', interval: 0, count: 1 } },
      { recurrence: { freq: 'DAILY', count: 368 } },
    ]) await book(app, booking('current', record.start, record.end, extra)).expect(400);
    await book(app, booking('current', '2026-11-15T00:00', '2026-11-15T00:30')).expect(409);
    await request(app).delete('/api/bookings/does-not-exist').expect(404);
    expect(await db.query((t) => t)).toEqual(before);
  });

  it.each([undefined, null])('preserves explicit or omitted null one-off shape on create and audit (%s)', async (recurrence) => {
    const db = new Database(seed(), 0);
    const app = createApp({ db });
    const response = await book(app, booking('current', record.start, record.end, { recurrence })).expect(201);
    expect(response.body.recurrence).toBeNull();
    expect(response.headers.location).toBe(`/api/bookings/${response.body.id}`);
    expect((await request(app).get(response.headers.location).expect(200)).body.recurrence).toBeNull();
    expect(await new BookingRepository(db).revision('current')).toBe(1);
  });

  it('rejects a structured availability date before returning a warm cached day', async () => {
    const db = new Database(seed(), 0);
    const app = createApp({ db });
    await availability(app, 'current', '2026-11-15').expect(200);
    const response = await request(app).get('/api/rooms/current/availability?date%5B%5D=2026-11-15');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await new BookingRepository(db).revision('current')).toBe(0);
  });

  it('isolates a captured draft reference and rejects an unawaited query after transaction close', async () => {
    const db = new Database(seed(), 0);
    let captured!: Tables;
    await db.transaction(async (tx) => { await tx.query((t) => { captured = t; }); });
    captured.bookings.set(record.id, record);
    captured.bookingRevisions.set('current', 99);
    expect(await new BookingRepository(db).count()).toBe(0);
    expect(await new BookingRepository(db).revision('current')).toBe(0);
    let pending!: Promise<unknown>;
    await expect(db.transaction(async (tx) => {
      pending = tx.query((t) => { t.bookings.set(record.id, record); });
    })).rejects.toThrow(/pending|await/i);
    await expect(pending).rejects.toThrow(/closed/i);
    expect(await new BookingRepository(db).count()).toBe(0);
  });
});
